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
import { makeTwitchPlatformAdapter } from "./Layers/twitch-platform-adapter";
import {
  TwitchPlatformAdapter,
  TwitchTestMessageRequest,
} from "./Services/twitch-platform-adapter";

const createdAt = "2026-04-03T00:00:00.000Z";
const redirectUri = "http://localhost:4173/auth/twitch/callback";

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-twitch-"));

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
    description: "Dry moderator energy.",
    displayName: "ModBot",
    enabled: true,
    exampleMessages: ["calm down chat", "save it for halftime", "mods are awake"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: "checking in",
    id: BotId.makeUnsafe("bot-mod"),
    maxTokens: 128,
    model: "openai/gpt-5-mini",
    name: "mod_bot",
    personality: "Brief and sarcastic.",
    platform: "twitch",
    postHistoryPrompt: "Stay snappy.",
    responseLength: {
      max: 8,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 40,
    temperature: 0.6,
    updatedAt: createdAt,
    vocabularyRules: ["Never apologize."],
  });

const makeStoredToken = (bot: BotRecord, overrides?: Partial<BotTokenRecord>): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: "access-token-1",
    botId: bot.id,
    createdAt,
    expiresAt: "2026-04-04T00:00:00.000Z",
    id: BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: bot.platform,
    refreshToken: "refresh-token-1",
    scopes: ["chat:read", "chat:edit"],
    updatedAt: createdAt,
    ...overrides,
  });

class FakeListener {
  private active = true;
  private readonly onUnbind: () => void;

  constructor(onUnbind: () => void) {
    this.onUnbind = onUnbind;
  }

  unbind(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.onUnbind();
  }
}

class FakeTwitchChatClient {
  readonly joinedChannels: string[] = [];
  readonly sentMessages: { readonly channel: string; readonly text: string }[] = [];
  connectCalls = 0;
  quitCalls = 0;

  private readonly authenticationFailureListeners = new Set<(reason: string) => void>();
  private readonly connectListeners = new Set<() => void>();
  private readonly disconnectListeners = new Set<(manually: boolean, reason?: Error) => void>();
  private readonly tokenFetchFailureListeners = new Set<(error: Error) => void>();

  onAuthenticationFailure(listener: (reason: string) => void): FakeListener {
    this.authenticationFailureListeners.add(listener);
    return new FakeListener(() => {
      this.authenticationFailureListeners.delete(listener);
    });
  }

  onConnect(listener: () => void): FakeListener {
    this.connectListeners.add(listener);
    return new FakeListener(() => {
      this.connectListeners.delete(listener);
    });
  }

  onDisconnect(listener: (manually: boolean, reason?: Error) => void): FakeListener {
    this.disconnectListeners.add(listener);
    return new FakeListener(() => {
      this.disconnectListeners.delete(listener);
    });
  }

  onTokenFetchFailure(listener: (error: Error) => void): FakeListener {
    this.tokenFetchFailureListeners.add(listener);
    return new FakeListener(() => {
      this.tokenFetchFailureListeners.delete(listener);
    });
  }

  connect(): void {
    this.connectCalls += 1;
  }

  async join(channel: string): Promise<void> {
    this.joinedChannels.push(channel);
    for (const listener of this.connectListeners) {
      listener();
    }
  }

  async say(channel: string, text: string): Promise<void> {
    this.sentMessages.push({ channel, text });
  }

  quit(): void {
    this.quitCalls += 1;
  }
}

interface TwitchTestLayerOptions {
  readonly createChatClient?: (args: {
    readonly channel: string;
    readonly clientId: string;
    readonly token: BotTokenRecord;
  }) => FakeTwitchChatClient;
  readonly exchangeCode?: (args: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly code: string;
    readonly redirectUri: string;
  }) => Promise<{
    readonly accessToken: string;
    readonly expiresAt: string;
    readonly refreshToken: string;
    readonly scopes: readonly string[];
  }>;
  readonly now?: () => string;
  readonly refreshUserToken?: (args: {
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

const makeTwitchTestLayer = (dbPath: string, options: TwitchTestLayerOptions = {}) => {
  const databaseLayer = makeDatabaseLayer(dbPath);
  const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
  const twitchPlatformAdapterLayer = Layer.effect(
    TwitchPlatformAdapter,
    Effect.gen(function* makeTwitchPlatformAdapterLayer() {
      const botService = yield* BotService;

      return TwitchPlatformAdapter.of(
        yield* makeTwitchPlatformAdapter({
          botService,
          buildChatClient: options.createChatClient ?? (() => new FakeTwitchChatClient()),
          config: {
            clientId: "test-client-id",
            clientSecret: Redacted.make("test-client-secret"),
            redirectUri,
            scopes: ["chat:read", "chat:edit"],
          },
          exchangeAuthorizationCode:
            options.exchangeCode ??
            (async () => ({
              accessToken: "oauth-access-token",
              expiresAt: "2026-04-03T02:00:00.000Z",
              refreshToken: "oauth-refresh-token",
              scopes: ["chat:edit", "chat:read"],
            })),
          now: options.now ?? (() => createdAt),
          refreshAccessToken:
            options.refreshUserToken ??
            (async () => ({
              accessToken: "refreshed-access-token",
              expiresAt: "2026-04-03T01:05:00.000Z",
              refreshToken: "refreshed-refresh-token",
              scopes: ["chat:edit", "chat:read"],
            })),
        }),
      );
    }),
  ).pipe(Layer.provide(botServiceLayer));

  return Layer.mergeAll(botServiceLayer, twitchPlatformAdapterLayer);
};

describe("twitch platform adapter", () => {
  it.effect("builds the Twitch OAuth URL for a configured Twitch bot", () =>
    Effect.gen(function* buildsTheTwitchOAuthUrlForAConfiguredTwitchBot() {
      const dbPath = yield* createDatabasePath;
      const twitchLayer = makeTwitchTestLayer(dbPath);
      const bot = makeTestBot();
      const authorizeUrl = yield* Effect.gen(function* exerciseAuthorizeUrl() {
        const botService = yield* BotService;
        const twitchPlatformAdapter = yield* TwitchPlatformAdapter;

        yield* botService.createBot(bot);

        return yield* twitchPlatformAdapter.getAuthorizationUrl(bot.id);
      }).pipe(Effect.provide(twitchLayer));

      const parsedUrl = new URL(authorizeUrl);

      expect(parsedUrl.origin).toBe("https://id.twitch.tv");
      expect(parsedUrl.pathname).toBe("/oauth2/authorize");
      expect(parsedUrl.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsedUrl.searchParams.get("redirect_uri")).toBe(redirectUri);
      expect(parsedUrl.searchParams.get("response_type")).toBe("code");
      expect(parsedUrl.searchParams.get("scope")).toBe("chat:read chat:edit");
      expect(parsedUrl.searchParams.get("state")).toBe(bot.id);
    }),
  );

  it.effect("exchanges a Twitch auth code and stores the returned token metadata", () =>
    Effect.gen(function* exchangesATwitchAuthCodeAndStoresTheReturnedTokenMetadata() {
      const dbPath = yield* createDatabasePath;
      const exchangeCalls: string[] = [];
      const twitchLayer = makeTwitchTestLayer(dbPath, {
        exchangeCode: async ({ code }) => {
          exchangeCalls.push(code);

          return {
            accessToken: "oauth-access-token",
            expiresAt: "2026-04-03T02:00:00.000Z",
            refreshToken: "oauth-refresh-token",
            scopes: ["chat:edit", "chat:read"],
          };
        },
        now: () => createdAt,
      });
      const bot = makeTestBot();
      const storedToken = yield* Effect.gen(function* exerciseAuthorization() {
        const botService = yield* BotService;
        const twitchPlatformAdapter = yield* TwitchPlatformAdapter;

        yield* botService.createBot(bot);
        yield* twitchPlatformAdapter.completeAuthorization(bot.id, "auth-code-123");

        return yield* botService.getBotToken(bot.id);
      }).pipe(Effect.provide(twitchLayer));

      expect(exchangeCalls).toEqual(["auth-code-123"]);
      expect(storedToken).toEqual(
        new BotTokenRecord({
          accessToken: "oauth-access-token",
          botId: bot.id,
          createdAt,
          expiresAt: "2026-04-03T02:00:00.000Z",
          id: BotTokenId.makeUnsafe(`token-${bot.id}`),
          platform: "twitch",
          refreshToken: "oauth-refresh-token",
          scopes: ["chat:edit", "chat:read"],
          updatedAt: createdAt,
        }),
      );
    }),
  );

  it.effect("refreshes expired Twitch tokens before connecting and sending a test message", () =>
    Effect.gen(function* refreshesExpiredTwitchTokensBeforeConnectingAndSendingATestMessage() {
      const dbPath = yield* createDatabasePath;
      const bot = makeTestBot();
      const chatClient = new FakeTwitchChatClient();
      const refreshCalls: string[] = [];
      const refreshedAt = "2026-04-03T00:05:00.000Z";
      const twitchLayer = makeTwitchTestLayer(dbPath, {
        createChatClient: ({ channel }) => {
          expect(channel).toBe("lonely_chat");
          return chatClient;
        },
        refreshUserToken: async ({ refreshToken }) => {
          refreshCalls.push(refreshToken);

          return {
            accessToken: "refreshed-access-token",
            expiresAt: "2026-04-03T01:05:00.000Z",
            refreshToken: "refreshed-refresh-token",
            scopes: ["chat:edit", "chat:read"],
          };
        },
        now: () => refreshedAt,
      });
      const updatedToken = yield* Effect.gen(function* exerciseSendTestMessage() {
        const botService = yield* BotService;
        const twitchPlatformAdapter = yield* TwitchPlatformAdapter;

        yield* botService.createBot(bot);
        yield* botService.upsertBotToken(
          makeStoredToken(bot, {
            expiresAt: "2026-04-02T23:59:59.000Z",
            refreshToken: "stale-refresh-token",
          }),
        );
        yield* twitchPlatformAdapter.sendTestMessage(
          new TwitchTestMessageRequest({
            botId: bot.id,
            channel: " #Lonely_Chat ",
            text: "Tracer bullet online",
          }),
        );

        return yield* botService.getBotToken(bot.id);
      }).pipe(Effect.provide(twitchLayer));

      expect(refreshCalls).toEqual(["stale-refresh-token"]);
      expect(chatClient.connectCalls).toBe(1);
      expect(chatClient.joinedChannels).toEqual(["lonely_chat"]);
      expect(chatClient.sentMessages).toEqual([
        {
          channel: "lonely_chat",
          text: "Tracer bullet online",
        },
      ]);
      expect(chatClient.quitCalls).toBe(1);
      expect(updatedToken).toEqual(
        makeStoredToken(bot, {
          accessToken: "refreshed-access-token",
          expiresAt: "2026-04-03T01:05:00.000Z",
          refreshToken: "refreshed-refresh-token",
          scopes: ["chat:edit", "chat:read"],
          updatedAt: "2026-04-03T00:05:00.000Z",
        }),
      );
    }),
  );
});
