import { exchangeCode, refreshUserToken, StaticAuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { AccessToken } from "@twurple/auth";

import { BotTokenId, BotTokenRecord } from "../../bots/bot-token-record";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import type { BotServiceShape } from "../../bots/Services/bot-service";
import { TwitchPlatformConfig } from "../Services/twitch-platform-config";
import type { TwitchPlatformConfigShape } from "../Services/twitch-platform-config";
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
  readonly quit: () => void;
  readonly say: (channel: string, text: string) => Promise<void>;
}

interface TwitchAdapterDependencies {
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

const makeLiveDependencies = (config: TwitchPlatformConfigShape): TwitchAdapterDependencies => ({
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
