import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Redacted from "effect/Redacted";
import * as Stream from "effect/Stream";

import { BotTokenId, BotTokenRecord } from "../bots/bot-token-record";
import { BotId as PersistedBotId, BotRecord } from "../bots/bot-record";
import type { BotServiceShape } from "../bots/Services/bot-service";
import { makeKickSessionPlatformAdapter } from "./Layers/kick-platform-adapter";
import { makeMockPlatformAdapter } from "./Layers/mock-platform-adapter";
import { makeTwitchPlatformAdapter } from "./Layers/twitch-platform-adapter";
import { BotId, ChannelName, ChatUsername } from "./Services/platform-adapter";
import type { BotConnection } from "./Services/platform-adapter";
import { TwitchTestMessageRequest } from "./Services/twitch-platform-adapter";
import type { KickPlatformConfigShape } from "./Services/kick-platform-config";
import type { TwitchPlatformConfigShape } from "./Services/twitch-platform-config";

const mockBot: BotConnection = {
  botId: BotId.makeUnsafe("bot-1"),
  channel: ChannelName.makeUnsafe("lonely-chat"),
  platform: "mock",
  username: ChatUsername.makeUnsafe("lonely-bot"),
};

const createdAt = "2026-04-03T00:00:00.000Z";
const updatedAt = "2026-04-03T00:00:01.000Z";

const twitchConfig: TwitchPlatformConfigShape = {
  clientId: "twitch-client-id",
  clientSecret: Redacted.make("twitch-client-secret"),
  redirectUri: "http://localhost:5173/auth/twitch/callback",
  scopes: ["chat:read", "chat:edit"],
};

const kickConfig: KickPlatformConfigShape = {
  clientId: "kick-client-id",
  clientSecret: Redacted.make("kick-client-secret"),
  redirectUri: "http://localhost:5173/auth/kick/callback",
  scopes: ["chat:write", "events:subscribe"],
};

const makeTwitchBot = (): BotRecord =>
  new BotRecord({
    createdAt,
    description: "dry commentator",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["gg", "clip that", "unreal"],
    fallbackModels: [],
    firstMessage: null,
    id: PersistedBotId.makeUnsafe("bot-pixel"),
    maxTokens: 120,
    model: "openai/gpt-5-mini",
    name: "pixel_bot",
    personality: "sarcastic and brief",
    platform: "twitch",
    postHistoryPrompt: null,
    responseLength: {
      max: 8,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 40,
    temperature: 0.5,
    updatedAt,
    vocabularyRules: ["avoid emojis"],
  });

const makeTwitchToken = (bot: BotRecord, overrides?: Partial<BotTokenRecord>): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: "access-token-1",
    botId: bot.id,
    createdAt,
    expiresAt: "2026-04-04T00:00:00.000Z",
    id: BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: "twitch",
    refreshToken: "refresh-token-1",
    scopes: ["chat:read", "chat:edit"],
    updatedAt,
    ...overrides,
  });

const makeKickBot = (): BotRecord =>
  new BotRecord({
    createdAt,
    description: "measured play-by-play",
    displayName: "Kick Pixel",
    enabled: true,
    exampleMessages: ["steady pace", "reset the lobby", "keep it clean"],
    fallbackModels: [],
    firstMessage: null,
    id: PersistedBotId.makeUnsafe("bot-kick-pixel"),
    maxTokens: 120,
    model: "openai/gpt-5-mini",
    name: "kick_pixel",
    personality: "observant and dry",
    platform: "kick",
    postHistoryPrompt: null,
    responseLength: {
      max: 8,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 35,
    temperature: 0.5,
    updatedAt,
    vocabularyRules: ["avoid slang"],
  });

const makeKickToken = (bot: BotRecord, overrides?: Partial<BotTokenRecord>): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: "kick-access-token-1",
    botId: bot.id,
    createdAt,
    expiresAt: "2026-04-04T00:00:00.000Z",
    id: BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: "kick",
    refreshToken: "kick-refresh-token-1",
    scopes: ["chat:write", "events:subscribe"],
    updatedAt,
    ...overrides,
  });

class FakeKickListenerHandle {
  private active = true;
  private readonly onUnsubscribe: () => void;

  constructor(onUnsubscribe: () => void) {
    this.onUnsubscribe = onUnsubscribe;
  }

  unsubscribe(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.onUnsubscribe();
  }
}

class FakeKickSessionClient {
  readonly sentMessages: string[] = [];
  connectCalls = 0;
  disconnectCalls = 0;

  private readonly messageListeners = new Set<
    (message: {
      readonly channel: string;
      readonly text: string;
      readonly username: string;
    }) => void
  >();

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  onMessage(
    listener: (message: {
      readonly channel: string;
      readonly text: string;
      readonly username: string;
    }) => void,
  ): FakeKickListenerHandle {
    this.messageListeners.add(listener);

    return new FakeKickListenerHandle(() => {
      this.messageListeners.delete(listener);
    });
  }

  async sendMessage(text: string): Promise<void> {
    this.sentMessages.push(text);
  }

  emitIncomingMessage(channel: string, username: string, text: string): void {
    for (const listener of this.messageListeners) {
      listener({
        channel,
        text,
        username,
      });
    }
  }
}

const makeBotService = ({
  bot,
  token,
  onUpsert,
}: {
  readonly bot: BotRecord | null;
  readonly token: BotTokenRecord | null;
  readonly onUpsert?: (token: BotTokenRecord) => void;
}): Pick<BotServiceShape, "getBot" | "getBotToken" | "upsertBotToken"> => {
  let currentToken = token;

  return {
    getBot: () => Effect.succeed(bot),
    getBotToken: () => Effect.succeed(currentToken),
    upsertBotToken: (nextToken) =>
      Effect.sync(() => {
        currentToken = nextToken;
        onUpsert?.(nextToken);
        return nextToken;
      }),
  };
};

describe("mock platform adapter", () => {
  it.effect("emits incoming messages to channel listeners", () =>
    Effect.gen(function* emitsIncomingMessagesToChannelListeners() {
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;

      const messagesFiber = yield* mockPlatformAdapter.platformAdapter
        .listenChat(mockBot.channel)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);

      yield* Effect.yieldNow;
      yield* mockPlatformAdapter.emitIncomingMessage({
        channel: mockBot.channel,
        text: "hello from chat",
        username: ChatUsername.makeUnsafe("viewer-1"),
      });

      const messages = yield* Fiber.join(messagesFiber);

      expect([...messages]).toEqual([
        {
          channel: mockBot.channel,
          direction: "incoming",
          platform: "mock",
          text: "hello from chat",
          username: ChatUsername.makeUnsafe("viewer-1"),
        },
      ]);
    }),
  );

  it.effect("accepts outgoing messages after a bot connects", () =>
    Effect.gen(function* acceptsOutgoingMessagesAfterABotConnects() {
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;

      yield* mockPlatformAdapter.platformAdapter.connect(mockBot);
      yield* mockPlatformAdapter.platformAdapter.sendMessage(mockBot, "bot reply");

      expect(yield* mockPlatformAdapter.getConnectedBots).toEqual([mockBot]);
      expect(yield* mockPlatformAdapter.getSentMessages).toEqual([
        {
          botId: mockBot.botId,
          channel: mockBot.channel,
          direction: "outgoing",
          platform: "mock",
          text: "bot reply",
          username: mockBot.username,
        },
      ]);
    }),
  );
});

describe("twitch platform adapter", () => {
  it.effect("builds a Twitch authorization URL for a configured bot", () =>
    Effect.gen(function* buildsATwitchAuthorizationUrlForAConfiguredBot() {
      const bot = makeTwitchBot();
      const twitchPlatformAdapter = yield* makeTwitchPlatformAdapter({
        botService: makeBotService({ bot, token: null }),
        buildChatClient: () => {
          throw new Error("not used");
        },
        config: twitchConfig,
        exchangeAuthorizationCode: async () => {
          throw new Error("not used");
        },
        now: () => createdAt,
        refreshAccessToken: async () => {
          throw new Error("not used");
        },
      });

      const url = yield* twitchPlatformAdapter.getAuthorizationUrl(bot.id);
      const parsed = new URL(url);

      expect(parsed.origin).toBe("https://id.twitch.tv");
      expect(parsed.pathname).toBe("/oauth2/authorize");
      expect(parsed.searchParams.get("client_id")).toBe(twitchConfig.clientId);
      expect(parsed.searchParams.get("redirect_uri")).toBe(twitchConfig.redirectUri);
      expect(parsed.searchParams.get("scope")).toBe("chat:read chat:edit");
      expect(parsed.searchParams.get("state")).toBe(bot.id);
    }),
  );

  it.effect("stores exchanged Twitch tokens during authorization", () =>
    Effect.gen(function* storesExchangedTwitchTokensDuringAuthorization() {
      const bot = makeTwitchBot();
      let storedToken: BotTokenRecord | null = null;
      const twitchPlatformAdapter = yield* makeTwitchPlatformAdapter({
        botService: makeBotService({
          bot,
          token: null,
          onUpsert: (token) => {
            storedToken = token;
          },
        }),
        buildChatClient: () => {
          throw new Error("not used");
        },
        config: twitchConfig,
        exchangeAuthorizationCode: async () => ({
          accessToken: "authorized-access-token",
          expiresAt: "2026-04-05T00:00:00.000Z",
          refreshToken: "authorized-refresh-token",
          scopes: ["chat:read", "chat:edit"],
        }),
        now: () => createdAt,
        refreshAccessToken: async () => {
          throw new Error("not used");
        },
      });

      const token = yield* twitchPlatformAdapter.completeAuthorization(bot.id, "oauth-code");

      expect(token.accessToken).toBe("authorized-access-token");
      expect(token.refreshToken).toBe("authorized-refresh-token");
      expect(token.expiresAt).toBe("2026-04-05T00:00:00.000Z");
      expect(storedToken).toEqual(token);
    }),
  );

  it.effect("refreshes expired tokens before connecting and sending a test message", () =>
    Effect.gen(function* refreshesExpiredTokensBeforeConnectingAndSendingATestMessage() {
      const bot = makeTwitchBot();
      const startingToken = makeTwitchToken(bot, {
        accessToken: "expired-access-token",
        expiresAt: "2026-04-02T00:00:00.000Z",
        refreshToken: "expired-refresh-token",
      });
      const events: string[] = [];
      let persistedToken: BotTokenRecord | null = null;

      const twitchPlatformAdapter = yield* makeTwitchPlatformAdapter({
        botService: makeBotService({
          bot,
          token: startingToken,
          onUpsert: (token) => {
            persistedToken = token;
          },
        }),
        buildChatClient: ({ channel, clientId, token }) => ({
          connect: () => {
            events.push(`connect:${clientId}:${token.accessToken}`);
          },
          join: async (channelName) => {
            events.push(`join:${channelName || channel}`);
          },
          quit: () => {
            events.push("quit");
          },
          say: async (channelName, text) => {
            events.push(`say:${channelName || channel}:${text}`);
          },
        }),
        config: twitchConfig,
        exchangeAuthorizationCode: async () => {
          throw new Error("not used");
        },
        now: () => updatedAt,
        refreshAccessToken: async ({ refreshToken }) => {
          events.push(`refresh:${refreshToken}`);
          return {
            accessToken: "fresh-access-token",
            expiresAt: "2026-04-06T00:00:00.000Z",
            refreshToken: "fresh-refresh-token",
            scopes: ["chat:read", "chat:edit"],
          };
        },
      });

      const token = yield* twitchPlatformAdapter.sendTestMessage(
        new TwitchTestMessageRequest({
          botId: bot.id,
          channel: "#Lonely_Chat",
          text: "hello twitch",
        }),
      );

      expect(token.accessToken).toBe("fresh-access-token");
      expect(token.refreshToken).toBe("fresh-refresh-token");
      expect(persistedToken).toEqual(token);
      expect(events).toEqual([
        "refresh:expired-refresh-token",
        "connect:twitch-client-id:fresh-access-token",
        "join:lonely_chat",
        "say:lonely_chat:hello twitch",
        "quit",
      ]);
    }),
  );
});

describe("kick session platform adapter", () => {
  it.effect("connects a Kick bot, refreshes expired credentials, and streams chat messages", () =>
    Effect.gen(function* connectsAKickBotRefreshesExpiredCredentialsAndStreamsChatMessages() {
      const bot = makeKickBot();
      const chatClient = new FakeKickSessionClient();
      const events: string[] = [];
      let persistedToken: BotTokenRecord | null = null;

      const kickPlatformAdapter = yield* makeKickSessionPlatformAdapter({
        botService: makeBotService({
          bot,
          token: makeKickToken(bot, {
            accessToken: "kick-expired-access-token",
            expiresAt: "2026-04-02T00:00:00.000Z",
            refreshToken: "kick-expired-refresh-token",
          }),
          onUpsert: (token) => {
            persistedToken = token;
          },
        }),
        buildSessionClient: ({ accessToken, channel }) => {
          events.push(`build:${channel}:${accessToken}`);
          return chatClient;
        },
        config: kickConfig,
        createEventSubscriptions: async () => ["kick-subscription-1"],
        deleteEventSubscriptions: async () => undefined,
        exchangeAuthorizationCode: async () => {
          throw new Error("not used");
        },
        now: () => updatedAt,
        postChatMessage: async ({ accessToken, text }) => {
          events.push(`send:${accessToken}:${text}`);
        },
        refreshAccessToken: async ({ refreshToken }) => {
          events.push(`refresh:${refreshToken}`);
          return {
            accessToken: "kick-fresh-access-token",
            expiresAt: "2026-04-06T00:00:00.000Z",
            refreshToken: "kick-fresh-refresh-token",
            scopes: ["chat:write", "events:subscribe"],
          };
        },
      });
      const kickBot: BotConnection = {
        botId: BotId.makeUnsafe(bot.id),
        channel: ChannelName.makeUnsafe("Lonely_Channel"),
        platform: "kick",
        username: ChatUsername.makeUnsafe(bot.name),
      };

      const messagesFiber = yield* kickPlatformAdapter
        .listenChat(ChannelName.makeUnsafe("lonely_channel"))
        .pipe(Stream.take(2), Stream.runCollect, Effect.forkChild);

      yield* Effect.yieldNow;
      yield* kickPlatformAdapter.connect(kickBot);
      yield* kickPlatformAdapter.sendMessage(kickBot, "hello kick");
      yield* Effect.yieldNow;
      chatClient.emitIncomingMessage("lonely_channel", "viewer-7", "chat says hi");

      const messages = [...(yield* Fiber.join(messagesFiber))];

      expect(chatClient.connectCalls).toBe(1);
      expect(chatClient.sentMessages).toEqual(["hello kick"]);
      expect(persistedToken).toEqual(
        makeKickToken(bot, {
          accessToken: "kick-fresh-access-token",
          expiresAt: "2026-04-06T00:00:00.000Z",
          refreshToken: "kick-fresh-refresh-token",
          updatedAt,
        }),
      );
      expect(events).toEqual([
        "refresh:kick-expired-refresh-token",
        "build:lonely_channel:kick-fresh-access-token",
      ]);
      expect(messages).toEqual([
        {
          botId: kickBot.botId,
          channel: kickBot.channel,
          direction: "outgoing",
          platform: "kick",
          text: "hello kick",
          username: kickBot.username,
        },
        {
          channel: kickBot.channel,
          direction: "incoming",
          platform: "kick",
          text: "chat says hi",
          username: ChatUsername.makeUnsafe("viewer-7"),
        },
      ]);

      yield* kickPlatformAdapter.disconnect(kickBot);

      expect(chatClient.disconnectCalls).toBe(1);
    }),
  );
});
