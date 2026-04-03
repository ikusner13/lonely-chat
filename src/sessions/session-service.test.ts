import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
        ORDER BY sent_at ASC, id ASC`;
    }),
  );

const insertStoredBot = (dbPath: string, bot: BotConnection): Effect.Effect<void, unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* insertStoredBotRow() {
      const sql = yield* SqlClient.SqlClient;
      const timestamp = "2026-04-03T00:00:00.000Z";

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
          ${bot.username},
          ${bot.username},
          ${bot.platform},
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
          ${timestamp},
          ${timestamp}
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

describe("session service", () => {
  it.effect("persists the mock session lifecycle", () =>
    Effect.gen(function* persistsTheMockSessionLifecycle() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = SessionServiceLive.pipe(
        Layer.provideMerge(MockPlatformAdapterLive),
        Layer.provide(makeDatabaseLayer(dbPath)),
      );

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

  it.effect("persists incoming and outgoing messages for the active session", () =>
    Effect.gen(function* persistsIncomingAndOutgoingMessagesForTheActiveSession() {
      const dbPath = yield* createDatabasePath;
      yield* insertStoredBot(dbPath, mockBot);
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const sessionLayer = SessionServiceLive.pipe(
        Layer.provideMerge(platformLayer),
        Layer.provideMerge(makeDatabaseLayer(dbPath)),
      );

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
});
