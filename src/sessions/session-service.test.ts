import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TestClock } from "effect/testing";

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
import { ScenarioServiceLive } from "../scenarios/Layers/scenario-service";
import {
  ScenarioId,
  ScenarioRecord,
  ScenarioStep,
  ScenarioTriggerConfig,
} from "../scenarios/scenario-record";
import { ScenarioService } from "../scenarios/Services/scenario-service";
import type { BotConnection } from "../platforms/Services/platform-adapter";
import { SessionServiceLive } from "./Layers/session-service";
import { SessionService, SessionStartOptions } from "./Services/session-service";

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
  readonly model_used: string | null;
  readonly platform: string;
  readonly session_id: string;
  readonly tokens_used: number | null;
  readonly username: string;
}

interface StoredSessionLimitRow {
  readonly cost_limit_usd: number | null;
  readonly end_reason: string | null;
  readonly status: string;
  readonly time_limit_seconds: number | null;
  readonly total_cost_usd: number;
  readonly total_tokens_used: number;
}

const escapeCsvValue = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const mockBot: BotConnection = {
  botId: BotId.makeUnsafe("bot-1"),
  channel: ChannelName.makeUnsafe("lonely-chat"),
  platform: "mock",
  username: ChatUsername.makeUnsafe("lonely-bot"),
};

const makeStoredBot = (overrides?: Partial<BotRecord>): BotRecord =>
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
    ...overrides,
  });

const makeBotConnection = (bot: BotRecord): BotConnection => ({
  botId: BotId.makeUnsafe(bot.id),
  channel: mockBot.channel,
  platform: "mock",
  username: ChatUsername.makeUnsafe(bot.name),
});

const makeManualScenario = (overrides?: Partial<ScenarioRecord>): ScenarioRecord =>
  new ScenarioRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "Drive a manual merch promotion beat.",
    durationSeconds: 30,
    enabled: true,
    id: ScenarioId.makeUnsafe("scenario-manual-merch"),
    name: "Manual Merch Push",
    participants: [PersistedBotId.makeUnsafe("bot-1")],
    steps: [
      new ScenarioStep({
        action: "say",
        botId: PersistedBotId.makeUnsafe("bot-1"),
        content: "check out the merch",
        delayAfter: 3,
      }),
      new ScenarioStep({
        action: "wait",
        botId: PersistedBotId.makeUnsafe("bot-1"),
        content: null,
        delayAfter: 2,
      }),
      new ScenarioStep({
        action: "respond",
        botId: PersistedBotId.makeUnsafe("bot-1"),
        content: "react to the merch drop naturally",
        delayAfter: 0,
      }),
    ],
    topic: "new merch drop",
    triggerConfig: new ScenarioTriggerConfig({
      delaySeconds: null,
      eventType: null,
    }),
    triggerType: "manual",
    updatedAt: "2026-04-03T00:00:00.000Z",
    ...overrides,
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

      return yield* sql<StoredSessionMessageRow>`SELECT
          session_id,
          bot_id,
          username,
          content,
          platform,
          is_bot,
          model_used,
          tokens_used
        FROM session_messages
        ORDER BY sent_at ASC, rowid ASC`;
    }),
  );

const loadStoredSessionLimits = (
  dbPath: string,
): Effect.Effect<readonly StoredSessionLimitRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredSessionLimits() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredSessionLimitRow>`SELECT
          status,
          end_reason,
          total_tokens_used,
          total_cost_usd,
          time_limit_seconds,
          cost_limit_usd
        FROM sessions
        ORDER BY started_at ASC`;
    }),
  );

const insertStoredBot = (dbPath: string, bot: BotRecord): Effect.Effect<void, unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* insertStoredBotRow() {
      const sql = yield* SqlClient.SqlClient;
      const storedBot = bot;

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
          ${storedBot.id},
          ${storedBot.name},
          ${storedBot.displayName},
          ${storedBot.platform},
          ${storedBot.model},
          ${JSON.stringify(storedBot.fallbackModels)},
          ${storedBot.temperature},
          ${storedBot.maxTokens},
          ${storedBot.personality},
          ${storedBot.description},
          ${JSON.stringify(storedBot.exampleMessages)},
          ${storedBot.firstMessage},
          ${storedBot.postHistoryPrompt},
          ${JSON.stringify(storedBot.vocabularyRules)},
          ${storedBot.responseLength.min},
          ${storedBot.responseLength.max},
          ${storedBot.talkativeness},
          ${storedBot.systemPrompt},
          ${storedBot.enabled ? 1 : 0},
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
  const scenarioServiceLayer = ScenarioServiceLive.pipe(Layer.provide(databaseLayer));
  const sessionDependencies = Layer.mergeAll(
    aiLayer,
    botServiceLayer,
    databaseLayer,
    platformLayer,
    scenarioServiceLayer,
  );
  const sessionServiceLayer = SessionServiceLive.pipe(Layer.provide(sessionDependencies));

  return Layer.mergeAll(aiLayer, botServiceLayer, scenarioServiceLayer, sessionServiceLayer);
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
      yield* insertStoredBot(
        dbPath,
        makeStoredBot({
          talkativeness: 0,
        }),
      );
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
        yield* mockPlatformAdapter.platformAdapter.sendMessage(mockBot, "bot reply");
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
          model_used: null,
          platform: "mock",
          session_id: session.sessionId,
          tokens_used: null,
          username: "viewer-1",
        },
        {
          bot_id: mockBot.botId,
          content: "bot reply",
          is_bot: 1,
          model_used: null,
          platform: "mock",
          session_id: session.sessionId,
          tokens_used: null,
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

  it.effect("exports completed session history as csv and json", () =>
    Effect.gen(function* exportsCompletedSessionHistoryAsCsvAndJson() {
      const dbPath = yield* createDatabasePath;
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const sessionLayer = makeSessionTestLayer(dbPath, platformLayer);

      const exportedSession = yield* Effect.gen(function* exerciseSessionExport() {
        const sessionService = yield* SessionService;

        const startedSession = yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "archive this line",
          username: ChatUsername.makeUnsafe("viewer-export"),
        });
        yield* waitForStoredSessionMessages(dbPath, 1);
        yield* sessionService.stopSession();

        return {
          csv: yield* sessionService.exportSession(startedSession.id, "csv"),
          json: yield* sessionService.exportSession(startedSession.id, "json"),
          messages: yield* sessionService.getSessionMessages(startedSession.id),
        };
      }).pipe(Effect.provide(sessionLayer));

      expect(exportedSession.csv).toBe(
        [
          "timestamp,username,content,is_bot,model_used,tokens_used",
          [
            escapeCsvValue(exportedSession.messages[0]?.sentAt ?? ""),
            escapeCsvValue(exportedSession.messages[0]?.username ?? ""),
            escapeCsvValue(exportedSession.messages[0]?.content ?? ""),
            escapeCsvValue(String(exportedSession.messages[0]?.isBot ?? false)),
            "",
            "",
          ].join(","),
        ].join("\n"),
      );
      expect(exportedSession.json === null ? null : JSON.parse(exportedSession.json)).toEqual(
        exportedSession.messages.map((message) => ({
          botId: message.botId,
          content: message.content,
          id: message.id,
          isBot: message.isBot,
          modelUsed: message.modelUsed,
          platform: message.platform,
          sentAt: message.sentAt,
          sessionId: message.sessionId,
          tokensUsed: message.tokensUsed,
          username: message.username,
        })),
      );
    }),
  );

  it.effect("responds once when one enabled bot is mentioned", () =>
    Effect.gen(function* respondsOnceWhenOneEnabledBotIsMentioned() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, makeStoredBot());
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
        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);

        yield* TestClock.adjust("3 seconds");

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

  it.effect("records live generation model, tokens, and cost on the session", () =>
    Effect.gen(function* recordsLiveGenerationModelTokensAndCostOnTheSession() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, makeStoredBot());
      const aiLayer = Layer.succeed(
        AiClient,
        AiClient.of({
          generateText: Effect.fn("AiClient.generateText")((request) =>
            Effect.succeed({
              costUsd: 0.125,
              model: request.model,
              text: "Pixel: routed through production client",
              tokensUsed: 27,
            }),
          ),
        }),
      );
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      const session = yield* Effect.gen(function* exerciseGenerationAccounting() {
        const sessionService = yield* SessionService;

        const activeSession = yield* sessionService.startSession();
        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel route this",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });
        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);

        yield* TestClock.adjust("3 seconds");

        expect(yield* waitForStoredSessionMessages(dbPath, 2)).toHaveLength(2);

        return activeSession;
      }).pipe(Effect.provide(appLayer));

      expect(yield* loadStoredSessionMessages(dbPath)).toEqual([
        {
          bot_id: null,
          content: "hey @pixel route this",
          is_bot: 0,
          model_used: null,
          platform: "mock",
          session_id: session.id,
          tokens_used: null,
          username: "viewer-1",
        },
        {
          bot_id: mockBot.botId,
          content: "Pixel: routed through production client",
          is_bot: 1,
          model_used: "openrouter/mock-model",
          platform: "mock",
          session_id: session.id,
          tokens_used: 27,
          username: "pixel",
        },
      ]);
      expect(yield* loadStoredSessionLimits(dbPath)).toEqual([
        {
          cost_limit_usd: null,
          end_reason: null,
          status: "active",
          time_limit_seconds: null,
          total_cost_usd: 0.125,
          total_tokens_used: 27,
        },
      ]);
    }),
  );

  it.effect("caps multi-bot mention responses at three bots", () =>
    Effect.gen(function* capsMultiBotMentionResponsesAtThreeBots() {
      const dbPath = yield* createDatabasePath;
      const pixel = makeStoredBot();
      const echo = makeStoredBot({
        createdAt: "2026-04-03T00:00:01.000Z",
        displayName: "Echo",
        id: PersistedBotId.makeUnsafe("bot-2"),
        name: "echo",
        talkativeness: 0,
        updatedAt: "2026-04-03T00:00:01.000Z",
      });
      const nova = makeStoredBot({
        createdAt: "2026-04-03T00:00:02.000Z",
        displayName: "Nova",
        id: PersistedBotId.makeUnsafe("bot-3"),
        name: "nova",
        talkativeness: 0,
        updatedAt: "2026-04-03T00:00:02.000Z",
      });
      const luna = makeStoredBot({
        createdAt: "2026-04-03T00:00:03.000Z",
        displayName: "Luna",
        id: PersistedBotId.makeUnsafe("bot-4"),
        name: "luna",
        talkativeness: 0,
        updatedAt: "2026-04-03T00:00:03.000Z",
      });
      const bots = [pixel, echo, nova, luna];

      for (const bot of bots) {
        yield* insertStoredBot(dbPath, bot);
      }

      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      yield* Effect.gen(function* exerciseResponderCap() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel @echo @nova @luna sound off",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });
        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);

        yield* TestClock.adjust("6 seconds");

        expect(yield* waitForStoredSessionMessages(dbPath, 4)).toHaveLength(4);
        expect(yield* fakeAiClient.getRequests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              botName: "Pixel",
            }),
            expect.objectContaining({
              botName: "Echo",
            }),
            expect.objectContaining({
              botName: "Nova",
            }),
          ]),
        );
        expect(yield* fakeAiClient.getRequests).toHaveLength(3);
        expect(yield* mockPlatformAdapter.getSentMessages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              botId: makeBotConnection(pixel).botId,
              username: ChatUsername.makeUnsafe("pixel"),
            }),
            expect.objectContaining({
              botId: makeBotConnection(echo).botId,
              username: ChatUsername.makeUnsafe("echo"),
            }),
            expect.objectContaining({
              botId: makeBotConnection(nova).botId,
              username: ChatUsername.makeUnsafe("nova"),
            }),
          ]),
        );
        expect(yield* mockPlatformAdapter.getSentMessages).toHaveLength(3);
      }).pipe(Effect.provide(appLayer));
    }),
  );

  it.effect("skips repeated mentions while the bot cooldown is active", () =>
    Effect.gen(function* skipsRepeatedMentionsWhileTheBotCooldownIsActive() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, makeStoredBot());
      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      yield* Effect.gen(function* exerciseBotCooldown() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel first call",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });
        yield* TestClock.adjust("3 seconds");
        expect(yield* waitForStoredSessionMessages(dbPath, 2)).toHaveLength(2);

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel second call",
          username: ChatUsername.makeUnsafe("viewer-2"),
        });

        expect(yield* waitForStoredSessionMessages(dbPath, 3)).toHaveLength(3);
        expect(yield* fakeAiClient.getRequests).toHaveLength(1);
        expect(yield* mockPlatformAdapter.getSentMessages).toHaveLength(1);
        expect(yield* loadStoredSessionMessages(dbPath)).toHaveLength(3);
      }).pipe(Effect.provide(appLayer));
    }),
  );

  it.effect("delays mention responses until the timing window opens", () =>
    Effect.gen(function* delaysMentionResponsesUntilTheTimingWindowOpens() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, makeStoredBot());
      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      yield* Effect.gen(function* exerciseMentionDelay() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* mockPlatformAdapter.emitIncomingMessage({
          channel: mockBot.channel,
          text: "hey @pixel slow down",
          username: ChatUsername.makeUnsafe("viewer-1"),
        });

        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);

        yield* TestClock.adjust("999 millis");

        expect(yield* loadStoredSessionMessages(dbPath)).toHaveLength(1);
        expect(yield* fakeAiClient.getRequests).toHaveLength(0);

        yield* TestClock.adjust("2001 millis");

        expect(yield* waitForStoredSessionMessages(dbPath, 2)).toHaveLength(2);
        expect(yield* fakeAiClient.getRequests).toHaveLength(1);
      }).pipe(Effect.provide(appLayer));
    }),
  );

  it.effect("runs manual scenario say, wait, and respond steps in order", () =>
    Effect.gen(function* runsManualScenarioSayWaitAndRespondStepsInOrder() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, makeStoredBot());
      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);
      const scenario = makeManualScenario();

      const session = yield* Effect.gen(function* exerciseManualScenarioRunner() {
        const scenarioService = yield* ScenarioService;
        const sessionService = yield* SessionService;

        yield* scenarioService.createScenario(scenario);

        const startedSession = yield* sessionService.startSession();

        expect(yield* sessionService.runScenario(scenario.id)).toBe(true);
        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);
        expect(yield* fakeAiClient.getRequests).toHaveLength(0);
        expect(yield* mockPlatformAdapter.getSentMessages).toEqual([
          {
            botId: mockBot.botId,
            channel: mockBot.channel,
            direction: "outgoing",
            platform: "mock",
            text: "check out the merch",
            username: ChatUsername.makeUnsafe("pixel"),
          },
        ]);

        yield* TestClock.adjust("3 seconds");

        expect(yield* loadStoredSessionMessages(dbPath)).toHaveLength(1);
        expect(yield* fakeAiClient.getRequests).toHaveLength(0);

        yield* TestClock.adjust("2 seconds");

        expect(yield* waitForStoredSessionMessages(dbPath, 2)).toHaveLength(2);
        const [scenarioRequest] = yield* fakeAiClient.getRequests;

        expect(scenarioRequest).toBeDefined();
        expect(scenarioRequest?.botName).toBe("Pixel");
        expect(scenarioRequest?.messages).toContainEqual({
          content: "Scenario topic: new merch drop\nStep hint: react to the merch drop naturally",
          role: "user",
        });
        expect(yield* mockPlatformAdapter.getSentMessages).toEqual([
          {
            botId: mockBot.botId,
            channel: mockBot.channel,
            direction: "outgoing",
            platform: "mock",
            text: "check out the merch",
            username: ChatUsername.makeUnsafe("pixel"),
          },
          {
            botId: mockBot.botId,
            channel: mockBot.channel,
            direction: "outgoing",
            platform: "mock",
            text: "Pixel: [fake:openrouter/mock-model] Scenario topic: new merch drop Step hint: react to the merch drop naturally",
            username: ChatUsername.makeUnsafe("pixel"),
          },
        ]);

        return startedSession;
      }).pipe(Effect.provide(appLayer));

      const storedMessages = yield* loadStoredSessionMessages(dbPath);

      expect(storedMessages).toHaveLength(2);
      expect(storedMessages[0]).toEqual({
        bot_id: mockBot.botId,
        content: "check out the merch",
        is_bot: 1,
        model_used: null,
        platform: "mock",
        session_id: session.id,
        tokens_used: null,
        username: "pixel",
      });
      expect(storedMessages[1]).toMatchObject({
        bot_id: mockBot.botId,
        content:
          "Pixel: [fake:openrouter/mock-model] Scenario topic: new merch drop Step hint: react to the merch drop naturally",
        is_bot: 1,
        model_used: "openrouter/mock-model",
        platform: "mock",
        session_id: session.id,
        username: "pixel",
      });
      expect(storedMessages[1]?.tokens_used).toEqual(expect.any(Number));
    }),
  );

  it.effect("schedules a silence-breaker response after inactivity", () =>
    Effect.gen(function* schedulesASilenceBreakerResponseAfterInactivity() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(
        dbPath,
        makeStoredBot({
          talkativeness: 100,
        }),
      );
      const fakeAiClient = yield* makeFakeAiClient;
      const aiLayer = Layer.succeed(AiClient, AiClient.of(fakeAiClient.aiClient));
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const appLayer = makeSessionTestLayer(dbPath, platformLayer, aiLayer);

      yield* Effect.gen(function* exerciseSilenceBreaker() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession();
        yield* Effect.yieldNow;

        yield* TestClock.adjust("14 seconds");

        expect(yield* loadStoredSessionMessages(dbPath)).toHaveLength(0);
        expect(yield* fakeAiClient.getRequests).toHaveLength(0);

        yield* TestClock.adjust("9 seconds");

        expect(yield* waitForStoredSessionMessages(dbPath, 1)).toHaveLength(1);
        const [silenceBreakerRequest] = yield* fakeAiClient.getRequests;
        const silenceBreakerMessage = silenceBreakerRequest?.messages.find(
          (message) => message.role === "user",
        );

        expect(silenceBreakerRequest).toBeDefined();
        expect(silenceBreakerMessage).toEqual(
          expect.objectContaining({
            content: "Start a new conversation topic naturally.",
            role: "user",
          }),
        );
        expect(yield* mockPlatformAdapter.getSentMessages).toHaveLength(1);
      }).pipe(Effect.provide(appLayer));
    }),
  );

  it.effect("emits cost alerts at the 50, 75, and 90 percent thresholds", () =>
    Effect.gen(function* emitsCostAlertsAtTheConfiguredThresholds() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = makeSessionTestLayer(dbPath, MockPlatformAdapterLive);

      const alerts = yield* Effect.gen(function* exerciseCostAlerts() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession(
          new SessionStartOptions({
            costLimitUsd: 1,
            timeLimitSeconds: null,
          }),
        );

        const alertsFiber = yield* sessionService.liveAlerts.pipe(
          Stream.take(3),
          Stream.runCollect,
          Effect.forkChild,
        );

        yield* Effect.yieldNow;
        yield* sessionService.recordCost(100, 0.5);
        yield* sessionService.recordCost(50, 0.25);
        yield* sessionService.recordCost(25, 0.15);

        return [...(yield* Fiber.join(alertsFiber))];
      }).pipe(Effect.provide(sessionLayer));

      expect(alerts.map((alert) => [alert.metric, alert.thresholdPercent])).toEqual([
        ["cost", 50],
        ["cost", 75],
        ["cost", 90],
      ]);
    }),
  );

  it.effect("ends the session automatically when the time limit is crossed", () =>
    Effect.gen(function* endsTheSessionAutomaticallyWhenTheTimeLimitIsCrossed() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = makeSessionTestLayer(dbPath, MockPlatformAdapterLive);

      yield* Effect.gen(function* exerciseTimeoutLimit() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession(
          new SessionStartOptions({
            costLimitUsd: null,
            timeLimitSeconds: 4,
          }),
        );

        yield* TestClock.adjust("4 seconds");
        yield* Effect.yieldNow;

        expect(yield* sessionService.getActiveSession()).toBeNull();
      }).pipe(Effect.provide(sessionLayer));

      expect(yield* loadStoredSessionLimits(dbPath)).toEqual([
        {
          cost_limit_usd: null,
          end_reason: "timeout",
          status: "timeout",
          time_limit_seconds: 4,
          total_cost_usd: 0,
          total_tokens_used: 0,
        },
      ]);
    }),
  );

  it.effect("ends the session automatically when the cost limit is crossed", () =>
    Effect.gen(function* endsTheSessionAutomaticallyWhenTheCostLimitIsCrossed() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = makeSessionTestLayer(dbPath, MockPlatformAdapterLive);

      yield* Effect.gen(function* exerciseCostLimit() {
        const sessionService = yield* SessionService;

        yield* sessionService.startSession(
          new SessionStartOptions({
            costLimitUsd: 1,
            timeLimitSeconds: null,
          }),
        );
        yield* sessionService.recordCost(120, 1.05);

        expect(yield* sessionService.getActiveSession()).toBeNull();
      }).pipe(Effect.provide(sessionLayer));

      expect(yield* loadStoredSessionLimits(dbPath)).toEqual([
        {
          cost_limit_usd: 1,
          end_reason: "cost_limit",
          status: "cost_limit",
          time_limit_seconds: null,
          total_cost_usd: 1.05,
          total_tokens_used: 120,
        },
      ]);
    }),
  );
});
