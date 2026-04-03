import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";

import { runtime } from "$lib/server/runtime";
import { SessionService } from "../../../../sessions/Services/session-service";

const encoder = new TextEncoder();
const notFoundStatus = 404;

export const GET = async () => {
  const activeSession = await runtime.runPromise(SessionService.use((s) => s.getActiveSession()));

  if (activeSession === null) {
    return new Response("No active session", { status: notFoundStatus });
  }

  let fiberRef: Fiber.Fiber<void, unknown> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const fiber = runtime.runFork(
        SessionService.use((s) =>
          s.liveMessages.pipe(
            Stream.filter((message) => message.sessionId === activeSession.id),
            Stream.runForEach((message) =>
              Effect.sync(() => {
                const data = JSON.stringify({
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

                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }),
            ),
          ),
        ),
      );

      fiberRef = fiber;

      void runtime
        .runPromise(Fiber.await(fiber))
        .catch(() => {})
        .finally(() => {
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
    cancel() {
      if (fiberRef !== null) {
        void runtime.runPromise(Fiber.interrupt(fiberRef)).catch(() => {});
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
