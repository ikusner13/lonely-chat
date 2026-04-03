import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Hono } from "hono";

import { BotServiceLive } from "./bots/Layers/bot-service";
import { BotService } from "./bots/Services/bot-service";
import type { BotRecord } from "./bots/bot-record";
import { getDatabasePath, makeDatabaseLayer } from "./db/database";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService } from "./sessions/Services/session-service";
import type { SessionRecord } from "./sessions/session-record";

const redirectSeeOtherStatus = 303;
type AppServices = BotService | SessionService;

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
      <nav>
        <a href="/bots">Bot Manager</a>
      </nav>
      <section>
        <h2>Session</h2>
        ${renderSessionDetails(activeSession, mostRecentSession)}
      </section>
    </main>
  </body>
</html>`;

const renderBotList = (bots: readonly BotRecord[]): string => {
  if (bots.length === 0) {
    return "<p>No bots configured yet.</p>";
  }

  return `<ul>
      ${bots
        .map(
          (bot) => `<li>
            <strong>${bot.displayName}</strong> (@${bot.name})<br />
            Platform: ${bot.platform}<br />
            Model: ${bot.model}<br />
            Enabled: ${bot.enabled ? "yes" : "no"}
          </li>`,
        )
        .join("")}
    </ul>`;
};

const renderBotManagerDocument = (bots: readonly BotRecord[]): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lonely Chat Bot Manager</title>
  </head>
  <body>
    <main>
      <h1>Bot Manager</h1>
      <p>Configured bots for mock and live chat sessions.</p>
      <nav>
        <a href="/">Dashboard</a>
      </nav>
      <section>
        <h2>Bot List</h2>
        ${renderBotList(bots)}
      </section>
    </main>
  </body>
</html>`;

const loadDashboardState = async (
  runtime: ManagedRuntime.ManagedRuntime<AppServices, unknown>,
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

const loadBots = async function loadBots(
  runtime: ManagedRuntime.ManagedRuntime<AppServices, unknown>,
): Promise<readonly BotRecord[]> {
  const bots = await runtime.runPromise(BotService.use((botService) => botService.listBots()));

  return bots;
};

const serializeBot = (bot: BotRecord) => ({
  createdAt: bot.createdAt,
  description: bot.description,
  displayName: bot.displayName,
  enabled: bot.enabled,
  exampleMessages: [...bot.exampleMessages],
  fallbackModels: [...bot.fallbackModels],
  firstMessage: bot.firstMessage,
  id: bot.id,
  maxTokens: bot.maxTokens,
  model: bot.model,
  name: bot.name,
  personality: bot.personality,
  platform: bot.platform,
  postHistoryPrompt: bot.postHistoryPrompt,
  responseLength: {
    max: bot.responseLength.max,
    min: bot.responseLength.min,
  },
  systemPrompt: bot.systemPrompt,
  talkativeness: bot.talkativeness,
  temperature: bot.temperature,
  updatedAt: bot.updatedAt,
  vocabularyRules: [...bot.vocabularyRules],
});

export const makeAppRuntime = (
  dbPath: string,
): ManagedRuntime.ManagedRuntime<AppServices, unknown> => {
  const databaseLayer = makeDatabaseLayer(dbPath);

  return ManagedRuntime.make(
    Layer.empty.pipe(
      Layer.provideMerge(SessionServiceLive),
      Layer.provideMerge(BotServiceLive),
      Layer.provide(databaseLayer),
    ),
  );
};

export const appRuntime = makeAppRuntime(getDatabasePath());

export const createApp = (
  runtime: ManagedRuntime.ManagedRuntime<AppServices, unknown> = appRuntime,
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

  app.get("/api/bots", async (context) => {
    const bots = await loadBots(runtime);

    return context.json({
      bots: bots.map(serializeBot),
    });
  });

  app.get("/bots", async (context) => {
    const bots = await loadBots(runtime);

    return context.html(renderBotManagerDocument(bots));
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
