import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { ChannelName } from "../../platforms/Services/platform-adapter";
import { SessionService, SessionId } from "../Services/session-service";
import type {
  SessionEndReason,
  SessionServiceShape,
  SessionStatus,
} from "../Services/session-service";
import { SessionRecord } from "../session-record";
import { SessionStartError } from "../session-start-error";

const defaultChannel = ChannelName.makeUnsafe("lonely-chat");
const manualEndReason: SessionEndReason = "manual";
const mockPlatform = "mock";
const sessionEndedStatus: SessionStatus = "ended";
const sessionStartedStatus: SessionStatus = "active";

interface SessionRow {
  readonly channel: string;
  readonly end_reason: SessionEndReason | null;
  readonly ended_at: string | null;
  readonly id: string;
  readonly platform: typeof mockPlatform;
  readonly started_at: string;
  readonly status: SessionStatus;
}

const makeSessionRecord = (row: SessionRow): SessionRecord =>
  new SessionRecord({
    channel: ChannelName.makeUnsafe(row.channel),
    endReason: row.end_reason,
    endedAt: row.ended_at,
    id: SessionId.makeUnsafe(row.id),
    platform: row.platform,
    startedAt: row.started_at,
    status: row.status,
  });

const selectSessionColumns = (
  query: Effect.Effect<readonly SessionRow[], SqlError>,
): Effect.Effect<SessionRecord | null, SqlError> =>
  Effect.gen(function* selectSessionColumnsEffect() {
    const rows = yield* query;
    const [session] = rows;

    if (session === undefined) {
      return null;
    }

    return makeSessionRecord(session);
  });

export const SessionServiceLive = Layer.effect(
  SessionService,
  Effect.gen(function* makeSessionService() {
    const sql = yield* SqlClient.SqlClient;
    const activeSessionRef = yield* Ref.make<SessionRecord | null>(
      yield* selectSessionColumns(
        sql<SessionRow>`SELECT id, platform, channel, status, started_at, ended_at, end_reason
          FROM sessions
          WHERE status = ${sessionStartedStatus}
          ORDER BY started_at DESC
          LIMIT 1`,
      ),
    );

    const getActiveSession = Effect.fn("SessionService.getActiveSession")(
      function* getActiveSessionEffect() {
        return yield* Ref.get(activeSessionRef);
      },
    );

    const getMostRecentSession = Effect.fn("SessionService.getMostRecentSession")(
      function* getMostRecentSessionEffect() {
        const activeSession = yield* Ref.get(activeSessionRef);

        if (activeSession !== null) {
          return activeSession;
        }

        return yield* selectSessionColumns(
          sql<SessionRow>`SELECT id, platform, channel, status, started_at, ended_at, end_reason
          FROM sessions
          ORDER BY started_at DESC
          LIMIT 1`,
        );
      },
    );

    const startSession = Effect.fn("SessionService.startSession")(function* startSessionEffect() {
      const activeSession = yield* Ref.get(activeSessionRef);

      if (activeSession !== null) {
        return yield* Effect.fail(
          new SessionStartError({
            reason: "A session is already active.",
          }),
        );
      }

      const session = new SessionRecord({
        channel: defaultChannel,
        endReason: null,
        endedAt: null,
        id: SessionId.makeUnsafe(crypto.randomUUID()),
        platform: mockPlatform,
        startedAt: new Date().toISOString(),
        status: sessionStartedStatus,
      });

      yield* sql`INSERT INTO sessions (
          id,
          platform,
          channel,
          status,
          started_at,
          ended_at,
          end_reason,
          total_messages,
          total_tokens_used,
          total_cost_usd,
          time_limit_seconds,
          cost_limit_usd
        )
        VALUES (
          ${session.id},
          ${session.platform},
          ${session.channel},
          ${session.status},
          ${session.startedAt},
          ${session.endedAt},
          ${session.endReason},
          ${0},
          ${0},
          ${0},
          ${null},
          ${null}
        )`;
      yield* Ref.set(activeSessionRef, session);

      return session;
    });

    const stopSession = Effect.fn("SessionService.stopSession")(function* stopSessionEffect() {
      const activeSession = yield* Ref.get(activeSessionRef);

      if (activeSession === null) {
        return null;
      }

      const endedSession = new SessionRecord({
        channel: activeSession.channel,
        endReason: manualEndReason,
        endedAt: new Date().toISOString(),
        id: activeSession.id,
        platform: activeSession.platform,
        startedAt: activeSession.startedAt,
        status: sessionEndedStatus,
      });

      yield* sql`UPDATE sessions
        SET status = ${endedSession.status},
            ended_at = ${endedSession.endedAt},
            end_reason = ${endedSession.endReason}
        WHERE id = ${endedSession.id}`;
      yield* Ref.set(activeSessionRef, null);

      return endedSession;
    });

    return SessionService.of({
      getActiveSession,
      getMostRecentSession,
      startSession,
      stopSession,
    } satisfies SessionServiceShape);
  }),
);
