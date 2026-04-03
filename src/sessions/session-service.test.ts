import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { FakeAiClientLive, makeFakeAiClient } from "../ai/Layers/fake-ai-client";
import { AiClient } from "../ai/Services/ai-client";
import { BotId as PersistedBotId, BotRecord } from "../bots/bot-record";
import { BotServiceLive } from "../bots/Layers/bot-service";
import { makeDatabaseLayer } from "../db/database";
import {
  MockPlatformAdapterLive,
  makeMockPlatformAdapter,
} from "../platforms/Layers/mock-platform-adapter";
import {
  BotId,
  ChannelName,
  ChatUsername,
  PlatformAdapter,
} from "../platforms/Services/platform-adapter";
import type { BotConnection } from "../platforms/Services/platform-adapter";
import { SessionServiceLive } from "./Layers/session-service";
import { SessionService } from "./Services/session-service";

interface StoredSessionRow {
  readonly channel: string;
  readonly end_reason: string | null;
  readonly ended_at: string | null;
  readonly total_messages: number;
  readonly platform: string;
  readonly started_at: string;
  readonly status: string;
}

interface StoredSessionMessageRow {
  readonly bot_id: string | null;
  readonly content: string;
  readonly is_bot: number;
  readonly platform: string;
  readonly session_id: string;
  readonly username: string;
}

const mockBot: BotConnection = {
  botId: BotId.makeUnsafe("bot-1"),
  channel: ChannelName.makeUnsafe("lonely-chat"),
  platform: "mock",
  username: ChatUsername.makeUnsafe("lonely-bot"),
};

const makeStoredBot = (): BotRecord =>
  new BotRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "a durable test bot",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["first line", "second line", "third line"],
    fallbackModels: ["openrouter/fallback-model"],
    firstMessage: null,
    id: PersistedBotId.makeUnsafe("bot-1"),
    maxTokens: 180,
    model: "openrouter/mock-model",
    name: "pixel",
    personality: "dry humor",
    platform: "twitch",
    postHistoryPrompt: null,
    responseLength: {
      max: 12,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 65,
    temperature: 0.8,
    updatedAt: "2026-04-03T00:00:00.000Z",
    vocabularyRules: ["keep it short"],
  });

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-session-"));

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

const runWithDatabase = <Result, Error>(
  dbPath: string,
  effect: Effect.Effect<Result, Error, SqlClient.SqlClient>,
): Effect.Effect<Result, unknown> =>
  Effect.scoped(effect.pipe(Effect.provide(makeDatabaseLayer(dbPath))));

const loadStoredSessions = (dbPath: string): Effect.Effect<readonly StoredSessionRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredSessions() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredSessionRow>`SELECT platform, channel, status, started_at, ended_at, end_reason, total_messages
        FROM sessions
        ORDER BY started_at ASC`;
    }),
  );

const loadStoredSessionMessages = (
  dbPath: string,
): Effect.Effect<readonly StoredSessionMessageRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredSessionMessages() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredSessionMessageRow>`SELECT session_id, bot_id, username, content, platform, is_bot
        FROM session_messages
        ORDER BY sent_at ASC, rowid ASC`;
    }),
  );

const insertStoredBot = (dbPath: string, bot: BotConnection): Effect.Effect<void, unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* insertStoredBotRow() {
      const sql = yield* SqlClient.SqlClient;
      const storedBot = makeStoredBot();

      yield* sql`INSERT INTO bots (
          id,
          name,
          display_name,
          platform,
          model,
          fallback_models,
          temperature,
          max_tokens,
          personality,
          description,
          example_messages,
          first_message,
          post_history_prompt,
          vocabulary_rules,
          response_length_min,
          response_length_max,
          talkativeness,
          system_prompt,
          enabled,
          created_at,
          updated_at
        )
        VALUES (
          ${bot.botId},
          ${storedBot.name},
          ${storedBot.displayName},
          ${storedBot.platform},
          ${"openrouter/mock-model"},
          ${JSON.stringify(["openrouter/fallback-model"])},
          ${0.8},
          ${180},
          ${"dry humor"},
          ${"a durable test bot"},
          ${JSON.stringify(["first line", "second line", "third line"])},
          ${null},
          ${null},
          ${JSON.stringify(["keep it short"])},
          ${3},
          ${12},
          ${65},
          ${null},
          ${1},
          ${storedBot.createdAt},
          ${storedBot.updatedAt}
        )`;
    }),
  );

const waitForStoredSessionMessages = (
  dbPath: string,
  expectedCount: number,
  remainingAttempts = 20,
): Effect.Effect<readonly StoredSessionMessageRow[], unknown> =>
  Effect.gen(function* waitForStoredSessionMessagesEffect() {
    const storedMessages = yield* loadStoredSessionMessages(dbPath);

    if (storedMessages.length >= expectedCount || remainingAttempts <= 1) {
      return storedMessages;
    }

    yield* Effect.yieldNow;

    return yield* waitForStoredSessionMessages(dbPath, expectedCount, remainingAttempts - 1);
  });

const makeSessionTestLayer = (
  dbPath: string,
  platformLayer: Layer.Layer<PlatformAdapter>,
  aiLayer: Layer.Layer<AiClient> = FakeAiClientLive,
) => {
  const databaseLayer = makeDatabaseLayer(dbPath);
  const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
  const sessionServiceLayer = SessionServiceLive.pipe(
    Layer.provide(platformLayer),
    Layer.provide(aiLayer),
    Layer.provide(botServiceLayer),
    Layer.provide(databaseLayer),
  );

  return Layer.mergeAll(aiLayer, botServiceLayer, sessionServiceLayer);
};

describe("session service", () => {
  it.effect("persists the mock session lifecycle", () =>
    Effect.gen(function* persistsTheMockSessionLifecycle() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = makeSessionTestLayer(dbPath, MockPlatformAdapterLive);

      const endedSession = yield* Effect.gen(function* exerciseSessionLifecycle() {
        const sessionService = yield* SessionService;

        const startedSession = yield* sessionService.startSession();

        expect(startedSession.status).toBe("active");
        expect(startedSession.platform).toBe("mock");
        expect(startedSession.channel).toBe("lonely-chat");
        expect(yield* sessionService.getActiveSession()).toEqual(startedSession);

        const stoppedSession = yield* sessionService.stopSession();

        expect(stoppedSession).not.toBeNull();
        expect(yield* sessionService.getActiveSession()).toBeNull();

        return stoppedSession;
      }).pipe(Effect.provide(sessionLayer));

      expect(endedSession).not.toBeNull();
      expect(endedSession?.status).toBe("ended");
      expect(endedSession?.endReason).toBe("manual");
      expect(endedSession?.endedAt).not.toBeNull();

      expect(yield* loadStoredSessions(dbPath)).toEqual([
        {
          channel: "lonely-chat",
          end_reason: "manual",
          ended_at: endedSession?.endedAt ?? null,
          total_messages: 0,
          platform: "mock",
          started_at: endedSession?.startedAt ?? "",
          status: "ended",
        },
      ]);
    }),
  );

  it.effect("bridges persisted live chat messages into the live message stream", () =>
    Effect.gen(function* bridgesPersistedLiveChatMessagesIntoTheLiveMessageStream() {
      const dbPath = yield* createDatabasePath;
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const sessionLayer = makeSessionTestLayer(dbPath, platformLayer);

      const streamedMessage = yield* Effect.gen(function* exerciseLiveMessageBridge() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();

        const liveMessagesFiber = yield* sessionService.liveMessages.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* Effect.yieldNow;
        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hello from the live bridge",
          username: ChatUsername.makeUnsafe("viewer-stream"),
        });

        const [firstMessage] = [...(yield* Fiber.join(liveMessagesFiber))];

        expect(firstMessage).toBeDefined();

        yield* sessionService.stopSession();

        return firstMessage ?? null;
      }).pipe(Effect.provide(sessionLayer));

      const [storedMessage] = yield* waitForStoredSessionMessages(dbPath, 1);

      expect(streamedMessage).toEqual(
        expect.objectContaining({
          botId: null,
          content: "hello from the live bridge",
          isBot: false,
          platform: "mock",
          sessionId: storedMessage?.session_id ?? "",
          username: "viewer-stream",
        }),
      );
    }),
  );

  it.effect("persists incoming and outgoing messages for the active session", () =>
    Effect.gen(function* persistsIncomingAndOutgoingMessagesForTheActiveSession() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, mockBot);
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const sessionLayer = makeSessionTestLayer(dbPath, platformLayer);

      const session = yield* Effect.gen(function* exerciseSessionMessagePersistence() {
        const sessionService = yield* SessionService;

        yield* mockPlatformAdapter.platformAdapter.connect(mockBot);

        const startedSession = yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hello from chat",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });
        yield* mockPlatformAdapter.platformAdapter.sendMessage(mockBot.channel, "bot reply");
        const storedMessages = yield* waitForStoredSessionMessages(dbPath, 2);

        expect(storedMessages).toHaveLength(2);

        const endedSession = yield* sessionService.stopSession();

        return {
          endedAt: endedSession?.endedAt ?? null,
          sessionId: startedSession.id,
          startedAt: startedSession.startedAt,
        };
      }).pipe(Effect.provide(sessionLayer));

      expect(yield* loadStoredSessionMessages(dbPath)).toEqual([
        {
          bot_id: null,
          content: "hello from chat",
          is_bot: 0,
          platform: "mock",
          session_id: session.sessionId,
          username: "viewer-1",
        },
        {
          bot_id: mockBot.botId,
          content: "bot reply",
          is_bot: 1,
          platform: "mock",
          session_id: session.sessionId,
          username: mockBot.username,
        },
      ]);

      expect(yield* loadStoredSessions(dbPath)).toEqual([
        {
          channel: "lonely-chat",
          end_reason: "manual",
          ended_at: session.endedAt,
          total_messages: 2,
          platform: "mock",
          started_at: session.startedAt,
          status: "ended",
        },
      ]);
    }),
  );

  it.effect("responds once when one enabled bot is mentioned", () =>
    Effect.gen(function* respondsOnceWhenOneEnabledBotIsMentioned() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, mockBot);
      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      yield* Effect.gen(function* exerciseMentionResponseLoop() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel you there?",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });

        expect(yield* waitForStoredSessionMessages(dbPath, 2)).toHaveLength(2);
        expect(yield* mockPlatformAdapter.getSentMessages).toEqual([
          {
            botId: mockBot.botId,
            channel: mockBot.channel,
            direction: "outgoing",
            platform: "mock",
            text: "Pixel: [fake:openrouter/mock-model] [external] viewer-1: hey @pixel you there?",
            username: ChatUsername.makeUnsafe("pixel"),
          },
        ]);
        expect(yield* fakeAiClient.getRequests).toEqual([
          expect.objectContaining({
            botName: "Pixel",
            model: "openrouter/mock-model",
          }),
        ]);
      }).pipe(Effect.provide(appLayer));
    }),
  );
});
