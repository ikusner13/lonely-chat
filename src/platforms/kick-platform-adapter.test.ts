import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { BotTokenId, BotTokenRecord } from "../bots/bot-token-record";
import { BotId, BotRecord } from "../bots/bot-record";
import { BotService } from "../bots/Services/bot-service";
import { BotServiceLive } from "../bots/Layers/bot-service";
import { makeDatabaseLayer } from "../db/database";
import { makeKickPlatformAdapter } from "./Layers/kick-platform-adapter";
import {
  KickAuthorizationCallbackRequest,
  KickAuthorizationUrlRequest,
  KickPlatformAdapter,
  KickTestMessageRequest,
} from "./Services/kick-platform-adapter";

const createdAt = "2026-04-03T00:00:00.000Z";
const redirectUri = "http://localhost:4173/auth/kick/callback";

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-kick-"));

    return directory;
  }),
  (directory) =>
    Effect.promise(async () => {
      await rm(directory, {
        force: true,
        recursive: true,
      });
    }).pipe(Effect.orDie),
).pipe(Effect.map((directory) => join(directory, "lonely-chat.sqlite")));

const makeTestBot = (): BotRecord =>
  new BotRecord({
    createdAt,
    description: "Calm halftime analyst.",
    displayName: "KickBot",
    enabled: true,
    exampleMessages: ["hold the line", "clean reset", "stay composed"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: null,
    id: BotId.makeUnsafe("bot-kick"),
    maxTokens: 128,
    model: "openai/gpt-5-mini",
    name: "kick_bot",
    personality: "Measured and observant.",
    platform: "kick",
    postHistoryPrompt: null,
    responseLength: {
      max: 8,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 45,
    temperature: 0.6,
    updatedAt: createdAt,
    vocabularyRules: ["Avoid all caps."],
  });

const makeStoredToken = (bot: BotRecord, overrides?: Partial<BotTokenRecord>): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: "kick-access-token-1",
    botId: bot.id,
    createdAt,
    expiresAt: "2026-04-04T00:00:00.000Z",
    id: BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: bot.platform,
    refreshToken: "kick-refresh-token-1",
    scopes: ["chat:write", "events:subscribe"],
    updatedAt: createdAt,
    ...overrides,
  });

interface KickTestLayerOptions {
  readonly buildSessionClient?: (args: {
    readonly accessToken: string;
    readonly channel: string;
  }) => {
    readonly connect: () => Promise<void>;
    readonly disconnect: () => Promise<void>;
    readonly onMessage: (
      listener: (message: {
        readonly channel: string;
        readonly text: string;
        readonly username: string;
      }) => void,
    ) => {
      readonly unsubscribe: () => void;
    };
    readonly sendMessage: (text: string) => Promise<void>;
  };
  readonly createEventSubscriptions?: (request: {
    readonly accessToken: string;
    readonly events: readonly {
      readonly name: string;
      readonly version: number;
    }[];
  }) => Promise<readonly string[]>;
  readonly deleteEventSubscriptions?: (request: {
    readonly accessToken: string;
    readonly subscriptionIds: readonly string[];
  }) => Promise<void>;
  readonly exchangeAuthorizationCode?: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }) => Promise<{
    readonly accessToken: string;
    readonly expiresAt: string;
    readonly refreshToken: string;
    readonly scopes: readonly string[];
  }>;
  readonly now?: () => string;
  readonly postChatMessage?: (request: {
    readonly accessToken: string;
    readonly text: string;
  }) => Promise<void>;
  readonly refreshAccessToken?: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly refreshToken: string;
  }) => Promise<{
    readonly accessToken: string;
    readonly expiresAt: string;
    readonly refreshToken: string;
    readonly scopes: readonly string[];
  }>;
}

const makeKickTestLayer = (dbPath: string, options: KickTestLayerOptions = {}) => {
  const databaseLayer = makeDatabaseLayer(dbPath);
  const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
  const kickPlatformAdapterLayer = Layer.effect(
    KickPlatformAdapter,
    Effect.gen(function* makeKickPlatformAdapterLayer() {
      const botService = yield* BotService;

      return KickPlatformAdapter.of(
        yield* makeKickPlatformAdapter({
          buildSessionClient:
            options.buildSessionClient ??
            (() => ({
              connect: async () => undefined,
              disconnect: async () => undefined,
              onMessage: () => ({
                unsubscribe: () => undefined,
              }),
              sendMessage: async () => undefined,
            })),
          botService,
          config: {
            clientId: "kick-client-id",
            clientSecret: Redacted.make("kick-client-secret"),
            redirectUri,
            scopes: ["chat:write", "events:subscribe"],
          },
          createEventSubscriptions:
            options.createEventSubscriptions ?? (async () => ["kick-subscription-1"]),
          deleteEventSubscriptions: options.deleteEventSubscriptions ?? (async () => undefined),
          exchangeAuthorizationCode:
            options.exchangeAuthorizationCode ??
            (async () => ({
              accessToken: "kick-oauth-access-token",
              expiresAt: "2026-04-03T02:00:00.000Z",
              refreshToken: "kick-oauth-refresh-token",
              scopes: ["chat:write", "events:subscribe"],
            })),
          now: options.now ?? (() => createdAt),
          postChatMessage: options.postChatMessage ?? (async () => undefined),
          refreshAccessToken:
            options.refreshAccessToken ??
            (async () => ({
              accessToken: "kick-refreshed-access-token",
              expiresAt: "2026-04-03T01:05:00.000Z",
              refreshToken: "kick-refreshed-refresh-token",
              scopes: ["chat:write", "events:subscribe"],
            })),
        }),
      );
    }),
  ).pipe(Layer.provide(botServiceLayer));

  return Layer.mergeAll(botServiceLayer, kickPlatformAdapterLayer);
};

describe("kick platform adapter", () => {
  it.effect("builds the Kick OAuth URL for a configured Kick bot", () =>
    Effect.gen(function* buildsTheKickOAuthUrlForAConfiguredKickBot() {
      const dbPath = yield* createDatabasePath;
      const kickLayer = makeKickTestLayer(dbPath);
      const bot = makeTestBot();
      const authorizeUrl = yield* Effect.gen(function* exerciseAuthorizeUrl() {
        const botService = yield* BotService;
        const kickPlatformAdapter = yield* KickPlatformAdapter;

        yield* botService.createBot(bot);

        return yield* kickPlatformAdapter.getAuthorizationUrl(
          new KickAuthorizationUrlRequest({
            botId: bot.id,
            codeChallenge: "code-challenge-123",
            state: "oauth-state-123",
          }),
        );
      }).pipe(Effect.provide(kickLayer));

      const parsedUrl = new URL(authorizeUrl);

      expect(parsedUrl.origin).toBe("https://id.kick.com");
      expect(parsedUrl.pathname).toBe("/oauth/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("kick-client-id");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("scope")).toBe("chat:write events:subscribe");
      expect(parsedUrl.searchParams.get("code_challenge")).toBe("code-challenge-123");
      expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsedUrl.searchParams.get("state")).toBe("oauth-state-123");
    }),
  );

  it.effect("exchanges a Kick auth code and stores the returned token metadata", () =>
    Effect.gen(function* exchangesAKickAuthCodeAndStoresTheReturnedTokenMetadata() {
      const dbPath = yield* createDatabasePath;
      const exchangeCalls: { readonly code: string; readonly codeVerifier: string }[] = [];
      const kickLayer = makeKickTestLayer(dbPath, {
        exchangeAuthorizationCode: async ({ code, codeVerifier }) => {
          exchangeCalls.push({ code, codeVerifier });

          return {
            accessToken: "kick-oauth-access-token",
            expiresAt: "2026-04-03T02:00:00.000Z",
            refreshToken: "kick-oauth-refresh-token",
            scopes: ["chat:write", "events:subscribe"],
          };
        },
        now: () => createdAt,
      });
      const bot = makeTestBot();
      const storedToken = yield* Effect.gen(function* exerciseAuthorization() {
        const botService = yield* BotService;
        const kickPlatformAdapter = yield* KickPlatformAdapter;

        yield* botService.createBot(bot);
        yield* kickPlatformAdapter.completeAuthorization(
          new KickAuthorizationCallbackRequest({
            botId: bot.id,
            code: "auth-code-123",
            codeVerifier: "verifier-123",
          }),
        );

        return yield* botService.getBotToken(bot.id);
      }).pipe(Effect.provide(kickLayer));

      expect(exchangeCalls).toEqual([
        {
          code: "auth-code-123",
          codeVerifier: "verifier-123",
        },
      ]);
      expect(storedToken).toEqual(
        new BotTokenRecord({
          accessToken: "kick-oauth-access-token",
          botId: bot.id,
          createdAt,
          expiresAt: "2026-04-03T02:00:00.000Z",
          id: BotTokenId.makeUnsafe(`token-${bot.id}`),
          platform: "kick",
          refreshToken: "kick-oauth-refresh-token",
          scopes: ["chat:write", "events:subscribe"],
          updatedAt: createdAt,
        }),
      );
    }),
  );

  it.effect("refreshes expired Kick tokens before sending a test message", () =>
    Effect.gen(function* refreshesExpiredKickTokensBeforeSendingATestMessage() {
      const dbPath = yield* createDatabasePath;
      const bot = makeTestBot();
      const events: string[] = [];
      const refreshedAt = "2026-04-03T00:05:00.000Z";
      const kickLayer = makeKickTestLayer(dbPath, {
        now: () => refreshedAt,
        postChatMessage: async ({ accessToken, text }) => {
          events.push(`send:${accessToken}:${text}`);
        },
        refreshAccessToken: async ({ refreshToken }) => {
          events.push(`refresh:${refreshToken}`);

          return {
            accessToken: "kick-refreshed-access-token",
            expiresAt: "2026-04-03T01:05:00.000Z",
            refreshToken: "kick-refreshed-refresh-token",
            scopes: ["chat:write", "events:subscribe"],
          };
        },
      });
      const updatedToken = yield* Effect.gen(function* exerciseSendTestMessage() {
        const botService = yield* BotService;
        const kickPlatformAdapter = yield* KickPlatformAdapter;

        yield* botService.createBot(bot);
        yield* botService.upsertBotToken(
          makeStoredToken(bot, {
            expiresAt: "2026-04-02T23:59:59.000Z",
            refreshToken: "kick-stale-refresh-token",
          }),
        );
        yield* kickPlatformAdapter.sendTestMessage(
          new KickTestMessageRequest({
            botId: bot.id,
            text: "Kick tracer bullet online",
          }),
        );

        return yield* botService.getBotToken(bot.id);
      }).pipe(Effect.provide(kickLayer));

      expect(events).toEqual([
        "refresh:kick-stale-refresh-token",
        "send:kick-refreshed-access-token:Kick tracer bullet online",
      ]);
      expect(updatedToken).toEqual(
        makeStoredToken(bot, {
          accessToken: "kick-refreshed-access-token",
          expiresAt: "2026-04-03T01:05:00.000Z",
          refreshToken: "kick-refreshed-refresh-token",
          updatedAt: refreshedAt,
        }),
      );
    }),
  );
});
