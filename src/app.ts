import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import { Hono } from "hono";

import { FakeAiClientLive } from "./ai/Layers/fake-ai-client";
import {
  makeBotPreviewRequest,
  parseBotPreviewInput,
  parseBotPreviewRequestBody,
} from "./ai/bot-preview";
import { AiClient } from "./ai/Services/ai-client";
import {
  BotEditorFormValues,
  makeBotEditorFormValues,
  makeBotRecordFromEditorFields,
  makeEmptyBotEditorFormValues,
  parseBotEditorFields,
} from "./bots/bot-editor-fields";
import { BotServiceLive } from "./bots/Layers/bot-service";
import { BotService } from "./bots/Services/bot-service";
import { BotId } from "./bots/bot-record";
import type { BotEditorFormErrors } from "./bots/bot-editor-fields";
import type { BotRecord } from "./bots/bot-record";
import { getDatabasePath, makeDatabaseLayer } from "./db/database";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService } from "./sessions/Services/session-service";
import type { SessionRecord } from "./sessions/session-record";

const badRequestStatus = 400;
const redirectSeeOtherStatus = 303;
type AppServices = AiClient | BotService | SessionService;

interface BotFormState {
  readonly errors: BotEditorFormErrors;
  readonly values: BotEditorFormValues;
}

interface BotPreviewState {
  readonly error?: string;
  readonly prompt: string;
  readonly response: string | null;
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
  values: BotEditorFormValues,
  errors: BotEditorFormErrors = {},
): BotFormState => ({
  errors,
  values,
});

const makeBotPreviewState = (
  prompt = "",
  response: string | null = null,
  error?: string,
): BotPreviewState =>
  error === undefined
    ? {
        prompt,
        response,
      }
    : {
        error,
        prompt,
        response,
      };

const renderFieldError = (error: string | undefined): string =>
  error === undefined ? "" : `<p>${escapeHtml(error)}</p>`;

const renderPlatformOptions = (platform: string): string => `<option value="twitch"${
  platform === "twitch" ? " selected" : ""
}>twitch</option>
          <option value="kick"${platform === "kick" ? " selected" : ""}>kick</option>`;

const renderTextInputField = (
  name: string,
  label: string,
  value: string,
  error?: string,
  attributes = "",
): string => `<label>
            ${label}
            <input name="${name}" type="text" value="${escapeHtml(value)}"${attributes} />
          </label>
          ${renderFieldError(error)}`;

const renderTextareaField = (
  name: string,
  label: string,
  value: string,
  error?: string,
  rows = 3,
): string => `<label>
            ${label}
            <textarea name="${name}" rows="${rows}">${escapeHtml(value)}</textarea>
          </label>
          ${renderFieldError(error)}`;

const renderBotEditorForm = (
  action: string,
  submitLabel: string,
  formState: BotFormState,
): string => `<form action="${action}" method="post">
          ${renderTextInputField("name", "Name", formState.values.name, formState.errors.name)}
          ${renderTextInputField(
            "displayName",
            "Display Name",
            formState.values.displayName,
            formState.errors.displayName,
          )}
          <label>
            Platform
            <select name="platform">
              ${renderPlatformOptions(formState.values.platform)}
            </select>
          </label>
          ${renderFieldError(formState.errors.platform)}
          ${renderTextInputField("model", "Model", formState.values.model, formState.errors.model)}
          ${renderTextareaField(
            "fallbackModels",
            "Fallback Models (one per line)",
            formState.values.fallbackModels,
          )}
          ${renderTextInputField(
            "temperature",
            "Temperature",
            formState.values.temperature,
            formState.errors.temperature,
            ' inputmode="decimal"',
          )}
          ${renderTextInputField(
            "maxTokens",
            "Max Tokens",
            formState.values.maxTokens,
            formState.errors.maxTokens,
            ' inputmode="numeric"',
          )}
          ${renderTextareaField(
            "personality",
            "Personality",
            formState.values.personality,
            formState.errors.personality,
            3,
          )}
          ${renderTextareaField(
            "description",
            "Description",
            formState.values.description,
            formState.errors.description,
            4,
          )}
          ${renderTextareaField(
            "exampleMessages",
            "Example Messages (3-5, one per line)",
            formState.values.exampleMessages,
            formState.errors.exampleMessages,
            5,
          )}
          ${renderTextareaField("firstMessage", "First Message", formState.values.firstMessage)}
          ${renderTextareaField(
            "postHistoryPrompt",
            "Post-History Prompt",
            formState.values.postHistoryPrompt,
          )}
          ${renderTextareaField(
            "vocabularyRules",
            "Vocabulary Rules (one per line)",
            formState.values.vocabularyRules,
            undefined,
            4,
          )}
          ${renderTextareaField(
            "systemPrompt",
            "System Prompt Override",
            formState.values.systemPrompt,
            undefined,
            5,
          )}
          ${renderTextInputField(
            "responseLengthMin",
            "Response Length Minimum",
            formState.values.responseLengthMin,
            formState.errors.responseLengthMin,
            ' inputmode="numeric"',
          )}
          ${renderTextInputField(
            "responseLengthMax",
            "Response Length Maximum",
            formState.values.responseLengthMax,
            formState.errors.responseLengthMax,
            ' inputmode="numeric"',
          )}
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

const renderBotPreview = (
  botId: string,
  previewState: BotPreviewState,
): string => `<form action="/bots/${botId}/preview" method="post">
              <label>
                Preview Prompt
                <textarea name="prompt" rows="3">${escapeHtml(previewState.prompt)}</textarea>
              </label>
              ${renderFieldError(previewState.error)}
              <button type="submit">Preview Bot</button>
            </form>
            ${
              previewState.response === null
                ? ""
                : `<p>Preview Response: ${escapeHtml(previewState.response)}</p>`
            }`;

const renderBotList = (
  bots: readonly BotRecord[],
  editForms: ReadonlyMap<string, BotFormState>,
  previewStates: ReadonlyMap<string, BotPreviewState>,
): string => {
  if (bots.length === 0) {
    return "<p>No bots configured yet.</p>";
  }

  return `<ul>
      ${bots
        .map((bot) => {
          const editFormState =
            editForms.get(bot.id) ?? makeBotFormState(makeBotEditorFormValues(bot));
          const previewState = previewStates.get(bot.id) ?? makeBotPreviewState();

          return `<li>
            <strong>${escapeHtml(bot.displayName)}</strong> (@${escapeHtml(bot.name)})<br />
            Platform: ${escapeHtml(bot.platform)}<br />
            Model: ${escapeHtml(bot.model)}<br />
            Enabled: ${bot.enabled ? "yes" : "no"}<br />
            Talkativeness: ${bot.talkativeness}<br />
            Response Length: ${bot.responseLength.min}-${bot.responseLength.max} words
            <details>
              <summary>Edit bot</summary>
              ${renderBotEditorForm(`/bots/${bot.id}`, "Save Bot", editFormState)}
            </details>
            <details>
              <summary>Preview bot</summary>
              ${renderBotPreview(bot.id, previewState)}
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
  previewStates: ReadonlyMap<string, BotPreviewState>,
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
        ${renderBotList(bots, editForms, previewStates)}
      </section>
    </main>
  </body>
</html>`;

const loadDashboardState = Effect.fn("App.loadDashboardState")(function* loadDashboardState() {
  return yield* Effect.all({
    activeSession: SessionService.use((sessionService) => sessionService.getActiveSession()),
    mostRecentSession: SessionService.use((sessionService) =>
      sessionService.getMostRecentSession(),
    ),
  });
});

const loadBots = Effect.fn("App.loadBots")(function* loadBots() {
  return yield* BotService.use((botService) => botService.listBots());
});

const loadBot = Effect.fn("App.loadBot")(function* loadBot(botId: BotId) {
  return yield* BotService.use((botService) => botService.getBot(botId));
});

const previewBot = Effect.fn("App.previewBot")(function* previewBot(
  bot: BotRecord,
  prompt: string,
) {
  const parsedPreviewInput = parseBotPreviewInput(prompt);
  const previewInput = parsedPreviewInput.input;

  if (previewInput === null) {
    return yield* Effect.fail(new Error(parsedPreviewInput.error ?? "Preview prompt is required."));
  }

  const preview = yield* AiClient.use((aiClient) =>
    aiClient.generateText(makeBotPreviewRequest(bot, previewInput)),
  );

  return {
    model: preview.model,
    response: preview.text,
  };
});

const readStringFormField = (formData: FormData, fieldName: string): string => {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
};

const readBotFormValues = (formData: FormData): BotEditorFormValues =>
  new BotEditorFormValues({
    description: readStringFormField(formData, "description"),
    displayName: readStringFormField(formData, "displayName"),
    enabled: formData.get("enabled") === "on",
    exampleMessages: readStringFormField(formData, "exampleMessages"),
    fallbackModels: readStringFormField(formData, "fallbackModels"),
    firstMessage: readStringFormField(formData, "firstMessage"),
    maxTokens: readStringFormField(formData, "maxTokens"),
    model: readStringFormField(formData, "model"),
    name: readStringFormField(formData, "name"),
    personality: readStringFormField(formData, "personality"),
    platform: readStringFormField(formData, "platform"),
    postHistoryPrompt: readStringFormField(formData, "postHistoryPrompt"),
    responseLengthMax: readStringFormField(formData, "responseLengthMax"),
    responseLengthMin: readStringFormField(formData, "responseLengthMin"),
    systemPrompt: readStringFormField(formData, "systemPrompt"),
    talkativeness: readStringFormField(formData, "talkativeness"),
    temperature: readStringFormField(formData, "temperature"),
    vocabularyRules: readStringFormField(formData, "vocabularyRules"),
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
      Layer.provideMerge(FakeAiClientLive),
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
    const { activeSession, mostRecentSession } = await runtime.runPromise(loadDashboardState());

    return context.html(renderDashboardDocument(activeSession, mostRecentSession));
  });

  app.get("/api/bots", async (context) => {
    const bots = await runtime.runPromise(loadBots());

    return context.json({
      bots: bots.map(serializeBot),
    });
  });

  app.get("/bots", async (context) => {
    const bots = await runtime.runPromise(loadBots());

    return context.html(
      renderBotManagerDocument(
        bots,
        makeBotFormState(makeEmptyBotEditorFormValues()),
        new Map(),
        new Map(),
      ),
    );
  });

  app.post("/api/bots/:botId/preview", async (context) => {
    const botId = BotId.makeUnsafe(context.req.param("botId"));
    const bot = await runtime.runPromise(loadBot(botId));

    if (bot === null) {
      return context.notFound();
    }

    const parsedInput = parseBotPreviewRequestBody(await context.req.json().catch(() => null));
    const previewInput = parsedInput.input;

    if (previewInput === null) {
      return context.json(
        {
          error: parsedInput.error ?? "Preview prompt is required.",
        },
        badRequestStatus,
      );
    }

    const preview = await runtime.runPromise(previewBot(bot, previewInput.prompt));

    return context.json({
      model: preview.model,
      prompt: previewInput.prompt,
      response: preview.response,
    });
  });

  app.post("/bots", async (context) => {
    const formValues = readBotFormValues(await context.req.formData());
    const parsedForm = parseBotEditorFields(formValues);

    if (parsedForm.editorFields === null) {
      const bots = await runtime.runPromise(loadBots());

      return context.html(
        renderBotManagerDocument(
          bots,
          makeBotFormState(parsedForm.values, parsedForm.errors),
          new Map(),
          new Map(),
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      BotService.use((botService) =>
        botService.createBot(
          makeBotRecordFromEditorFields(parsedForm.editorFields, new Date().toISOString()),
        ),
      ),
    );

    return context.redirect("/bots", redirectSeeOtherStatus);
  });

  app.post("/bots/:botId", async (context) => {
    const botId = BotId.makeUnsafe(context.req.param("botId"));
    const existingBot = await runtime.runPromise(loadBot(botId));

    if (existingBot === null) {
      return context.notFound();
    }

    const formValues = readBotFormValues(await context.req.formData());
    const parsedForm = parseBotEditorFields(formValues);

    if (parsedForm.editorFields === null) {
      const bots = await runtime.runPromise(loadBots());
      const editForms = new Map<string, BotFormState>([
        [existingBot.id, makeBotFormState(parsedForm.values, parsedForm.errors)],
      ]);

      return context.html(
        renderBotManagerDocument(
          bots,
          makeBotFormState(makeEmptyBotEditorFormValues()),
          editForms,
          new Map(),
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      BotService.use((botService) =>
        botService.updateBot(
          makeBotRecordFromEditorFields(
            parsedForm.editorFields,
            new Date().toISOString(),
            existingBot,
          ),
        ),
      ),
    );

    return context.redirect("/bots", redirectSeeOtherStatus);
  });

  app.post("/bots/:botId/preview", async (context) => {
    const botId = BotId.makeUnsafe(context.req.param("botId"));
    const bot = await runtime.runPromise(loadBot(botId));

    if (bot === null) {
      return context.notFound();
    }

    const parsedInput = parseBotPreviewInput(
      readStringFormField(await context.req.formData(), "prompt"),
    );
    const bots = await runtime.runPromise(loadBots());

    if (parsedInput.input === null) {
      return context.html(
        renderBotManagerDocument(
          bots,
          makeBotFormState(makeEmptyBotEditorFormValues()),
          new Map(),
          new Map([[bot.id, makeBotPreviewState(parsedInput.value, null, parsedInput.error)]]),
        ),
        badRequestStatus,
      );
    }

    const preview = await runtime.runPromise(previewBot(bot, parsedInput.input.prompt));

    return context.html(
      renderBotManagerDocument(
        bots,
        makeBotFormState(makeEmptyBotEditorFormValues()),
        new Map(),
        new Map([[bot.id, makeBotPreviewState(parsedInput.input.prompt, preview.response)]]),
      ),
    );
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
