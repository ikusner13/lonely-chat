import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import type { AiGenerationError } from "../../ai/ai-generation-error";
import { AiClient } from "../../ai/Services/ai-client";
import type { AiGenerateResponse } from "../../ai/Services/ai-client";
import type { BotRecord } from "../../bots/bot-record";
import { BotService } from "../../bots/Services/bot-service";
import {
  advanceSpeakerState,
  calculateResponseDelay,
  isEligibleSpeaker,
  makeMentionResponseRequest,
  makeScenarioResponseRequest,
  makeSilenceBreakerRequest,
  responseTriggerForSelectionReason,
  selectSilenceBreaker,
  selectSpeakers,
} from "../../orchestration/mention-response";
import type { BotSpeakerState, ResponseTrigger } from "../../orchestration/mention-response";
import {
  decodeDirectorEvaluation,
  makeDirectorDirective,
  makeDirectorEvaluationRequest,
  shouldEvaluateDirector,
} from "../../orchestration/director";
import type { DirectorDirective } from "../../orchestration/director";
import {
  BotId as PlatformBotId,
  ChannelName,
  ChatUsername,
  PlatformAdapter,
} from "../../platforms/Services/platform-adapter";
import type {
  ChatMessage,
  PlatformConnectionError,
  PlatformSendError,
} from "../../platforms/Services/platform-adapter";
import type { ScenarioId, ScenarioRecord, ScenarioStep } from "../../scenarios/scenario-record";
import { ScenarioService } from "../../scenarios/Services/scenario-service";
import {
  SessionAlert,
  SessionService,
  SessionId,
  SessionStartOptions,
} from "../Services/session-service";
import { SessionMessageId, SessionMessageRecord } from "../session-message-record";
import { SessionRecord } from "../session-record";
import { SessionStartError } from "../session-start-error";

const defaultChannel = ChannelName.makeUnsafe("lonely-chat");
type SessionEndReason = "cost_limit" | "manual" | "timeout";
type SessionExportFormat = "csv" | "json";
type SessionLimitMetric = "cost" | "time";
type SessionStatus = "active" | "cost_limit" | "ended" | "timeout";

const manualEndReason: SessionEndReason = "manual";
const mockPlatform = "mock";
const sessionEndedStatus: SessionStatus = "ended";
const sessionStartedStatus: SessionStatus = "active";
const sessionTimedOutStatus: SessionStatus = "timeout";
const sessionCostLimitStatus: SessionStatus = "cost_limit";
const liveBufferCapacity = 128;
const silenceThresholdMs = 15_000;
const sessionLimitCheckInterval = Duration.seconds(1);
const alertThresholdPercents = [50, 75, 90] as const;

interface SessionRow {
  readonly channel: string;
  readonly cost_limit_usd: number | null;
  readonly end_reason: SessionEndReason | null;
  readonly ended_at: string | null;
  readonly id: string;
  readonly platform: typeof mockPlatform;
  readonly started_at: string;
  readonly status: SessionStatus;
  readonly time_limit_seconds: number | null;
  readonly total_cost_usd: number;
  readonly total_messages: number;
  readonly total_tokens_used: number;
}

interface SessionMessageRow {
  readonly bot_id: string | null;
  readonly content: string;
  readonly id: string;
  readonly is_bot: number;
  readonly model_used: string | null;
  readonly platform: ChatMessage["platform"];
  readonly sent_at: string;
  readonly session_id: string;
  readonly tokens_used: number | null;
  readonly username: string;
}

type MessageListenerFiber = Fiber.Fiber<
  void,
  AiGenerationError | PlatformConnectionError | PlatformSendError | SqlError
>;
type SessionTaskFiber = Fiber.Fiber<void, unknown>;

interface ExecutableScenarioStep {
  readonly bot: BotRecord | null;
  readonly step: ScenarioStep;
}

interface PendingGeneratedMessage {
  readonly botId: PlatformBotId;
  readonly costUsd: number;
  readonly modelUsed: string;
  readonly platform: ChatMessage["platform"];
  readonly text: string;
  readonly tokensUsed: number;
  readonly username: ChatUsername;
}

const sessionExportCsvHeader = [
  "timestamp",
  "username",
  "content",
  "is_bot",
  "model_used",
  "tokens_used",
] as const;

const updateSessionRecord = (
  session: SessionRecord,
  overrides: Partial<{
    readonly channel: SessionRecord["channel"];
    readonly costLimitUsd: SessionRecord["costLimitUsd"];
    readonly endReason: SessionRecord["endReason"];
    readonly endedAt: SessionRecord["endedAt"];
    readonly id: SessionRecord["id"];
    readonly platform: SessionRecord["platform"];
    readonly startedAt: SessionRecord["startedAt"];
    readonly status: SessionRecord["status"];
    readonly timeLimitSeconds: SessionRecord["timeLimitSeconds"];
    readonly totalCostUsd: SessionRecord["totalCostUsd"];
    readonly totalMessages: SessionRecord["totalMessages"];
    readonly totalTokensUsed: SessionRecord["totalTokensUsed"];
  }>,
): SessionRecord =>
  new SessionRecord({
    channel: overrides.channel ?? session.channel,
    costLimitUsd: overrides.costLimitUsd ?? session.costLimitUsd,
    endReason: overrides.endReason ?? session.endReason,
    endedAt: overrides.endedAt ?? session.endedAt,
    id: overrides.id ?? session.id,
    platform: overrides.platform ?? session.platform,
    startedAt: overrides.startedAt ?? session.startedAt,
    status: overrides.status ?? session.status,
    timeLimitSeconds: overrides.timeLimitSeconds ?? session.timeLimitSeconds,
    totalCostUsd: overrides.totalCostUsd ?? session.totalCostUsd,
    totalMessages: overrides.totalMessages ?? session.totalMessages,
    totalTokensUsed: overrides.totalTokensUsed ?? session.totalTokensUsed,
  });

const makeSessionRecord = (row: SessionRow): SessionRecord =>
  new SessionRecord({
    channel: ChannelName.makeUnsafe(row.channel),
    costLimitUsd: row.cost_limit_usd,
    endReason: row.end_reason,
    endedAt: row.ended_at,
    id: SessionId.makeUnsafe(row.id),
    platform: row.platform,
    startedAt: row.started_at,
    status: row.status,
    timeLimitSeconds: row.time_limit_seconds,
    totalCostUsd: row.total_cost_usd,
    totalMessages: row.total_messages,
    totalTokensUsed: row.total_tokens_used,
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

const makeSessionMessageRecord = (
  sessionId: SessionId,
  message: ChatMessage,
  sentAt: string,
  metadata?: PendingGeneratedMessage | null,
): SessionMessageRecord =>
  new SessionMessageRecord({
    botId: message.botId ?? null,
    content: message.text,
    id: SessionMessageId.makeUnsafe(crypto.randomUUID()),
    isBot: message.direction === "outgoing",
    modelUsed: metadata?.modelUsed ?? null,
    platform: message.platform,
    sentAt,
    sessionId,
    tokensUsed: metadata?.tokensUsed ?? null,
    username: message.username,
  });

const makeStoredSessionMessageRecord = (row: SessionMessageRow): SessionMessageRecord =>
  new SessionMessageRecord({
    botId: row.bot_id === null ? null : PlatformBotId.makeUnsafe(row.bot_id),
    content: row.content,
    id: SessionMessageId.makeUnsafe(row.id),
    isBot: row.is_bot === 1,
    modelUsed: row.model_used,
    platform: row.platform,
    sentAt: row.sent_at,
    sessionId: SessionId.makeUnsafe(row.session_id),
    tokensUsed: row.tokens_used,
    username: ChatUsername.makeUnsafe(row.username),
  });

const serializeSessionMessage = (message: SessionMessageRecord) => ({
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
});

const escapeCsvValue = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const renderCsvValue = (value: boolean | number | string | null): string => {
  if (value === null) {
    return "";
  }

  return escapeCsvValue(String(value));
};

const renderSessionMessagesCsv = (messages: readonly SessionMessageRecord[]): string =>
  [
    sessionExportCsvHeader.join(","),
    ...messages.map((message) =>
      [
        renderCsvValue(message.sentAt),
        renderCsvValue(message.username),
        renderCsvValue(message.content),
        renderCsvValue(message.isBot),
        renderCsvValue(message.modelUsed),
        renderCsvValue(message.tokensUsed),
      ].join(","),
    ),
  ].join("\n");

export const SessionServiceLive = Layer.effect(
  SessionService,
  Effect.acquireRelease(
    Effect.gen(function* makeSessionService() {
      const aiClient = yield* AiClient;
      const botService = yield* BotService;
      const scenarioService = yield* ScenarioService;
      const sql = yield* SqlClient.SqlClient;
      const platformAdapter = yield* PlatformAdapter;
      const serviceScope = yield* Scope.make();
      const liveAlertsPubSub = yield* PubSub.bounded<SessionAlert>({
        capacity: liveBufferCapacity,
      });
      const liveMessagesPubSub = yield* PubSub.bounded<SessionMessageRecord>({
        capacity: liveBufferCapacity,
      });
      const activeSessionRef = yield* Ref.make<SessionRecord | null>(
        yield* selectSessionColumns(
          sql<SessionRow>`SELECT
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
            FROM sessions
            WHERE status = ${sessionStartedStatus}
            ORDER BY started_at DESC
            LIMIT 1`,
        ),
      );
      const activeAlertsRef = yield* Ref.make<readonly SessionAlert[]>([]);
      const messageListenerRef = yield* Ref.make<MessageListenerFiber | null>(null);
      const scenarioFiberRef = yield* Ref.make<SessionTaskFiber | null>(null);
      const scheduledResponseFibersRef = yield* Ref.make<readonly SessionTaskFiber[]>([]);
      const sessionTimerRef = yield* Ref.make<SessionTaskFiber | null>(null);
      const silenceBreakerRef = yield* Ref.make<SessionTaskFiber | null>(null);
      const speakerStatesRef = yield* Ref.make<readonly BotSpeakerState[]>([]);
      const lastActivityAtRef = yield* Ref.make<number | null>(null);
      const pendingGeneratedMessagesRef = yield* Ref.make<readonly PendingGeneratedMessage[]>([]);
      const directorDirectiveRef = yield* Ref.make<DirectorDirective | null>(null);
      const directorLastEvaluatedAtRef = yield* Ref.make<number | null>(null);
      const directorMessagesSinceLastEvaluationRef = yield* Ref.make(0);
      const activeScenarioTopicRef = yield* Ref.make<string | null>(null);

      const getCurrentTimestamp = Effect.fn("SessionService.getCurrentTimestamp")(
        function* getCurrentTimestampEffect() {
          return new Date(yield* Clock.currentTimeMillis).toISOString();
        },
      );

      const updateActiveSession = Effect.fn("SessionService.updateActiveSession")(
        function* updateActiveSessionEffect(
          sessionId: SessionId,
          update: (session: SessionRecord) => SessionRecord,
        ) {
          const activeSession = yield* Ref.get(activeSessionRef);

          if (activeSession?.id !== sessionId) {
            return null;
          }

          const nextSession = update(activeSession);

          yield* Ref.set(activeSessionRef, nextSession);

          return nextSession;
        },
      );

      const registerPendingGeneratedMessage = Effect.fn(
        "SessionService.registerPendingGeneratedMessage",
      )(function* registerPendingGeneratedMessageEffect(message: PendingGeneratedMessage) {
        yield* Ref.update(pendingGeneratedMessagesRef, (messages) => [...messages, message]);
      });

      const takePendingGeneratedMessage = Effect.fn("SessionService.takePendingGeneratedMessage")(
        function* takePendingGeneratedMessageEffect(message: ChatMessage) {
          if (message.direction !== "outgoing" || message.botId === undefined) {
            return null;
          }

          const pendingMessages = yield* Ref.get(pendingGeneratedMessagesRef);
          const pendingIndex = pendingMessages.findIndex(
            (pendingMessage) =>
              pendingMessage.botId === message.botId &&
              pendingMessage.platform === message.platform &&
              pendingMessage.text === message.text &&
              pendingMessage.username === message.username,
          );

          if (pendingIndex === -1) {
            return null;
          }

          const pendingMessage = pendingMessages[pendingIndex] ?? null;

          yield* Ref.set(
            pendingGeneratedMessagesRef,
            pendingMessages.filter((_, index) => index !== pendingIndex),
          );

          return pendingMessage;
        },
      );

      const persistMessage = Effect.fn("SessionService.persistMessage")(
        function* persistMessageEffect(sessionId: SessionId, message: ChatMessage) {
          const metadata = yield* takePendingGeneratedMessage(message);
          const storedMessage = makeSessionMessageRecord(
            sessionId,
            message,
            yield* getCurrentTimestamp(),
            metadata,
          );

          yield* sql`INSERT INTO session_messages (
            id,
            session_id,
            bot_id,
            username,
            content,
            platform,
            is_bot,
            tokens_used,
            model_used,
            sent_at
          )
          VALUES (
            ${storedMessage.id},
            ${storedMessage.sessionId},
            ${storedMessage.botId},
            ${storedMessage.username},
            ${storedMessage.content},
            ${storedMessage.platform},
            ${storedMessage.isBot ? 1 : 0},
            ${storedMessage.tokensUsed},
            ${storedMessage.modelUsed},
            ${storedMessage.sentAt}
          )`;
          yield* sql`UPDATE sessions
            SET total_messages = total_messages + 1
            WHERE id = ${sessionId}`;
          yield* updateActiveSession(sessionId, (session) =>
            updateSessionRecord(session, {
              totalMessages: session.totalMessages + 1,
            }),
          );

          yield* PubSub.publish(liveMessagesPubSub, storedMessage);
          yield* Ref.set(lastActivityAtRef, yield* Clock.currentTimeMillis);
          yield* Ref.update(
            directorMessagesSinceLastEvaluationRef,
            (messageCount) => messageCount + 1,
          );
        },
      );

      const getSessionMessages = Effect.fn("SessionService.getSessionMessages")(
        function* getSessionMessagesEffect(sessionId: SessionId) {
          const rows = yield* sql<SessionMessageRow>`SELECT
              id,
              session_id,
              bot_id,
              username,
              content,
              platform,
              is_bot,
              tokens_used,
              model_used,
              sent_at
            FROM session_messages
            WHERE session_id = ${sessionId}
            ORDER BY sent_at ASC, rowid ASC`;

          return rows.map(makeStoredSessionMessageRecord);
        },
      );

      const getSessionById = Effect.fn("SessionService.getSessionById")(
        function* getSessionByIdEffect(sessionId: SessionId) {
          return yield* selectSessionColumns(
            sql<SessionRow>`SELECT
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
            FROM sessions
            WHERE id = ${sessionId}
            LIMIT 1`,
          );
        },
      );

      const exportSession = Effect.fn("SessionService.exportSession")(function* exportSessionEffect(
        sessionId: SessionId,
        format: SessionExportFormat,
      ) {
        const session = yield* getSessionById(sessionId);

        if (session === null) {
          return null;
        }

        const messages = yield* getSessionMessages(sessionId);

        if (format === "json") {
          return JSON.stringify(messages.map(serializeSessionMessage), null, 2);
        }

        return renderSessionMessagesCsv(messages);
      });

      const stopActiveScenario = Effect.fn("SessionService.stopActiveScenario")(
        function* stopActiveScenarioEffect() {
          const scenarioFiber = yield* Ref.get(scenarioFiberRef);

          yield* Ref.set(activeScenarioTopicRef, null);

          if (scenarioFiber === null) {
            return;
          }

          yield* Fiber.interrupt(scenarioFiber);
          yield* Ref.set(scenarioFiberRef, null);
        },
      );

      const interruptTrackedFibers = Effect.fn("SessionService.interruptTrackedFibers")(
        function* interruptTrackedFibersEffect() {
          const scheduledResponseFibers = yield* Ref.get(scheduledResponseFibersRef);

          for (const fiber of scheduledResponseFibers) {
            yield* Fiber.interrupt(fiber);
          }

          yield* Ref.set(scheduledResponseFibersRef, []);
        },
      );

      const stopSilenceBreaker = Effect.fn("SessionService.stopSilenceBreaker")(
        function* stopSilenceBreakerEffect() {
          const silenceBreaker = yield* Ref.get(silenceBreakerRef);

          if (silenceBreaker === null) {
            return;
          }

          yield* Fiber.interrupt(silenceBreaker);
          yield* Ref.set(silenceBreakerRef, null);
        },
      );

      const stopSessionTimer = Effect.fn("SessionService.stopSessionTimer")(
        function* stopSessionTimerEffect() {
          const sessionTimer = yield* Ref.get(sessionTimerRef);

          if (sessionTimer === null) {
            return;
          }

          yield* Fiber.interrupt(sessionTimer);
          yield* Ref.set(sessionTimerRef, null);
        },
      );

      const emitAlert = Effect.fn("SessionService.emitAlert")(function* emitAlertEffect(
        session: SessionRecord,
        metric: SessionLimitMetric,
        thresholdPercent: number,
        currentValue: number,
        limitValue: number,
      ) {
        const existingAlerts = yield* Ref.get(activeAlertsRef);

        if (
          existingAlerts.some(
            (alert) =>
              alert.sessionId === session.id &&
              alert.metric === metric &&
              alert.thresholdPercent === thresholdPercent,
          )
        ) {
          return;
        }

        const alert = new SessionAlert({
          currentValue,
          limitValue,
          metric,
          sessionId: session.id,
          thresholdPercent,
        });

        yield* Ref.set(activeAlertsRef, [...existingAlerts, alert]);
        yield* PubSub.publish(liveAlertsPubSub, alert);
      });

      const emitThresholdAlerts = Effect.fn("SessionService.emitThresholdAlerts")(
        function* emitThresholdAlertsEffect(
          session: SessionRecord,
          metric: SessionLimitMetric,
          currentValue: number,
          limitValue: number | null,
        ) {
          if (limitValue === null || limitValue <= 0) {
            return;
          }

          const usedPercent = (currentValue / limitValue) * 100;

          for (const thresholdPercent of alertThresholdPercents) {
            if (usedPercent >= thresholdPercent) {
              yield* emitAlert(session, metric, thresholdPercent, currentValue, limitValue);
            }
          }
        },
      );

      const consumeDirectorHint = Effect.fn("SessionService.consumeDirectorHint")(
        function* consumeDirectorHintEffect() {
          const directorDirective = yield* Ref.get(directorDirectiveRef);

          if (directorDirective === null) {
            return null;
          }

          yield* Ref.set(directorDirectiveRef, null);

          return directorDirective.hint;
        },
      );

      const evaluateDirector = Effect.fn("SessionService.evaluateDirector")(
        function* evaluateDirectorEffect(session: SessionRecord) {
          const bots = yield* botService.listBots();
          const recentMessages = yield* getSessionMessages(session.id);

          if (bots.length === 0 || recentMessages.length === 0) {
            return;
          }

          const now = yield* Clock.currentTimeMillis;
          const activeScenarioTopic = yield* Ref.get(activeScenarioTopicRef);
          const lastEvaluatedAt = yield* Ref.get(directorLastEvaluatedAtRef);
          const messagesSinceLastEvaluation = yield* Ref.get(
            directorMessagesSinceLastEvaluationRef,
          );
          const currentDirective = yield* Ref.get(directorDirectiveRef);

          if (
            !shouldEvaluateDirector({
              lastEvaluatedAt,
              messagesSinceLastEvaluation,
              now,
              scenarioInjectionRequested: activeScenarioTopic !== null && currentDirective === null,
            })
          ) {
            return;
          }

          const evaluation = yield* aiClient
            .generateText(
              makeDirectorEvaluationRequest(
                bots,
                session.platform,
                recentMessages,
                activeScenarioTopic,
              ),
            )
            .pipe(
              Effect.map((response) => response.text),
              Effect.flatMap((responseText) =>
                Effect.try({
                  catch: () => null,
                  try: () => decodeDirectorEvaluation(responseText),
                }),
              ),
              Effect.catch(() => Effect.succeed(null)),
            );

          if (evaluation === null) {
            return;
          }

          yield* Ref.set(directorDirectiveRef, makeDirectorDirective(evaluation));
          yield* Ref.set(directorLastEvaluatedAtRef, now);
          yield* Ref.set(directorMessagesSinceLastEvaluationRef, 0);
        },
      );

      const stopMessageListener = Effect.fn("SessionService.stopMessageListener")(
        function* stopMessageListenerEffect() {
          const messageListener = yield* Ref.get(messageListenerRef);

          if (messageListener === null) {
            return;
          }

          yield* Fiber.interrupt(messageListener);
          yield* Ref.set(messageListenerRef, null);
        },
      );

      const endSession = Effect.fn("SessionService.endSession")(function* endSessionEffect(
        status: SessionStatus,
        endReason: SessionEndReason,
      ) {
        const activeSession = yield* Ref.get(activeSessionRef);

        if (activeSession === null) {
          return null;
        }

        yield* stopActiveScenario();
        const endedSession = updateSessionRecord(activeSession, {
          endReason,
          endedAt: yield* getCurrentTimestamp(),
          status,
        });

        yield* sql`UPDATE sessions
          SET status = ${endedSession.status},
              ended_at = ${endedSession.endedAt},
              end_reason = ${endedSession.endReason}
          WHERE id = ${endedSession.id}`;
        yield* stopMessageListener();
        yield* stopSilenceBreaker();
        yield* stopSessionTimer();
        yield* interruptTrackedFibers();
        yield* Ref.set(activeSessionRef, null);
        yield* Ref.set(activeAlertsRef, []);
        yield* Ref.set(lastActivityAtRef, null);
        yield* Ref.set(pendingGeneratedMessagesRef, []);
        yield* Ref.set(speakerStatesRef, []);
        yield* Ref.set(directorDirectiveRef, null);
        yield* Ref.set(directorLastEvaluatedAtRef, null);
        yield* Ref.set(directorMessagesSinceLastEvaluationRef, 0);
        yield* Ref.set(activeScenarioTopicRef, null);

        return endedSession;
      });

      const checkTimeLimit = Effect.fn("SessionService.checkTimeLimit")(
        function* checkTimeLimitEffect() {
          const activeSession = yield* Ref.get(activeSessionRef);

          if (activeSession === null || activeSession.timeLimitSeconds === null) {
            return;
          }

          const elapsedSeconds =
            (yield* Clock.currentTimeMillis) / 1000 - Date.parse(activeSession.startedAt) / 1000;

          yield* emitThresholdAlerts(
            activeSession,
            "time",
            elapsedSeconds,
            activeSession.timeLimitSeconds,
          );

          if (elapsedSeconds >= activeSession.timeLimitSeconds) {
            yield* endSession(sessionTimedOutStatus, "timeout");
          }
        },
      );

      const startSessionTimer = Effect.fn("SessionService.startSessionTimer")(
        function* startSessionTimerEffect(session: SessionRecord) {
          yield* stopSessionTimer();

          if (session.timeLimitSeconds === null) {
            return;
          }

          const sessionTimer = yield* Effect.forever(
            Effect.gen(function* watchSessionTimeEffect() {
              yield* Effect.sleep(sessionLimitCheckInterval);

              const activeSession = yield* Ref.get(activeSessionRef);

              if (activeSession?.id !== session.id) {
                return;
              }

              yield* checkTimeLimit();
            }),
          ).pipe(Effect.forkIn(serviceScope));

          yield* Ref.set(sessionTimerRef, sessionTimer);
          yield* Effect.yieldNow;
        },
      );

      const sendScenarioMessage = Effect.fn("SessionService.sendScenarioMessage")(
        function* sendScenarioMessageEffect(session: SessionRecord, bot: BotRecord, text: string) {
          const speakerConnection = {
            botId: PlatformBotId.makeUnsafe(bot.id),
            channel: session.channel,
            platform: session.platform,
            username: ChatUsername.makeUnsafe(bot.name),
          } as const;

          yield* platformAdapter.connect(speakerConnection);
          yield* platformAdapter.sendMessage(speakerConnection, text);
          yield* Ref.set(
            speakerStatesRef,
            advanceSpeakerState(
              yield* Ref.get(speakerStatesRef),
              speakerConnection.botId,
              yield* Clock.currentTimeMillis,
            ),
          );
        },
      );

      const recordCost = Effect.fn("SessionService.recordCost")(function* recordCostEffect(
        tokensUsed: number,
        costUsd: number,
      ) {
        const activeSession = yield* Ref.get(activeSessionRef);

        if (activeSession === null) {
          return null;
        }

        const nextSession = updateSessionRecord(activeSession, {
          totalCostUsd: activeSession.totalCostUsd + costUsd,
          totalTokensUsed: activeSession.totalTokensUsed + tokensUsed,
        });

        yield* sql`UPDATE sessions
          SET total_tokens_used = ${nextSession.totalTokensUsed},
              total_cost_usd = ${nextSession.totalCostUsd}
          WHERE id = ${nextSession.id}`;
        yield* Ref.set(activeSessionRef, nextSession);
        yield* emitThresholdAlerts(
          nextSession,
          "cost",
          nextSession.totalCostUsd,
          nextSession.costLimitUsd,
        );

        if (
          nextSession.costLimitUsd !== null &&
          nextSession.totalCostUsd >= nextSession.costLimitUsd
        ) {
          return yield* endSession(sessionCostLimitStatus, "cost_limit");
        }

        return nextSession;
      });

      const sendGeneratedMessage = Effect.fn("SessionService.sendGeneratedMessage")(
        function* sendGeneratedMessageEffect(
          speakerConnection: {
            readonly botId: PlatformBotId;
            readonly channel: SessionRecord["channel"];
            readonly platform: SessionRecord["platform"];
            readonly username: ChatUsername;
          },
          response: AiGenerateResponse,
        ) {
          yield* registerPendingGeneratedMessage({
            botId: speakerConnection.botId,
            costUsd: response.costUsd,
            modelUsed: response.model,
            platform: speakerConnection.platform,
            text: response.text,
            tokensUsed: response.tokensUsed,
            username: speakerConnection.username,
          });
          yield* platformAdapter.sendMessage(speakerConnection, response.text);
          yield* recordCost(response.tokensUsed, response.costUsd);
        },
      );

      const runScenarioStep = Effect.fn("SessionService.runScenarioStep")(
        function* runScenarioStepEffect(
          session: SessionRecord,
          scenario: ScenarioRecord,
          executableStep: ExecutableScenarioStep,
        ) {
          const activeSession = yield* Ref.get(activeSessionRef);

          if (activeSession?.id !== session.id) {
            return;
          }

          const { bot, step } = executableStep;

          switch (step.action) {
            case "wait": {
              yield* Effect.sleep(Duration.seconds(step.delayAfter));
              return;
            }
            case "say": {
              if (bot !== null && step.content !== null) {
                yield* sendScenarioMessage(session, bot, step.content);
              }

              break;
            }
            case "respond": {
              if (bot !== null) {
                const speakerConnection = {
                  botId: PlatformBotId.makeUnsafe(bot.id),
                  channel: session.channel,
                  platform: session.platform,
                  username: ChatUsername.makeUnsafe(bot.name),
                } as const;
                yield* platformAdapter.connect(speakerConnection);
                const response = yield* aiClient.generateText(
                  makeScenarioResponseRequest(
                    bot,
                    session.platform,
                    yield* getSessionMessages(session.id),
                    scenario.topic,
                    step.content,
                  ),
                );

                yield* sendGeneratedMessage(speakerConnection, response);
                yield* Ref.set(
                  speakerStatesRef,
                  advanceSpeakerState(
                    yield* Ref.get(speakerStatesRef),
                    speakerConnection.botId,
                    yield* Clock.currentTimeMillis,
                  ),
                );
              }

              break;
            }
            default: {
              return;
            }
          }

          if (step.delayAfter > 0) {
            yield* Effect.sleep(Duration.seconds(step.delayAfter));
          }
        },
      );

      const scheduleResponse = Effect.fn("SessionService.scheduleResponse")(
        function* scheduleResponseEffect(
          session: SessionRecord,
          bot: Parameters<typeof makeMentionResponseRequest>[0],
          trigger: ResponseTrigger,
          buildRequest: (
            directorHint: string | null,
          ) => Effect.Effect<Parameters<typeof aiClient.generateText>[0], SqlError>,
          selectionIndex = 0,
        ) {
          const scheduledResponse = yield* Effect.gen(function* runScheduledResponseEffect() {
            const responseSelectionIndex = Number(selectionIndex);
            const responseDelay = calculateResponseDelay(trigger, {
              selectionIndex: responseSelectionIndex,
            });

            yield* Effect.sleep(Duration.millis(responseDelay));

            const activeSession = yield* Ref.get(activeSessionRef);

            if (activeSession?.id !== session.id) {
              return;
            }

            const now = yield* Clock.currentTimeMillis;

            if (!isEligibleSpeaker(bot, yield* Ref.get(speakerStatesRef), now)) {
              return;
            }

            const speakerConnection = {
              botId: PlatformBotId.makeUnsafe(bot.id),
              channel: session.channel,
              platform: session.platform,
              username: ChatUsername.makeUnsafe(bot.name),
            } as const;

            yield* platformAdapter.connect(speakerConnection);

            const directorHint = yield* consumeDirectorHint();
            const response = yield* aiClient.generateText(yield* buildRequest(directorHint));

            yield* sendGeneratedMessage(speakerConnection, response);
            yield* Ref.set(
              speakerStatesRef,
              advanceSpeakerState(
                yield* Ref.get(speakerStatesRef),
                speakerConnection.botId,
                yield* Clock.currentTimeMillis,
              ),
            );
          }).pipe(Effect.forkIn(serviceScope));

          yield* Ref.update(scheduledResponseFibersRef, (fibers) => [...fibers, scheduledResponse]);
        },
      );

      const maybeRespondToMessage = Effect.fn("SessionService.maybeRespondToMessage")(
        function* maybeRespondToMessageEffect(session: SessionRecord, message: ChatMessage) {
          if (message.direction !== "incoming") {
            return;
          }

          const speakerStates = yield* Ref.get(speakerStatesRef);
          yield* evaluateDirector(session);
          const directorDirective = yield* Ref.get(directorDirectiveRef);
          const selectedSpeakers = selectSpeakers(message.text, yield* botService.listBots(), {
            botStates: speakerStates,
            directorDirective,
            now: yield* Clock.currentTimeMillis,
            recentMessages: yield* getSessionMessages(session.id),
          });

          if (selectedSpeakers.length === 0) {
            return;
          }

          let selectionIndex = 0;

          for (const selectedSpeaker of selectedSpeakers) {
            yield* scheduleResponse(
              session,
              selectedSpeaker.bot,
              responseTriggerForSelectionReason(selectedSpeaker.reason),
              (directorHint) =>
                Effect.map(getSessionMessages(session.id), (recentMessages) =>
                  makeMentionResponseRequest(
                    selectedSpeaker.bot,
                    session.platform,
                    recentMessages,
                    directorHint,
                  ),
                ),
              selectionIndex,
            );

            selectionIndex += 1;
          }
        },
      );

      const startSilenceBreaker = Effect.fn("SessionService.startSilenceBreaker")(
        function* startSilenceBreakerEffect(session: SessionRecord) {
          yield* stopSilenceBreaker();

          const silenceBreaker = yield* Effect.forever(
            Effect.gen(function* watchForSilenceEffect() {
              yield* Effect.sleep(Duration.millis(silenceThresholdMs));

              const activeSession = yield* Ref.get(activeSessionRef);

              if (activeSession?.id !== session.id) {
                return;
              }

              const lastActivityAt = yield* Ref.get(lastActivityAtRef);

              if (lastActivityAt === null) {
                return;
              }

              const now = yield* Clock.currentTimeMillis;

              if (now - lastActivityAt < silenceThresholdMs) {
                return;
              }

              yield* evaluateDirector(session);
              const directorDirective = yield* Ref.get(directorDirectiveRef);
              const silenceBreakerBot = selectSilenceBreaker(yield* botService.listBots(), {
                botStates: yield* Ref.get(speakerStatesRef),
                directorDirective,
                now,
              });

              if (silenceBreakerBot === null) {
                return;
              }

              yield* scheduleResponse(session, silenceBreakerBot, "silence", (directorHint) =>
                Effect.map(getSessionMessages(session.id), (recentMessages) =>
                  makeSilenceBreakerRequest(
                    silenceBreakerBot,
                    session.platform,
                    recentMessages,
                    directorHint,
                  ),
                ),
              );
            }),
          ).pipe(Effect.forkIn(serviceScope));

          yield* Ref.set(silenceBreakerRef, silenceBreaker);
        },
      );

      const startMessageListener = Effect.fn("SessionService.startMessageListener")(
        function* startMessageListenerEffect(session: SessionRecord) {
          const existingListener = yield* Ref.get(messageListenerRef);

          if (existingListener !== null) {
            yield* Fiber.interrupt(existingListener);
          }

          const messageListener = yield* platformAdapter.listenChat(session.channel).pipe(
            Stream.runForEach((message) =>
              Effect.gen(function* handleSessionMessageEffect() {
                yield* persistMessage(session.id, message);
                yield* maybeRespondToMessage(session, message);
              }),
            ),
            Effect.forkIn(serviceScope),
          );

          yield* Ref.set(messageListenerRef, messageListener);
          yield* Effect.yieldNow;
        },
      );

      const getActiveAlerts = Effect.fn("SessionService.getActiveAlerts")(
        function* getActiveAlertsEffect() {
          return yield* Ref.get(activeAlertsRef);
        },
      );

      const getActiveSession = Effect.fn("SessionService.getActiveSession")(
        function* getActiveSessionEffect() {
          yield* checkTimeLimit();

          return yield* Ref.get(activeSessionRef);
        },
      );

      const getMostRecentSession = Effect.fn("SessionService.getMostRecentSession")(
        function* getMostRecentSessionEffect() {
          yield* checkTimeLimit();

          const activeSession = yield* Ref.get(activeSessionRef);

          if (activeSession !== null) {
            return activeSession;
          }

          return yield* selectSessionColumns(
            sql<SessionRow>`SELECT
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
              FROM sessions
              ORDER BY started_at DESC
              LIMIT 1`,
          );
        },
      );

      const buildExecutableScenarioSteps = Effect.fn("SessionService.buildExecutableScenarioSteps")(
        function* buildExecutableScenarioStepsEffect(scenario: ScenarioRecord) {
          const executableSteps: ExecutableScenarioStep[] = [];

          for (const step of scenario.steps) {
            executableSteps.push({
              bot: step.action === "wait" ? null : yield* botService.getBot(step.botId),
              step,
            });
          }

          return executableSteps;
        },
      );

      const runScenario = Effect.fn("SessionService.runScenario")(function* runScenarioEffect(
        scenarioId: ScenarioId,
      ) {
        const activeSession = yield* Ref.get(activeSessionRef);

        if (activeSession === null) {
          return false;
        }

        const scenario = yield* scenarioService.getScenario(scenarioId);

        if (scenario === null || !scenario.enabled || scenario.triggerType !== "manual") {
          return false;
        }

        const executableSteps = yield* buildExecutableScenarioSteps(scenario);

        yield* stopActiveScenario();
        yield* Ref.set(activeScenarioTopicRef, scenario.topic);

        const scenarioFiber = yield* Effect.gen(function* runScenarioStepsEffect() {
          for (const step of executableSteps) {
            yield* runScenarioStep(activeSession, scenario, step);
          }
        }).pipe(
          Effect.ensuring(
            Effect.all([Ref.set(activeScenarioTopicRef, null), Ref.set(scenarioFiberRef, null)]),
          ),
          Effect.asVoid,
          Effect.forkIn(serviceScope),
        );

        yield* Ref.set(scenarioFiberRef, scenarioFiber);
        yield* Effect.yieldNow;

        return true;
      });

      const startSession = Effect.fn("SessionService.startSession")(function* startSessionEffect(
        options?: SessionStartOptions,
      ) {
        const activeSession = yield* Ref.get(activeSessionRef);

        if (activeSession !== null) {
          return yield* Effect.fail(
            new SessionStartError({
              reason: "A session is already active.",
            }),
          );
        }

        const sessionOptions =
          options ?? new SessionStartOptions({ costLimitUsd: null, timeLimitSeconds: null });
        const session = new SessionRecord({
          channel: defaultChannel,
          costLimitUsd: sessionOptions.costLimitUsd,
          endReason: null,
          endedAt: null,
          id: SessionId.makeUnsafe(crypto.randomUUID()),
          platform: mockPlatform,
          startedAt: yield* getCurrentTimestamp(),
          status: sessionStartedStatus,
          timeLimitSeconds: sessionOptions.timeLimitSeconds,
          totalCostUsd: 0,
          totalMessages: 0,
          totalTokensUsed: 0,
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
              ${session.totalMessages},
              ${session.totalTokensUsed},
              ${session.totalCostUsd},
              ${session.timeLimitSeconds},
              ${session.costLimitUsd}
            )`;
        yield* Ref.set(activeSessionRef, session);
        yield* Ref.set(activeAlertsRef, []);
        yield* Ref.set(speakerStatesRef, []);
        yield* Ref.set(lastActivityAtRef, yield* Clock.currentTimeMillis);
        yield* Ref.set(pendingGeneratedMessagesRef, []);
        yield* Ref.set(directorDirectiveRef, null);
        yield* Ref.set(directorLastEvaluatedAtRef, null);
        yield* Ref.set(directorMessagesSinceLastEvaluationRef, 0);
        yield* Ref.set(activeScenarioTopicRef, null);
        yield* startMessageListener(session);
        yield* startSilenceBreaker(session);
        yield* startSessionTimer(session);

        return session;
      });

      const stopSession = Effect.fn("SessionService.stopSession")(function* stopSessionEffect() {
        return yield* endSession(sessionEndedStatus, manualEndReason);
      });

      return {
        service: SessionService.of({
          exportSession,
          getActiveAlerts,
          getActiveSession,
          getSessionMessages,
          getMostRecentSession,
          liveAlerts: Stream.fromPubSub(liveAlertsPubSub),
          liveMessages: Stream.fromPubSub(liveMessagesPubSub),
          recordCost,
          runScenario,
          startSession,
          stopSession,
        }),
        serviceScope,
      };
    }),
    ({ serviceScope }) => Scope.close(serviceScope, Exit.void),
  ).pipe(Effect.map(({ service }) => service)),
);
