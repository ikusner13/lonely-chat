import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { BotTokenId, BotTokenRecord } from "../../bots/bot-token-record";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import type { BotServiceShape } from "../../bots/Services/bot-service";
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

interface KickAdapterDependencies {
  readonly config: KickPlatformConfigShape;
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

const splitScopes = (scope: string): readonly string[] =>
  scope
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const expiresAtFromLifetime = (now: string, expiresInSeconds: number): string =>
  new Date(Date.parse(now) + expiresInSeconds * 1000).toISOString();

const decodeKickTokenResponse = Schema.decodeUnknownSync(KickTokenResponseSchema);
const decodeKickChatResponse = Schema.decodeUnknownSync(KickChatResponseSchema);

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

  return {
    config,
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
