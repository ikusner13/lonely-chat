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
import { BotService } from "../../bots/Services/bot-service";
import {
  advanceSpeakerState,
  calculateResponseDelay,
  isEligibleSpeaker,
  makeMentionResponseRequest,
  makeSilenceBreakerRequest,
  selectSilenceBreaker,
  selectSpeakers,
} from "../../orchestration/mention-response";
import type { BotSpeakerState, ResponseTrigger } from "../../orchestration/mention-response";
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
import { SessionService, SessionId } from "../Services/session-service";
import type {
  SessionEndReason,
  SessionServiceShape,
  SessionStatus,
} from "../Services/session-service";
import { SessionMessageId, SessionMessageRecord } from "../session-message-record";
import { SessionRecord } from "../session-record";
import { SessionStartError } from "../session-start-error";

const defaultChannel = ChannelName.makeUnsafe("lonely-chat");
const manualEndReason: SessionEndReason = "manual";
const mockPlatform = "mock";
const sessionEndedStatus: SessionStatus = "ended";
const sessionStartedStatus: SessionStatus = "active";
const liveMessageBufferCapacity = 128;
const silenceThresholdMs = 15_000;

interface SessionRow {
  readonly channel: string;
  readonly end_reason: SessionEndReason | null;
  readonly ended_at: string | null;
  readonly id: string;
  readonly platform: typeof mockPlatform;
  readonly started_at: string;
  readonly status: SessionStatus;
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

const makeSessionMessageRecord = (
  sessionId: SessionId,
  message: ChatMessage,
): SessionMessageRecord =>
  new SessionMessageRecord({
    botId: message.botId ?? null,
    content: message.text,
    id: SessionMessageId.makeUnsafe(crypto.randomUUID()),
    isBot: message.direction === "outgoing",
    modelUsed: null,
    platform: message.platform,
    sentAt: new Date().toISOString(),
    sessionId,
    tokensUsed: null,
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

export const SessionServiceLive = Layer.effect(
  SessionService,
  Effect.acquireRelease(
    Effect.gen(function* makeSessionService() {
      const aiClient = yield* AiClient;
      const botService = yield* BotService;
      const sql = yield* SqlClient.SqlClient;
      const platformAdapter = yield* PlatformAdapter;
      const serviceScope = yield* Scope.make();
      const liveMessagesPubSub = yield* PubSub.bounded<SessionMessageRecord>({
        capacity: liveMessageBufferCapacity,
      });
      const activeSessionRef = yield* Ref.make<SessionRecord | null>(
        yield* selectSessionColumns(
          sql<SessionRow>`SELECT id, platform, channel, status, started_at, ended_at, end_reason
            FROM sessions
            WHERE status = ${sessionStartedStatus}
            ORDER BY started_at DESC
            LIMIT 1`,
        ),
      );
      const messageListenerRef = yield* Ref.make<MessageListenerFiber | null>(null);
      const scheduledResponseFibersRef = yield* Ref.make<readonly SessionTaskFiber[]>([]);
      const silenceBreakerRef = yield* Ref.make<SessionTaskFiber | null>(null);
      const speakerStatesRef = yield* Ref.make<readonly BotSpeakerState[]>([]);
      const lastActivityAtRef = yield* Ref.make<number | null>(null);

      const persistMessage = Effect.fn("SessionService.persistMessage")(
        function* persistMessageEffect(sessionId: SessionId, message: ChatMessage) {
          const storedMessage = makeSessionMessageRecord(sessionId, message);

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

          yield* PubSub.publish(liveMessagesPubSub, storedMessage);
          yield* Ref.set(lastActivityAtRef, yield* Clock.currentTimeMillis);
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

      const scheduleResponse = Effect.fn("SessionService.scheduleResponse")(
        function* scheduleResponseEffect(
          session: SessionRecord,
          bot: Parameters<typeof makeMentionResponseRequest>[0],
          trigger: ResponseTrigger,
          request: Parameters<typeof aiClient.generateText>[0],
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

            const response = yield* aiClient.generateText(request);

            yield* platformAdapter.sendMessage(speakerConnection, response.text);
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
          const selectedSpeakers = selectSpeakers(message.text, yield* botService.listBots(), {
            botStates: speakerStates,
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
              selectedSpeaker.reason,
              makeMentionResponseRequest(selectedSpeaker.bot, message),
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

              const silenceBreakerBot = selectSilenceBreaker(yield* botService.listBots(), {
                botStates: yield* Ref.get(speakerStatesRef),
                now,
              });

              if (silenceBreakerBot === null) {
                return;
              }

              yield* scheduleResponse(
                session,
                silenceBreakerBot,
                "silence",
                makeSilenceBreakerRequest(silenceBreakerBot, session.platform),
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
        yield* Ref.set(speakerStatesRef, []);
        yield* Ref.set(lastActivityAtRef, yield* Clock.currentTimeMillis);
        yield* startMessageListener(session);
        yield* startSilenceBreaker(session);

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
        yield* stopMessageListener();
        yield* stopSilenceBreaker();
        yield* interruptTrackedFibers();
        yield* Ref.set(activeSessionRef, null);
        yield* Ref.set(lastActivityAtRef, null);
        yield* Ref.set(speakerStatesRef, []);

        return endedSession;
      });

      return {
        service: SessionService.of({
          getActiveSession,
          getSessionMessages,
          getMostRecentSession,
          liveMessages: Stream.fromPubSub(liveMessagesPubSub),
          startSession,
          stopSession,
        } satisfies SessionServiceShape),
        serviceScope,
      };
    }),
    ({ serviceScope }) => Scope.close(serviceScope, Exit.void),
  ).pipe(Effect.map(({ service }) => service)),
);
