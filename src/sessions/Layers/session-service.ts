import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type { SqlError } from "effect/unstable/sql/SqlError";

import { ChannelName, PlatformAdapter } from "../../platforms/Services/platform-adapter";
import type { ChatMessage } from "../../platforms/Services/platform-adapter";
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

interface SessionRow {
  readonly channel: string;
  readonly end_reason: SessionEndReason | null;
  readonly ended_at: string | null;
  readonly id: string;
  readonly platform: typeof mockPlatform;
  readonly started_at: string;
  readonly status: SessionStatus;
}

type MessageListenerFiber = Fiber.Fiber<void, SqlError>;

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

export const SessionServiceLive = Layer.effect(
  SessionService,
  Effect.gen(function* makeSessionService() {
    const sql = yield* SqlClient.SqlClient;
    const platformAdapter = yield* PlatformAdapter;
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
      },
    );

    const startMessageListener = Effect.fn("SessionService.startMessageListener")(
      function* startMessageListenerEffect(session: SessionRecord) {
        const existingListener = yield* Ref.get(messageListenerRef);

        if (existingListener !== null) {
          yield* Fiber.interrupt(existingListener);
        }

        const messageListener = yield* platformAdapter.listenChat(session.channel).pipe(
          Stream.runForEach((message) => persistMessage(session.id, message)),
          Effect.forkChild,
        );

        yield* Ref.set(messageListenerRef, messageListener);
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
      yield* startMessageListener(session);

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
