import type { Effect, Stream } from "effect";
import { Schema, ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { ScenarioId } from "../../scenarios/scenario-record";
import type { SessionMessageRecord } from "../session-message-record";
import type { SessionRecord } from "../session-record";
import type { SessionStartError } from "../session-start-error";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const SessionStatus = Schema.Literals(["active", "ended", "timeout", "cost_limit"]);
export type SessionStatus = typeof SessionStatus.Type;

export const SessionEndReason = Schema.Literals([
  "manual",
  "stream_offline",
  "timeout",
  "cost_limit",
]);
export type SessionEndReason = typeof SessionEndReason.Type;

export interface SessionServiceShape {
  readonly getActiveSession: () => Effect.Effect<SessionRecord | null>;
  readonly getSessionMessages: (
    sessionId: SessionId,
  ) => Effect.Effect<readonly SessionMessageRecord[], SqlError>;
  readonly liveMessages: Stream.Stream<SessionMessageRecord>;
  readonly getMostRecentSession: () => Effect.Effect<SessionRecord | null, SqlError>;
  readonly runScenario: (scenarioId: ScenarioId) => Effect.Effect<boolean, SqlError>;
  readonly startSession: () => Effect.Effect<SessionRecord, SessionStartError | SqlError>;
  readonly stopSession: () => Effect.Effect<SessionRecord | null, SqlError>;
}

export class SessionService extends ServiceMap.Service<SessionService, SessionServiceShape>()(
  "lonely-chat/sessions/Services/SessionService",
) {}
