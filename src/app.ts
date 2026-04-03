import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Hono } from "hono";

import { getDatabasePath, makeDatabaseLayer } from "./db/database";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService } from "./sessions/Services/session-service";
import type { SessionRecord } from "./sessions/session-record";

const redirectSeeOtherStatus = 303;

const formatActiveDuration = (startedAt: string): string => {
  const durationMilliseconds = Math.max(0, Date.now() - Date.parse(startedAt));
  const durationSeconds = Math.floor(durationMilliseconds / 1000);
  const minutes = Math.floor(durationSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (durationSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
};

const renderSessionDetails = (
  activeSession: SessionRecord | null,
  mostRecentSession: SessionRecord | null,
): string => {
  if (activeSession !== null) {
    return `<p>Status: active</p>
        <p>Platform: ${activeSession.platform}</p>
        <p>Channel: ${activeSession.channel}</p>
        <p>Duration: ${formatActiveDuration(activeSession.startedAt)}</p>
        <form action="/session/stop" method="post">
          <button type="submit">Stop Session</button>
        </form>`;
  }

  if (mostRecentSession !== null && mostRecentSession.endedAt !== null) {
    return `<p>Status: idle</p>
        <p>Last session platform: ${mostRecentSession.platform}</p>
        <p>Last session channel: ${mostRecentSession.channel}</p>
        <p>Last session ended: ${mostRecentSession.endReason ?? "unknown"}</p>
        <form action="/session/start" method="post">
          <button type="submit">Start Session</button>
        </form>`;
  }

  return `<p>Status: idle</p>
        <form action="/session/start" method="post">
          <button type="submit">Start Session</button>
        </form>`;
};

const renderDashboardDocument = (
  activeSession: SessionRecord | null,
  mostRecentSession: SessionRecord | null,
): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lonely Chat</title>
  </head>
  <body>
    <main>
      <h1>Lonely Chat</h1>
      <p>Dashboard for managing mock stream chat sessions.</p>
      <section>
        <h2>Session</h2>
        ${renderSessionDetails(activeSession, mostRecentSession)}
      </section>
    </main>
  </body>
</html>`;

const loadDashboardState = async (
  runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown>,
): Promise<{
  readonly activeSession: SessionRecord | null;
  readonly mostRecentSession: SessionRecord | null;
}> => {
  const dashboardState = await runtime.runPromise(
    Effect.all({
      activeSession: SessionService.use((sessionService) => sessionService.getActiveSession()),
      mostRecentSession: SessionService.use((sessionService) =>
        sessionService.getMostRecentSession(),
      ),
    }),
  );

  return dashboardState;
};

export const makeAppRuntime = (
  dbPath: string,
): ManagedRuntime.ManagedRuntime<SessionService, unknown> =>
  ManagedRuntime.make(SessionServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath))));

export const appRuntime = makeAppRuntime(getDatabasePath());

export const createApp = (
  runtime: ManagedRuntime.ManagedRuntime<SessionService, unknown> = appRuntime,
): Hono => {
  const app = new Hono();

  app.get("/health", (context) =>
    context.json({
      status: "ok",
    }),
  );

  app.get("/", async (context) => {
    const { activeSession, mostRecentSession } = await loadDashboardState(runtime);

    return context.html(renderDashboardDocument(activeSession, mostRecentSession));
  });

  app.post("/session/start", async (context) => {
    await runtime.runPromise(
      SessionService.use((sessionService) => sessionService.startSession()).pipe(
        Effect.catchTag("SessionStartError", () => Effect.void),
      ),
    );

    return context.redirect("/", redirectSeeOtherStatus);
  });

  app.post("/session/stop", async (context) => {
    await runtime.runPromise(SessionService.use((sessionService) => sessionService.stopSession()));

    return context.redirect("/", redirectSeeOtherStatus);
  });

  return app;
};

export const app = createApp(appRuntime);
