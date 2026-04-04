import type { Effect, Stream } from "effect";
import { Schema, ServiceMap } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { BotId, BotPlatform } from "../../bots/bot-record";
import type { ScenarioId } from "../../scenarios/scenario-record";
import type { AnalyticsBotSummary, AnalyticsOverview } from "../session-analytics";
import type { SessionMessageRecord } from "../session-message-record";
import type { SessionRecord } from "../session-record";
import type { SessionStartError } from "../session-start-error";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

export const SessionExportFormat = Schema.Literals(["csv", "json"]);
export type SessionExportFormat = typeof SessionExportFormat.Type;

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

export const BotRuntimeState = Schema.Literals(["online", "degraded", "offline"]);
export type BotRuntimeState = typeof BotRuntimeState.Type;

export const BotRuntimeSignalType = Schema.Literals([
  "auth_failure",
  "ai_failure",
  "degraded",
  "offline",
  "reconnect_attempt",
  "recovered",
]);
export type BotRuntimeSignalType = typeof BotRuntimeSignalType.Type;

export class BotRuntimeStatus extends Schema.Class<BotRuntimeStatus>(
  "lonely-chat/sessions/BotRuntimeStatus",
)({
  botId: BotId,
  botName: Schema.String,
  consecutiveAiFailures: Schema.Number,
  detail: Schema.String,
  displayName: Schema.String,
  platform: BotPlatform,
  state: BotRuntimeState,
  updatedAt: Schema.String,
}) {}

export class BotRuntimeSignal extends Schema.Class<BotRuntimeSignal>(
  "lonely-chat/sessions/BotRuntimeSignal",
)({
  botId: BotId,
  botName: Schema.String,
  createdAt: Schema.String,
  message: Schema.String,
  platform: BotPlatform,
  type: BotRuntimeSignalType,
}) {}

export interface SessionServiceShape {
  readonly exportSession: (
    sessionId: SessionId,
    format: SessionExportFormat,
  ) => Effect.Effect<string | null, SqlError>;
  readonly getActiveAlerts: () => Effect.Effect<readonly SessionAlert[]>;
  readonly getBotRuntimeSignals: () => Effect.Effect<readonly BotRuntimeSignal[]>;
  readonly getBotRuntimeStatuses: () => Effect.Effect<readonly BotRuntimeStatus[]>;
  readonly getAnalyticsBotSummaries: () => Effect.Effect<readonly AnalyticsBotSummary[], SqlError>;
  readonly getAnalyticsOverview: () => Effect.Effect<AnalyticsOverview, SqlError>;
  readonly getAnalyticsSessionHistory: () => Effect.Effect<readonly SessionRecord[], SqlError>;
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
