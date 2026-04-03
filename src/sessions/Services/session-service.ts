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

export const SessionLimitMetric = Schema.Literals(["time", "cost"]);
export type SessionLimitMetric = typeof SessionLimitMetric.Type;

export class SessionStartOptions extends Schema.Class<SessionStartOptions>(
  "lonely-chat/sessions/SessionStartOptions",
)({
  costLimitUsd: Schema.NullOr(Schema.Number),
  timeLimitSeconds: Schema.NullOr(Schema.Number),
}) {}

export class SessionAlert extends Schema.Class<SessionAlert>("lonely-chat/sessions/SessionAlert")({
  currentValue: Schema.Number,
  limitValue: Schema.Number,
  metric: SessionLimitMetric,
  sessionId: SessionId,
  thresholdPercent: Schema.Number,
}) {}

export interface SessionServiceShape {
  readonly getActiveAlerts: () => Effect.Effect<readonly SessionAlert[]>;
  readonly getActiveSession: () => Effect.Effect<SessionRecord | null, SqlError>;
  readonly getSessionMessages: (
    sessionId: SessionId,
  ) => Effect.Effect<readonly SessionMessageRecord[], SqlError>;
  readonly liveAlerts: Stream.Stream<SessionAlert>;
  readonly liveMessages: Stream.Stream<SessionMessageRecord>;
  readonly getMostRecentSession: () => Effect.Effect<SessionRecord | null, SqlError>;
  readonly recordCost: (
    tokensUsed: number,
    costUsd: number,
  ) => Effect.Effect<SessionRecord | null, SqlError>;
  readonly runScenario: (scenarioId: ScenarioId) => Effect.Effect<boolean, SqlError>;
  readonly startSession: (
    options?: SessionStartOptions,
  ) => Effect.Effect<SessionRecord, SessionStartError | SqlError>;
  readonly stopSession: () => Effect.Effect<SessionRecord | null, SqlError>;
}

export class SessionService extends ServiceMap.Service<SessionService, SessionServiceShape>()(
  "lonely-chat/sessions/Services/SessionService",
) {}
