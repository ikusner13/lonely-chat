import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeDatabaseLayer } from "../db/database";
import { SessionServiceLive } from "./Layers/session-service";
import { SessionService } from "./Services/session-service";

interface StoredSessionRow {
  readonly channel: string;
  readonly end_reason: string | null;
  readonly ended_at: string | null;
  readonly platform: string;
  readonly started_at: string;
  readonly status: string;
}

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

      return yield* sql<StoredSessionRow>`SELECT platform, channel, status, started_at, ended_at, end_reason
        FROM sessions
        ORDER BY started_at ASC`;
    }),
  );

describe("session service", () => {
  it.effect("persists the mock session lifecycle", () =>
    Effect.gen(function* persistsTheMockSessionLifecycle() {
      const dbPath = yield* createDatabasePath;
      const sessionLayer = SessionServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));

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
          platform: "mock",
          started_at: endedSession?.startedAt ?? "",
          status: "ended",
        },
      ]);
    }),
  );
});
