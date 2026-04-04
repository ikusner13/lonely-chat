import { exchangeCode, refreshUserToken, StaticAuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Redacted from "effect/Redacted";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { AccessToken } from "@twurple/auth";

import { BotTokenId, BotTokenRecord } from "../../bots/bot-token-record";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import type { BotServiceShape } from "../../bots/Services/bot-service";
import { TwitchPlatformConfig } from "../Services/twitch-platform-config";
import type { TwitchPlatformConfigShape } from "../Services/twitch-platform-config";
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
import { TwitchPlatformAdapter, TwitchPlatformError } from "../Services/twitch-platform-adapter";
import type {
  TwitchPlatformAdapterShape,
  TwitchTestMessageRequest,
} from "../Services/twitch-platform-adapter";

interface TwitchTokenPayload {
  readonly accessToken: string;
  readonly expiresAt: string;
  readonly refreshToken: string;
  readonly scopes: readonly string[];
}

interface TwitchChatClientShape {
  readonly connect: () => void;
  readonly join: (channel: string) => Promise<void>;
  readonly onMessage?: (listener: (channel: string, username: string, text: string) => void) => {
    readonly unbind: () => void;
  };
  readonly quit: () => void;
  readonly say: (channel: string, text: string) => Promise<void>;
}

export interface TwitchAdapterDependencies {
  readonly buildChatClient: (args: {
    readonly channel: string;
    readonly clientId: string;
    readonly token: BotTokenRecord;
  }) => TwitchChatClientShape;
  readonly config: TwitchPlatformConfigShape;
  readonly exchangeAuthorizationCode: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly code: string;
    readonly redirectUri: string;
  }) => Promise<TwitchTokenPayload>;
  readonly now: () => string;
  readonly refreshAccessToken: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly refreshToken: string;
  }) => Promise<TwitchTokenPayload>;
}

interface TwitchAdapterServiceDependencies extends TwitchAdapterDependencies {
  readonly botService: Pick<BotServiceShape, "getBot" | "getBotToken" | "upsertBotToken">;
}

type TwitchBotRecord = BotRecord & {
  readonly platform: "twitch";
};

const normalizeChannel = (channel: string): string =>
  channel.trim().replace(/^#/u, "").toLowerCase();

const isTwitchBot = (bot: BotRecord): bot is TwitchBotRecord => bot.platform === "twitch";

const makeTokenPayload = (token: AccessToken): TwitchTokenPayload => {
  if (token.refreshToken === null) {
    throw new Error("Twitch OAuth did not return a refresh token.");
  }

  if (token.expiresIn === null) {
    throw new Error("Twitch OAuth did not return an expiry.");
  }

  return {
    accessToken: token.accessToken,
    expiresAt: new Date(token.obtainmentTimestamp + token.expiresIn * 1000).toISOString(),
    refreshToken: token.refreshToken,
    scopes: token.scope,
  };
};

const buildLiveChatClient = ({
  channel,
  clientId,
  token,
}: {
  readonly channel: string;
  readonly clientId: string;
  readonly token: BotTokenRecord;
}): TwitchChatClientShape => {
  const authProvider = new StaticAuthProvider(clientId, token.accessToken, [...token.scopes]);
  const chatClient = new ChatClient({
    authProvider,
  });

  return {
    connect: () => {
      chatClient.connect();
    },
    join: async (channelName: string) => chatClient.join(channelName || channel),
    onMessage: (listener) =>
      chatClient.onMessage((channelName, username, text) => {
        listener(channelName, username, text);
      }),
    quit: () => {
      chatClient.quit();
    },
    say: async (channelName: string, text: string) => chatClient.say(channelName || channel, text),
  };
};

const makeBotTokenRecord = (
  bot: BotRecord,
  payload: TwitchTokenPayload,
  now: string,
  existingToken?: BotTokenRecord,
): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: payload.accessToken,
    botId: bot.id,
    createdAt: existingToken?.createdAt ?? now,
    expiresAt: payload.expiresAt,
    id: existingToken?.id ?? BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: "twitch",
    refreshToken: payload.refreshToken,
    scopes: payload.scopes,
    updatedAt: now,
  });

export const makeLiveDependencies = (
  config: TwitchPlatformConfigShape,
): TwitchAdapterDependencies => ({
  buildChatClient: buildLiveChatClient,
  config,
  exchangeAuthorizationCode: async ({ clientId, clientSecret, code, redirectUri }) =>
    makeTokenPayload(await exchangeCode(clientId, clientSecret, code, redirectUri)),
  now: () => new Date().toISOString(),
  refreshAccessToken: async ({ clientId, clientSecret, refreshToken }) =>
    makeTokenPayload(await refreshUserToken(clientId, clientSecret, refreshToken)),
});

export const makeTwitchPlatformAdapter = (
  dependencies: TwitchAdapterServiceDependencies,
): Effect.Effect<TwitchPlatformAdapterShape> => {
  const catchBotServiceError = <A>(
    effect: Effect.Effect<A, SqlError>,
    reason: string,
  ): Effect.Effect<A, TwitchPlatformError> =>
    effect.pipe(
      Effect.mapError(
        (cause) =>
          new TwitchPlatformError({
            cause,
            reason,
          }),
      ),
    );

  const getTwitchBot = Effect.fn("TwitchPlatformAdapter.getTwitchBot")(function* getTwitchBotEffect(
    botId: BotRecord["id"],
  ) {
    const bot = yield* catchBotServiceError(
      dependencies.botService.getBot(botId),
      "Could not load Twitch bot configuration.",
    );

    if (bot === null || !isTwitchBot(bot)) {
      return yield* Effect.fail(
        new TwitchPlatformError({
          reason: "Twitch bot not found.",
        }),
      );
    }

    return bot;
  });

  const getAuthorizationUrl = Effect.fn("TwitchPlatformAdapter.getAuthorizationUrl")(
    function* getAuthorizationUrlEffect(botId: BotRecord["id"]) {
      const bot = yield* getTwitchBot(botId);

      const params = new URLSearchParams({
        client_id: dependencies.config.clientId,
        force_verify: "true",
        redirect_uri: dependencies.config.redirectUri,
        response_type: "code",
        scope: dependencies.config.scopes.join(" "),
        state: bot.id,
      });

      return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
    },
  );

  const completeAuthorization = Effect.fn("TwitchPlatformAdapter.completeAuthorization")(
    function* completeAuthorizationEffect(botId: BotRecord["id"], code: string) {
      const bot = yield* getTwitchBot(botId);
      const now = dependencies.now();

      const token = yield* Effect.tryPromise({
        catch: (cause) =>
          new TwitchPlatformError({
            cause,
            reason: "Twitch authorization failed.",
          }),
        try: async () => {
          const payload = await dependencies.exchangeAuthorizationCode({
            clientId: dependencies.config.clientId,
            clientSecret: Redacted.value(dependencies.config.clientSecret),
            code,
            redirectUri: dependencies.config.redirectUri,
          });

          return makeBotTokenRecord(bot, payload, now);
        },
      });

      return yield* catchBotServiceError(
        dependencies.botService.upsertBotToken(token),
        "Could not save Twitch bot credentials.",
      );
    },
  );

  const sendTestMessage = Effect.fn("TwitchPlatformAdapter.sendTestMessage")(
    function* sendTestMessageEffect(request: TwitchTestMessageRequest) {
      const bot = yield* getTwitchBot(request.botId);
      const token = yield* catchBotServiceError(
        dependencies.botService.getBotToken(bot.id),
        "Could not load Twitch bot credentials.",
      );

      if (token === null) {
        return yield* Effect.fail(
          new TwitchPlatformError({
            reason: "Authorize this Twitch bot before sending a test message.",
          }),
        );
      }

      const normalizedChannel = normalizeChannel(request.channel);
      const now = dependencies.now();
      const tokenToUse =
        token.expiresAt <= now
          ? yield* Effect.tryPromise({
              catch: (cause) =>
                new TwitchPlatformError({
                  cause,
                  reason: "Twitch token refresh failed.",
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
          "Could not save refreshed Twitch bot credentials.",
        );
      }

      return yield* Effect.tryPromise({
        catch: (cause) =>
          new TwitchPlatformError({
            cause,
            reason: "Twitch test message failed.",
          }),
        try: async () => {
          const chatClient = dependencies.buildChatClient({
            channel: normalizedChannel,
            clientId: dependencies.config.clientId,
            token: tokenToUse,
          });

          try {
            chatClient.connect();
            await chatClient.join(normalizedChannel);
            await chatClient.say(normalizedChannel, request.text);
          } finally {
            chatClient.quit();
          }

          return tokenToUse;
        },
      });
    },
  );

  return Effect.succeed({
    completeAuthorization,
    getAuthorizationUrl,
    sendTestMessage,
  } satisfies TwitchPlatformAdapterShape);
};

const twitchMessageBufferCapacity = 128;

interface ConnectedTwitchBot {
  readonly bot: BotConnection;
  readonly client: TwitchChatClientShape;
}

interface ChannelListener {
  readonly botId: BotConnection["botId"];
  readonly channel: string;
  readonly stopListening: () => void;
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

export const makeTwitchSessionPlatformAdapter = (
  dependencies: TwitchAdapterServiceDependencies,
): Effect.Effect<PlatformAdapterShape> =>
  Effect.gen(function* makeTwitchSessionPlatformAdapterEffect() {
    const connectedBotsRef = yield* Ref.make<readonly ConnectedTwitchBot[]>([]);
    const channelListenersRef = yield* Ref.make<readonly ChannelListener[]>([]);
    const messagesPubSub = yield* PubSub.bounded<ChatMessage>({
      capacity: twitchMessageBufferCapacity,
    });

    const catchBotServiceError = <A>(
      effect: Effect.Effect<A, SqlError>,
      reason: string,
    ): Effect.Effect<A, TwitchPlatformError> =>
      effect.pipe(
        Effect.mapError(
          (cause) =>
            new TwitchPlatformError({
              cause,
              reason,
            }),
        ),
      );

    const getTwitchBot = Effect.fn("TwitchSessionPlatformAdapter.getTwitchBot")(
      function* getTwitchBotEffect(botId: BotRecord["id"]) {
        const bot = yield* catchBotServiceError(
          dependencies.botService.getBot(botId),
          "Could not load Twitch bot configuration.",
        );

        if (bot === null || !isTwitchBot(bot)) {
          return yield* Effect.fail(
            new TwitchPlatformError({
              reason: "Twitch bot not found.",
            }),
          );
        }

        return bot;
      },
    );

    const getAuthorizedToken = Effect.fn("TwitchSessionPlatformAdapter.getAuthorizedToken")(
      function* getAuthorizedTokenEffect(bot: BotConnection) {
        const persistedBot = yield* getTwitchBot(bot.botId);
        const storedToken = yield* catchBotServiceError(
          dependencies.botService.getBotToken(bot.botId),
          "Could not load Twitch bot credentials.",
        );

        if (storedToken === null) {
          return yield* Effect.fail(
            new TwitchPlatformError({
              reason: "Authorize this Twitch bot before starting a live session.",
            }),
          );
        }

        const now = dependencies.now();

        if (storedToken.expiresAt > now) {
          return storedToken;
        }

        const refreshedToken = yield* Effect.tryPromise({
          catch: (cause) =>
            new TwitchPlatformError({
              cause,
              reason: "Twitch token refresh failed.",
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
          "Could not save refreshed Twitch bot credentials.",
        );
      },
    );

    const attachChannelListener = Effect.fn("TwitchSessionPlatformAdapter.attachChannelListener")(
      function* attachChannelListenerEffect(connection: ConnectedTwitchBot) {
        const normalizedChannel = normalizeChannel(connection.bot.channel);
        const existingListeners = yield* Ref.get(channelListenersRef);

        if (existingListeners.some((listener) => listener.channel === normalizedChannel)) {
          return;
        }

        if (connection.client.onMessage === undefined) {
          return yield* Effect.fail(
            new TwitchPlatformError({
              reason: "Twitch chat listener is unavailable for this client.",
            }),
          );
        }

        const listenerHandle = connection.client.onMessage((channelName, username, text) => {
          const incomingChannel = normalizeChannel(channelName);

          if (incomingChannel !== normalizedChannel) {
            return;
          }

          void Effect.runFork(
            Ref.get(connectedBotsRef).pipe(
              Effect.flatMap((connectedBots) => {
                const isBotEcho = connectedBots.some(
                  (connectedBot) =>
                    normalizeChannel(connectedBot.bot.channel) === incomingChannel &&
                    connectedBot.bot.username.toLowerCase() === username.toLowerCase(),
                );

                if (isBotEcho) {
                  return Effect.void;
                }

                return PubSub.publish(messagesPubSub, {
                  channel: connection.bot.channel,
                  direction: "incoming",
                  platform: "twitch",
                  text,
                  username: ChatUsername.makeUnsafe(username),
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
              listenerHandle.unbind();
            },
          },
        ]);
      },
    );

    const connect = Effect.fn("TwitchSessionPlatformAdapter.connect")(function* connectTwitchBot(
      bot: BotConnection,
    ) {
      if (bot.platform !== "twitch") {
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
      const client = dependencies.buildChatClient({
        channel: normalizedChannel,
        clientId: dependencies.config.clientId,
        token,
      });

      yield* Effect.tryPromise({
        catch: (cause) => makePlatformConnectionError(bot, cause),
        try: async () => {
          client.connect();
          await client.join(normalizedChannel);
        },
      });

      const connection = {
        bot: {
          ...bot,
          channel: bot.channel,
        },
        client,
      } satisfies ConnectedTwitchBot;

      yield* Ref.update(connectedBotsRef, (connections) => [...connections, connection]);
      yield* attachChannelListener(connection).pipe(
        Effect.mapError((cause) => makePlatformConnectionError(bot, cause)),
      );
    });

    const disconnect = Effect.fn("TwitchSessionPlatformAdapter.disconnect")(
      function* disconnectTwitchBot(bot: BotConnection) {
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

        channelListener?.stopListening();
        connection.client.quit();
        yield* Ref.set(
          channelListenersRef,
          listeners.filter(
            (listener) => !(listener.botId === bot.botId && listener.channel === normalizedChannel),
          ),
        );
        yield* Ref.set(
          connectedBotsRef,
          connectedBots.filter(
            (candidate) =>
              !(
                candidate.bot.botId === bot.botId &&
                normalizeChannel(candidate.bot.channel) === normalizedChannel
              ),
          ),
        );
      },
    );

    const sendMessage = Effect.fn("TwitchSessionPlatformAdapter.sendMessage")(
      function* sendTwitchMessage(bot: BotConnection, text: string) {
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
            await connection.client.say(normalizedChannel, text);
          },
        });

        yield* PubSub.publish(messagesPubSub, {
          botId: connection.bot.botId,
          channel: connection.bot.channel,
          direction: "outgoing",
          platform: "twitch",
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

export const TwitchPlatformAdapterLive = Layer.effect(
  TwitchPlatformAdapter,
  Effect.gen(function* twitchPlatformAdapterLayer() {
    const botService = yield* BotService;
    const config = yield* TwitchPlatformConfig;

    return TwitchPlatformAdapter.of(
      yield* makeTwitchPlatformAdapter({
        ...makeLiveDependencies(config),
        botService,
      }),
    );
  }).pipe(Effect.provide(TwitchPlatformConfig.layer)),
);
