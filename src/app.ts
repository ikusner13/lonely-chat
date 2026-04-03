import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Hono } from "hono";

import {
  makeBotCoreFieldFormValues,
  makeBotRecordFromCoreFields,
  makeEmptyBotCoreFieldFormValues,
  parseBotCoreFields,
} from "./bots/bot-core-fields";
import { BotServiceLive } from "./bots/Layers/bot-service";
import { BotService } from "./bots/Services/bot-service";
import { BotId } from "./bots/bot-record";
import type { BotCoreFieldFormErrors, BotCoreFieldFormValues } from "./bots/bot-core-fields";
import type { BotRecord } from "./bots/bot-record";
import { getDatabasePath, makeDatabaseLayer } from "./db/database";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService } from "./sessions/Services/session-service";
import type { SessionRecord } from "./sessions/session-record";

const badRequestStatus = 400;
const redirectSeeOtherStatus = 303;
type AppServices = BotService | SessionService;

interface BotFormState {
  readonly errors: BotCoreFieldFormErrors;
  readonly values: BotCoreFieldFormValues;
}

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

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const makeBotFormState = (
  values: BotCoreFieldFormValues,
  errors: BotCoreFieldFormErrors = {},
): BotFormState => ({
  errors,
  values,
});

const renderFieldError = (error: string | undefined): string =>
  error === undefined ? "" : `<p>${escapeHtml(error)}</p>`;

const renderPlatformOptions = (platform: string): string => `<option value="twitch"${
  platform === "twitch" ? " selected" : ""
}>twitch</option>
          <option value="kick"${platform === "kick" ? " selected" : ""}>kick</option>`;

const renderBotEditorForm = (
  action: string,
  submitLabel: string,
  formState: BotFormState,
): string => `<form action="${action}" method="post">
          <label>
            Name
            <input name="name" type="text" value="${escapeHtml(formState.values.name)}" />
          </label>
          ${renderFieldError(formState.errors.name)}
          <label>
            Display Name
            <input
              name="displayName"
              type="text"
              value="${escapeHtml(formState.values.displayName)}"
            />
          </label>
          ${renderFieldError(formState.errors.displayName)}
          <label>
            Platform
            <select name="platform">
              ${renderPlatformOptions(formState.values.platform)}
            </select>
          </label>
          ${renderFieldError(formState.errors.platform)}
          <label>
            Model
            <input name="model" type="text" value="${escapeHtml(formState.values.model)}" />
          </label>
          ${renderFieldError(formState.errors.model)}
          <label>
            Talkativeness
            <input
              name="talkativeness"
              type="number"
              min="0"
              max="100"
              step="1"
              value="${escapeHtml(formState.values.talkativeness)}"
            />
          </label>
          ${renderFieldError(formState.errors.talkativeness)}
          <label>
            <input
              name="enabled"
              type="checkbox"
              ${formState.values.enabled ? "checked" : ""}
            />
            Enabled
          </label>
          <button type="submit">${submitLabel}</button>
        </form>`;

const renderBotList = (
  bots: readonly BotRecord[],
  editForms: ReadonlyMap<string, BotFormState>,
): string => {
  if (bots.length === 0) {
    return "<p>No bots configured yet.</p>";
  }

  return `<ul>
      ${bots
        .map((bot) => {
          const editFormState =
            editForms.get(bot.id) ?? makeBotFormState(makeBotCoreFieldFormValues(bot));

          return `<li>
            <strong>${escapeHtml(bot.displayName)}</strong> (@${escapeHtml(bot.name)})<br />
            Platform: ${escapeHtml(bot.platform)}<br />
            Model: ${escapeHtml(bot.model)}<br />
            Enabled: ${bot.enabled ? "yes" : "no"}<br />
            Talkativeness: ${bot.talkativeness}
            <details>
              <summary>Edit core fields</summary>
              ${renderBotEditorForm(`/bots/${bot.id}`, "Save Bot", editFormState)}
            </details>
          </li>`;
        })
        .join("")}
    </ul>`;
};

const renderBotManagerDocument = (
  bots: readonly BotRecord[],
  createForm: BotFormState,
  editForms: ReadonlyMap<string, BotFormState>,
): string => `<!doctype html>
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
        <h2>Create Bot</h2>
        ${renderBotEditorForm("/bots", "Create Bot", createForm)}
      </section>
      <section>
        <h2>Bot List</h2>
        ${renderBotList(bots, editForms)}
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

const loadBot = async function loadBot(
  runtime: ManagedRuntime.ManagedRuntime<AppServices, unknown>,
  botId: BotId,
): Promise<BotRecord | null> {
  const bot = await runtime.runPromise(BotService.use((botService) => botService.getBot(botId)));

  return bot;
};

const readStringFormField = (formData: FormData, fieldName: string): string => {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
};

const readBotFormValues = (formData: FormData): BotCoreFieldFormValues => ({
  displayName: readStringFormField(formData, "displayName"),
  enabled: formData.get("enabled") === "on",
  model: readStringFormField(formData, "model"),
  name: readStringFormField(formData, "name"),
  platform: readStringFormField(formData, "platform"),
  talkativeness: readStringFormField(formData, "talkativeness"),
});

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

    return context.html(
      renderBotManagerDocument(
        bots,
        makeBotFormState(makeEmptyBotCoreFieldFormValues()),
        new Map(),
      ),
    );
  });

  app.post("/bots", async (context) => {
    const formValues = readBotFormValues(await context.req.formData());
    const parsedForm = parseBotCoreFields(formValues);

    if (parsedForm.coreFields === null) {
      const bots = await loadBots(runtime);

      return context.html(
        renderBotManagerDocument(
          bots,
          makeBotFormState(parsedForm.values, parsedForm.errors),
          new Map(),
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      BotService.use((botService) =>
        botService.createBot(
          makeBotRecordFromCoreFields(parsedForm.coreFields, new Date().toISOString()),
        ),
      ),
    );

    return context.redirect("/bots", redirectSeeOtherStatus);
  });

  app.post("/bots/:botId", async (context) => {
    const botId = BotId.makeUnsafe(context.req.param("botId"));
    const existingBot = await loadBot(runtime, botId);

    if (existingBot === null) {
      return context.notFound();
    }

    const formValues = readBotFormValues(await context.req.formData());
    const parsedForm = parseBotCoreFields(formValues);

    if (parsedForm.coreFields === null) {
      const bots = await loadBots(runtime);
      const editForms = new Map<string, BotFormState>([
        [existingBot.id, makeBotFormState(parsedForm.values, parsedForm.errors)],
      ]);

      return context.html(
        renderBotManagerDocument(
          bots,
          makeBotFormState(makeEmptyBotCoreFieldFormValues()),
          editForms,
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      BotService.use((botService) =>
        botService.updateBot(
          makeBotRecordFromCoreFields(parsedForm.coreFields, new Date().toISOString(), existingBot),
        ),
      ),
    );

    return context.redirect("/bots", redirectSeeOtherStatus);
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
