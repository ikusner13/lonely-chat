import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Redacted from "effect/Redacted";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { BotTokenId, BotTokenRecord } from "../../bots/bot-token-record";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import type { BotServiceShape } from "../../bots/Services/bot-service";
import type {
  BotConnection,
  ChannelName,
  ChatMessage,
  PlatformAdapterShape,
} from "../Services/platform-adapter";
import {
  ChatUsername,
  PlatformConnectionError,
  PlatformSendError,
} from "../Services/platform-adapter";
import { KickPlatformAdapter, KickPlatformError } from "../Services/kick-platform-adapter";
import type {
  KickAuthorizationCallbackRequest,
  KickAuthorizationUrlRequest,
  KickPlatformAdapterShape,
  KickTestMessageRequest,
} from "../Services/kick-platform-adapter";
import { KickPlatformConfig } from "../Services/kick-platform-config";
import type { KickPlatformConfigShape } from "../Services/kick-platform-config";

interface KickTokenPayload {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly refreshToken: string;
  readonly scopes: readonly string[];
}

interface KickChatMessageRequest {
  readonly accessToken: string;
  readonly text: string;
}

interface KickCreateEventSubscriptionsRequest {
  readonly accessToken: string;
  readonly events: readonly {
    readonly name: string;
    readonly version: number;
  }[];
}

interface KickDeleteEventSubscriptionsRequest {
  readonly accessToken: string;
  readonly subscriptionIds: readonly string[];
}

interface KickSessionMessage {
  readonly channel: string;
  readonly text: string;
  readonly username: string;
}

interface KickSessionListenerHandle {
  readonly unsubscribe: () => void;
}

interface KickSessionClientShape {
  readonly connect: () => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly onMessage: (
    listener: (message: KickSessionMessage) => void,
  ) => KickSessionListenerHandle;
  readonly sendMessage: (text: string) => Promise<void>;
}

export interface KickAdapterDependencies {
  readonly buildSessionClient: (args: {
    readonly accessToken: string;
    readonly channel: string;
  }) => KickSessionClientShape;
  readonly config: KickPlatformConfigShape;
  readonly createEventSubscriptions: (
    request: KickCreateEventSubscriptionsRequest,
  ) => Promise<readonly string[]>;
  readonly deleteEventSubscriptions: (
    request: KickDeleteEventSubscriptionsRequest,
  ) => Promise<void>;
  readonly exchangeAuthorizationCode: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }) => Promise<KickTokenPayload>;
  readonly now: () => string;
  readonly postChatMessage: (request: KickChatMessageRequest) => Promise<void>;
  readonly refreshAccessToken: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly refreshToken: string;
  }) => Promise<KickTokenPayload>;
}

interface KickAdapterServiceDependencies extends KickAdapterDependencies {
  readonly botService: Pick<BotServiceShape, "getBot" | "getBotToken" | "upsertBotToken">;
}

type KickBotRecord = BotRecord & {
  readonly platform: "kick";
};

const kickAuthorizationEndpoint = "https://id.kick.com/oauth/authorize";
const kickTokenEndpoint = "https://id.kick.com/oauth/token";
const kickChatEndpoint = "https://api.kick.com/public/v1/chat";
const kickEventSubscriptionsEndpoint = "https://api.kick.com/public/v1/events/subscriptions";
const kickMessageBufferCapacity = 128;
const kickChatMessageEvent = {
  name: "chat.message.sent",
  version: 1,
} as const;

const KickTokenResponseSchema = Schema.Struct({
  access_token: Schema.NonEmptyString,
  expires_in: Schema.Number,
  refresh_token: Schema.NonEmptyString,
  scope: Schema.String,
  token_type: Schema.NonEmptyString,
});
type KickTokenResponse = typeof KickTokenResponseSchema.Type;

const KickChatResponseSchema = Schema.Struct({
  data: Schema.optional(
    Schema.Struct({
      is_sent: Schema.Boolean,
      message_id: Schema.String,
    }),
  ),
  message: Schema.optional(Schema.String),
});

const KickEventSubscriptionResponseSchema = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      error: Schema.optional(Schema.String),
      name: Schema.NonEmptyString,
      subscription_id: Schema.optional(Schema.NonEmptyString),
      version: Schema.Number,
    }),
  ),
  message: Schema.String,
});

const splitScopes = (scope: string): readonly string[] =>
  scope
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const expiresAtFromLifetime = (now: string, expiresInSeconds: number): string =>
  new Date(Date.parse(now) + expiresInSeconds * 1000).toISOString();

const decodeKickTokenResponse = Schema.decodeUnknownSync(KickTokenResponseSchema);
const decodeKickChatResponse = Schema.decodeUnknownSync(KickChatResponseSchema);
const decodeKickEventSubscriptionResponse = Schema.decodeUnknownSync(
  KickEventSubscriptionResponseSchema,
);
const normalizeChannel = (channel: string): string =>
  channel.trim().replace(/^#/u, "").toLowerCase();

const kickSessionMessageListeners = new Map<string, Set<(message: KickSessionMessage) => void>>();

export const publishKickSessionMessage = (message: KickSessionMessage): void => {
  const listeners = kickSessionMessageListeners.get(normalizeChannel(message.channel));

  if (listeners === undefined) {
    return;
  }

  for (const listener of listeners) {
    listener(message);
  }
};

const formatResponseError = (body: unknown): string => {
  if (typeof body === "string" && body.length > 0) {
    return body;
  }

  if (body !== null && typeof body === "object") {
    const message = "message" in body ? body["message"] : undefined;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }

    const error = "error" in body ? body["error"] : undefined;

    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }

  return "Unknown Kick API error.";
};

const parseJsonBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
};

const makeTokenPayload = (response: KickTokenResponse, now: string): KickTokenPayload => ({
  accessToken: response.access_token,
  expiresAt: expiresAtFromLifetime(now, response.expires_in),
  refreshToken: response.refresh_token,
  scopes: splitScopes(response.scope),
});

const isKickBot = (bot: BotRecord): bot is KickBotRecord => bot.platform === "kick";

const makeBotTokenRecord = (
  bot: BotRecord,
  payload: KickTokenPayload,
  now: string,
  existingToken?: BotTokenRecord,
): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: payload.accessToken,
    botId: bot.id,
    createdAt: existingToken?.createdAt ?? now,
    expiresAt: payload.expiresAt,
    id: existingToken?.id ?? BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: "kick",
    refreshToken: payload.refreshToken,
    scopes: payload.scopes,
    updatedAt: now,
  });

export const makeLiveDependencies = (config: KickPlatformConfigShape): KickAdapterDependencies => {
  const createEventSubscriptions: KickAdapterDependencies["createEventSubscriptions"] = async ({
    accessToken,
    events,
  }) => {
    const response = await fetch(kickEventSubscriptionsEndpoint, {
      body: JSON.stringify({
        events,
        method: "webhook",
      }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw new Error(`Kick event subscription failed: ${formatResponseError(body)}`);
    }

    const decoded = decodeKickEventSubscriptionResponse(body);

    return decoded.data.map((subscription) => {
      if (subscription.error !== undefined || subscription.subscription_id === undefined) {
        throw new Error(
          subscription.error ?? `Kick event subscription failed for ${subscription.name}.`,
        );
      }

      return subscription.subscription_id;
    });
  };

  const deleteEventSubscriptions: KickAdapterDependencies["deleteEventSubscriptions"] = async ({
    accessToken,
    subscriptionIds,
  }) => {
    const params = new URLSearchParams();

    for (const subscriptionId of subscriptionIds) {
      params.append("id", subscriptionId);
    }

    const response = await fetch(`${kickEventSubscriptionsEndpoint}?${params.toString()}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      method: "DELETE",
    });

    if (response.status === 204) {
      return;
    }

    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw new Error(`Kick event subscription delete failed: ${formatResponseError(body)}`);
    }
  };

  const exchangeAuthorizationCode: KickAdapterDependencies["exchangeAuthorizationCode"] = async ({
    clientId,
    clientSecret,
    code,
    codeVerifier,
    redirectUri,
  }) => {
    const requestedAt = new Date().toISOString();
    const response = await fetch(kickTokenEndpoint, {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw new Error(`Kick authorization failed: ${formatResponseError(body)}`);
    }

    return makeTokenPayload(decodeKickTokenResponse(body), requestedAt);
  };

  const refreshAccessToken: KickAdapterDependencies["refreshAccessToken"] = async ({
    clientId,
    clientSecret,
    refreshToken,
  }) => {
    const requestedAt = new Date().toISOString();
    const response = await fetch(kickTokenEndpoint, {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw new Error(`Kick token refresh failed: ${formatResponseError(body)}`);
    }

    return makeTokenPayload(decodeKickTokenResponse(body), requestedAt);
  };

  const postChatMessage: KickAdapterDependencies["postChatMessage"] = async ({
    accessToken,
    text,
  }) => {
    const response = await fetch(kickChatEndpoint, {
      body: JSON.stringify({
        content: text,
        type: "bot",
      }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const body = await parseJsonBody(response);

    if (!response.ok) {
      throw new Error(`Kick chat send failed: ${formatResponseError(body)}`);
    }

    const decoded = decodeKickChatResponse(body);

    if (decoded.data?.is_sent === false) {
      throw new Error("Kick chat send failed.");
    }
  };

  const buildSessionClient: KickAdapterDependencies["buildSessionClient"] = ({
    accessToken,
    channel,
  }) => ({
    connect: async () => undefined,
    disconnect: async () => undefined,
    onMessage: (listener) => {
      const normalizedChannel = normalizeChannel(channel);
      const existingListeners = kickSessionMessageListeners.get(normalizedChannel) ?? new Set();

      existingListeners.add(listener);
      kickSessionMessageListeners.set(normalizedChannel, existingListeners);

      return {
        unsubscribe: () => {
          const listeners = kickSessionMessageListeners.get(normalizedChannel);

          if (listeners === undefined) {
            return;
          }

          listeners.delete(listener);

          if (listeners.size === 0) {
            kickSessionMessageListeners.delete(normalizedChannel);
          }
        },
      };
    },
    sendMessage: async (text) =>
      postChatMessage({
        accessToken,
        text,
      }),
  });

  return {
    buildSessionClient,
    config,
    createEventSubscriptions,
    deleteEventSubscriptions,
    exchangeAuthorizationCode,
    now: () => new Date().toISOString(),
    postChatMessage,
    refreshAccessToken,
  };
};

export const makeKickPlatformAdapter = (
  dependencies: KickAdapterServiceDependencies,
): Effect.Effect<KickPlatformAdapterShape> => {
  const catchBotServiceError = <A>(
    effect: Effect.Effect<A, SqlError>,
    reason: string,
  ): Effect.Effect<A, KickPlatformError> =>
    effect.pipe(
      Effect.mapError(
        (cause) =>
          new KickPlatformError({
            cause,
            reason,
          }),
      ),
    );

  const getKickBot = Effect.fn("KickPlatformAdapter.getKickBot")(function* getKickBotEffect(
    botId: BotRecord["id"],
  ) {
    const bot = yield* catchBotServiceError(
      dependencies.botService.getBot(botId),
      "Could not load Kick bot configuration.",
    );

    if (bot === null || !isKickBot(bot)) {
      return yield* Effect.fail(
        new KickPlatformError({
          reason: "Kick bot not found.",
        }),
      );
    }

    return bot;
  });

  const getAuthorizationUrl = Effect.fn("KickPlatformAdapter.getAuthorizationUrl")(
    function* getAuthorizationUrlEffect(request: KickAuthorizationUrlRequest) {
      yield* getKickBot(request.botId);

      const params = new URLSearchParams({
        client_id: dependencies.config.clientId,
        code_challenge: request.codeChallenge,
        code_challenge_method: "S256",
        redirect_uri: dependencies.config.redirectUri,
        response_type: "code",
        scope: dependencies.config.scopes.join(" "),
        state: request.state,
      });

      return `${kickAuthorizationEndpoint}?${params.toString()}`;
    },
  );

  const completeAuthorization = Effect.fn("KickPlatformAdapter.completeAuthorization")(
    function* completeAuthorizationEffect(request: KickAuthorizationCallbackRequest) {
      const bot = yield* getKickBot(request.botId);
      const now = dependencies.now();
      const token = yield* Effect.tryPromise({
        catch: (cause) =>
          new KickPlatformError({
            cause,
            reason: "Kick authorization failed.",
          }),
        try: async () => {
          const payload = await dependencies.exchangeAuthorizationCode({
            clientId: dependencies.config.clientId,
            clientSecret: Redacted.value(dependencies.config.clientSecret),
            code: request.code,
            codeVerifier: request.codeVerifier,
            redirectUri: dependencies.config.redirectUri,
          });

          return makeBotTokenRecord(bot, payload, now);
        },
      });

      return yield* catchBotServiceError(
        dependencies.botService.upsertBotToken(token),
        "Could not save Kick bot credentials.",
      );
    },
  );

  const sendTestMessage = Effect.fn("KickPlatformAdapter.sendTestMessage")(
    function* sendTestMessageEffect(request: KickTestMessageRequest) {
      const bot = yield* getKickBot(request.botId);
      const token = yield* catchBotServiceError(
        dependencies.botService.getBotToken(bot.id),
        "Could not load Kick bot credentials.",
      );

      if (token === null) {
        return yield* Effect.fail(
          new KickPlatformError({
            reason: "Authorize this Kick bot before sending a test message.",
          }),
        );
      }

      const now = dependencies.now();
      const tokenToUse =
        token.expiresAt <= now
          ? yield* Effect.tryPromise({
              catch: (cause) =>
                new KickPlatformError({
                  cause,
                  reason: "Kick token refresh failed.",
                }),
              try: async () => {
                const payload = await dependencies.refreshAccessToken({
                  clientId: dependencies.config.clientId,
                  clientSecret: Redacted.value(dependencies.config.clientSecret),
                  refreshToken: token.refreshToken,
                });

                return makeBotTokenRecord(bot, payload, now, token);
              },
            })
          : token;

      if (tokenToUse !== token) {
        yield* catchBotServiceError(
          dependencies.botService.upsertBotToken(tokenToUse),
          "Could not save refreshed Kick bot credentials.",
        );
      }

      yield* Effect.tryPromise({
        catch: (cause) =>
          new KickPlatformError({
            cause,
            reason: "Kick test message failed.",
          }),
        try: () =>
          dependencies.postChatMessage({
            accessToken: tokenToUse.accessToken,
            text: request.text,
          }),
      });

      return tokenToUse;
    },
  );

  return Effect.succeed({
    completeAuthorization,
    getAuthorizationUrl,
    sendTestMessage,
  } satisfies KickPlatformAdapterShape);
};

interface ConnectedKickBot {
  readonly bot: BotConnection;
  readonly client: KickSessionClientShape;
}

interface ChannelListener {
  readonly botId: BotConnection["botId"];
  readonly channel: string;
  readonly stopListening: () => void;
}

interface ChannelSubscription {
  readonly channel: string;
  readonly subscriptionIds: readonly string[];
}

const makePlatformConnectionError = (
  bot: BotConnection,
  cause?: unknown,
): PlatformConnectionError =>
  new PlatformConnectionError({
    botId: bot.botId,
    cause,
    platform: bot.platform,
  });

const makePlatformSendError = (bot: BotConnection, cause?: unknown): PlatformSendError =>
  new PlatformSendError({
    cause,
    channel: bot.channel,
    platform: bot.platform,
  });

export const makeKickSessionPlatformAdapter = (
  dependencies: KickAdapterServiceDependencies,
): Effect.Effect<PlatformAdapterShape> =>
  Effect.gen(function* makeKickSessionPlatformAdapterEffect() {
    const connectedBotsRef = yield* Ref.make<readonly ConnectedKickBot[]>([]);
    const channelListenersRef = yield* Ref.make<readonly ChannelListener[]>([]);
    const channelSubscriptionsRef = yield* Ref.make<readonly ChannelSubscription[]>([]);
    const messagesPubSub = yield* PubSub.bounded<ChatMessage>({
      capacity: kickMessageBufferCapacity,
    });

    const catchBotServiceError = <A>(
      effect: Effect.Effect<A, SqlError>,
      reason: string,
    ): Effect.Effect<A, KickPlatformError> =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new KickPlatformError({
              cause,
              reason,
            }),
        ),
      );

    const getKickBot = Effect.fn("KickSessionPlatformAdapter.getKickBot")(
      function* getKickBotEffect(botId: BotRecord["id"]) {
        const bot = yield* catchBotServiceError(
          dependencies.botService.getBot(botId),
          "Could not load Kick bot configuration.",
        );

        if (bot === null || !isKickBot(bot)) {
          return yield* Effect.fail(
            new KickPlatformError({
              reason: "Kick bot not found.",
            }),
          );
        }

        return bot;
      },
    );

    const getAuthorizedToken = Effect.fn("KickSessionPlatformAdapter.getAuthorizedToken")(
      function* getAuthorizedTokenEffect(bot: BotConnection) {
        const persistedBot = yield* getKickBot(bot.botId);
        const storedToken = yield* catchBotServiceError(
          dependencies.botService.getBotToken(bot.botId),
          "Could not load Kick bot credentials.",
        );

        if (storedToken === null) {
          return yield* Effect.fail(
            new KickPlatformError({
              reason: "Authorize this Kick bot before starting a live session.",
            }),
          );
        }

        const now = dependencies.now();

        if (storedToken.expiresAt > now) {
          return storedToken;
        }

        const refreshedToken = yield* Effect.tryPromise({
          catch: (cause) =>
            new KickPlatformError({
              cause,
              reason: "Kick token refresh failed.",
            }),
          try: async () => {
            const payload = await dependencies.refreshAccessToken({
              clientId: dependencies.config.clientId,
              clientSecret: Redacted.value(dependencies.config.clientSecret),
              refreshToken: storedToken.refreshToken,
            });

            return makeBotTokenRecord(persistedBot, payload, now, storedToken);
          },
        });

        return yield* catchBotServiceError(
          dependencies.botService.upsertBotToken(refreshedToken),
          "Could not save refreshed Kick bot credentials.",
        );
      },
    );

    const attachChannelListener = Effect.fn("KickSessionPlatformAdapter.attachChannelListener")(
      function* attachChannelListenerEffect(connection: ConnectedKickBot) {
        const normalizedChannel = normalizeChannel(connection.bot.channel);
        const existingListeners = yield* Ref.get(channelListenersRef);

        if (existingListeners.some((listener) => listener.channel === normalizedChannel)) {
          return;
        }

        const listenerHandle = connection.client.onMessage((message) => {
          const incomingChannel = normalizeChannel(message.channel);

          if (incomingChannel !== normalizedChannel) {
            return;
          }

          void Effect.runFork(
            Ref.get(connectedBotsRef).pipe(
              Effect.flatMap((connectedBots) => {
                const isBotEcho = connectedBots.some(
                  (connectedBot) =>
                    normalizeChannel(connectedBot.bot.channel) === incomingChannel &&
                    connectedBot.bot.username.toLowerCase() === message.username.toLowerCase(),
                );

                if (isBotEcho) {
                  return Effect.void;
                }

                return PubSub.publish(messagesPubSub, {
                  channel: connection.bot.channel,
                  direction: "incoming",
                  platform: "kick",
                  text: message.text,
                  username: ChatUsername.makeUnsafe(message.username),
                });
              }),
            ),
          );
        });

        yield* Ref.set(channelListenersRef, [
          ...existingListeners,
          {
            botId: connection.bot.botId,
            channel: normalizedChannel,
            stopListening: () => {
              listenerHandle.unsubscribe();
            },
          },
        ]);
      },
    );

    const ensureChannelSubscription = Effect.fn(
      "KickSessionPlatformAdapter.ensureChannelSubscription",
    )(function* ensureChannelSubscriptionEffect(bot: BotConnection, token: BotTokenRecord) {
      const normalizedChannel = normalizeChannel(bot.channel);
      const existingSubscriptions = yield* Ref.get(channelSubscriptionsRef);

      if (
        existingSubscriptions.some((subscription) => subscription.channel === normalizedChannel)
      ) {
        return;
      }

      const subscriptionIds = yield* Effect.tryPromise({
        catch: (cause) =>
          new KickPlatformError({
            cause,
            reason: "Kick event subscription failed.",
          }),
        try: () =>
          dependencies.createEventSubscriptions({
            accessToken: token.accessToken,
            events: [kickChatMessageEvent],
          }),
      });

      yield* Ref.set(channelSubscriptionsRef, [
        ...existingSubscriptions,
        {
          channel: normalizedChannel,
          subscriptionIds,
        },
      ]);
    });

    const deleteChannelSubscription = Effect.fn(
      "KickSessionPlatformAdapter.deleteChannelSubscription",
    )(function* deleteChannelSubscriptionEffect(bot: BotConnection, token: BotTokenRecord) {
      const normalizedChannel = normalizeChannel(bot.channel);
      const existingSubscriptions = yield* Ref.get(channelSubscriptionsRef);
      const channelSubscription = existingSubscriptions.find(
        (subscription) => subscription.channel === normalizedChannel,
      );

      if (channelSubscription === undefined || channelSubscription.subscriptionIds.length === 0) {
        return;
      }

      yield* Effect.tryPromise({
        catch: () => undefined,
        try: () =>
          dependencies.deleteEventSubscriptions({
            accessToken: token.accessToken,
            subscriptionIds: channelSubscription.subscriptionIds,
          }),
      }).pipe(Effect.catch(() => Effect.void));

      yield* Ref.set(
        channelSubscriptionsRef,
        existingSubscriptions.filter((subscription) => subscription.channel !== normalizedChannel),
      );
    });

    const connect = Effect.fn("KickSessionPlatformAdapter.connect")(function* connectKickBot(
      bot: BotConnection,
    ) {
      if (bot.platform !== "kick") {
        return yield* Effect.fail(makePlatformConnectionError(bot));
      }

      const normalizedChannel = normalizeChannel(bot.channel);
      const connectedBots = yield* Ref.get(connectedBotsRef);

      if (
        connectedBots.some(
          (connection) =>
            connection.bot.botId === bot.botId &&
            normalizeChannel(connection.bot.channel) === normalizedChannel,
        )
      ) {
        return;
      }

      const token = yield* getAuthorizedToken(bot).pipe(
        Effect.mapError((cause) => makePlatformConnectionError(bot, cause)),
      );
      const client = dependencies.buildSessionClient({
        accessToken: token.accessToken,
        channel: normalizedChannel,
      });

      yield* ensureChannelSubscription(bot, token).pipe(
        Effect.mapError((cause) => makePlatformConnectionError(bot, cause)),
      );
      yield* Effect.tryPromise({
        catch: (cause) => makePlatformConnectionError(bot, cause),
        try: async () => {
          await client.connect();
        },
      });

      const connection = {
        bot: {
          ...bot,
          channel: bot.channel,
        },
        client,
      } satisfies ConnectedKickBot;

      yield* Ref.update(connectedBotsRef, (connections) => [...connections, connection]);
      yield* attachChannelListener(connection).pipe(
        Effect.mapError((cause) => makePlatformConnectionError(bot, cause)),
      );
    });

    const disconnect = Effect.fn("KickSessionPlatformAdapter.disconnect")(
      function* disconnectKickBot(bot: BotConnection) {
        const normalizedChannel = normalizeChannel(bot.channel);
        const connectedBots = yield* Ref.get(connectedBotsRef);
        const connection = connectedBots.find(
          (candidate) =>
            candidate.bot.botId === bot.botId &&
            normalizeChannel(candidate.bot.channel) === normalizedChannel,
        );

        if (connection === undefined) {
          return;
        }

        const listeners = yield* Ref.get(channelListenersRef);
        const channelListener = listeners.find(
          (listener) => listener.botId === bot.botId && listener.channel === normalizedChannel,
        );
        const remainingConnections = connectedBots.filter(
          (candidate) =>
            !(
              candidate.bot.botId === bot.botId &&
              normalizeChannel(candidate.bot.channel) === normalizedChannel
            ),
        );

        channelListener?.stopListening();
        yield* Effect.tryPromise({
          catch: (cause) => cause,
          try: async () => {
            await connection.client.disconnect();
          },
        }).pipe(Effect.catch(() => Effect.void));
        if (
          !remainingConnections.some(
            (candidate) => normalizeChannel(candidate.bot.channel) === normalizedChannel,
          )
        ) {
          const token = yield* getAuthorizedToken(bot).pipe(
            Effect.catch(() => Effect.succeed(null)),
          );

          if (token !== null) {
            yield* deleteChannelSubscription(bot, token);
          }
        }
        yield* Ref.set(
          channelListenersRef,
          listeners.filter(
            (listener) => !(listener.botId === bot.botId && listener.channel === normalizedChannel),
          ),
        );
        yield* Ref.set(connectedBotsRef, remainingConnections);
      },
    );

    const sendMessage = Effect.fn("KickSessionPlatformAdapter.sendMessage")(
      function* sendKickMessage(bot: BotConnection, text: string) {
        const normalizedChannel = normalizeChannel(bot.channel);
        const connection = (yield* Ref.get(connectedBotsRef)).find(
          (candidate) =>
            candidate.bot.botId === bot.botId &&
            normalizeChannel(candidate.bot.channel) === normalizedChannel,
        );

        if (connection === undefined) {
          return yield* Effect.fail(makePlatformSendError(bot));
        }

        yield* Effect.tryPromise({
          catch: (cause) => makePlatformSendError(bot, cause),
          try: async () => {
            await connection.client.sendMessage(text);
          },
        });

        yield* PubSub.publish(messagesPubSub, {
          botId: connection.bot.botId,
          channel: connection.bot.channel,
          direction: "outgoing",
          platform: "kick",
          text,
          username: connection.bot.username,
        });
      },
    );

    const listenChat = (channel: ChannelName): Stream.Stream<ChatMessage> =>
      Stream.fromPubSub(messagesPubSub).pipe(
        Stream.filter((message) => normalizeChannel(message.channel) === normalizeChannel(channel)),
      );

    return {
      connect,
      disconnect,
      listenChat,
      sendMessage,
    } satisfies PlatformAdapterShape;
  });

export const KickPlatformAdapterLive = Layer.effect(
  KickPlatformAdapter,
  Effect.gen(function* kickPlatformAdapterLayer() {
    const botService = yield* BotService;
    const config = yield* KickPlatformConfig;

    return KickPlatformAdapter.of(
      yield* makeKickPlatformAdapter({
        ...makeLiveDependencies(config),
        botService,
      }),
    );
  }).pipe(Effect.provide(KickPlatformConfig.layer)),
);
