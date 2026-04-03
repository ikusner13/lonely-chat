import type { Effect } from "effect";
import { Schema, ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

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
  readonly getMostRecentSession: () => Effect.Effect<SessionRecord | null, SqlError>;
  readonly startSession: () => Effect.Effect<SessionRecord, SessionStartError | SqlError>;
  readonly stopSession: () => Effect.Effect<SessionRecord | null, SqlError>;
}

export class SessionService extends ServiceMap.Service<SessionService, SessionServiceShape>()(
  "lonely-chat/sessions/Services/SessionService",
) {}
