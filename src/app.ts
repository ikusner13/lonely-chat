import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Stream from "effect/Stream";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

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
import { MockPlatformAdapterLive } from "./platforms/Layers/mock-platform-adapter";
import {
  makeEmptyScenarioEditorFormValues,
  makeScenarioEditorFormValues,
  makeScenarioRecordFromEditorFields,
  parseScenarioEditorFields,
  ScenarioEditorFormValues,
} from "./scenarios/scenario-editor-fields";
import { ScenarioServiceLive } from "./scenarios/Layers/scenario-service";
import { ScenarioId } from "./scenarios/scenario-record";
import { ScenarioService } from "./scenarios/Services/scenario-service";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService } from "./sessions/Services/session-service";
import type { SessionMessageRecord } from "./sessions/session-message-record";
import type { SessionRecord } from "./sessions/session-record";
import type { ScenarioEditorFormErrors } from "./scenarios/scenario-editor-fields";
import type { ScenarioRecord } from "./scenarios/scenario-record";

const badRequestStatus = 400;
const redirectSeeOtherStatus = 303;
type AppServices = AiClient | BotService | ScenarioService | SessionService;

interface BotFormState {
  readonly errors: BotEditorFormErrors;
  readonly values: BotEditorFormValues;
}

interface BotPreviewState {
  readonly error?: string;
  readonly prompt: string;
  readonly response: string | null;
}

interface ScenarioFormState {
  readonly errors: ScenarioEditorFormErrors;
  readonly values: ScenarioEditorFormValues;
}

interface ChatViewerState {
  readonly activeSession: SessionRecord | null;
  readonly messages: readonly SessionMessageRecord[];
  readonly selectedSession: SessionRecord | null;
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
        <a href="/chat">Chat Viewer</a>
        <a href="/bots">Bot Manager</a>
        <a href="/scenarios">Scenarios</a>
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

const serializeForInlineScript = (value: unknown): string =>
  JSON.stringify(value).replaceAll("<", "\\u003c");

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

const makeScenarioFormState = (
  values: ScenarioEditorFormValues,
  errors: ScenarioEditorFormErrors = {},
): ScenarioFormState => ({
  errors,
  values,
});

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
        <a href="/chat">Chat Viewer</a>
        <a href="/scenarios">Scenarios</a>
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

const renderScenarioTriggerTypeOptions = (triggerType: string): string => `<option value="manual"${
  triggerType === "manual" ? " selected" : ""
}>manual</option>
          <option value="timed"${triggerType === "timed" ? " selected" : ""}>timed</option>
          <option value="on_event"${triggerType === "on_event" ? " selected" : ""}>on_event</option>`;

const renderScenarioParticipants = (
  bots: readonly BotRecord[],
  selectedParticipants: readonly string[],
): string => {
  if (bots.length === 0) {
    return "<p>No bots available yet. Create bots first.</p>";
  }

  return bots
    .map(
      (bot) => `<label>
            <input
              name="participants"
              type="checkbox"
              value="${escapeHtml(bot.id)}"
              ${selectedParticipants.includes(bot.id) ? "checked" : ""}
            />
            ${escapeHtml(bot.displayName)} (@${escapeHtml(bot.name)})
          </label>`,
    )
    .join("");
};

const renderScenarioEditorForm = (
  action: string,
  submitLabel: string,
  formState: ScenarioFormState,
  bots: readonly BotRecord[],
): string => `<form action="${action}" method="post">
          ${renderTextInputField("name", "Name", formState.values.name, formState.errors.name)}
          ${renderTextareaField(
            "description",
            "Description",
            formState.values.description,
            formState.errors.description,
            3,
          )}
          ${renderTextInputField("topic", "Topic", formState.values.topic, formState.errors.topic)}
          <fieldset>
            <legend>Participants</legend>
            ${renderScenarioParticipants(bots, formState.values.participants)}
          </fieldset>
          ${renderFieldError(formState.errors.participants)}
          <label>
            Trigger Type
            <select name="triggerType">
              ${renderScenarioTriggerTypeOptions(formState.values.triggerType)}
            </select>
          </label>
          ${renderFieldError(formState.errors.triggerType)}
          ${renderTextInputField(
            "triggerDelaySeconds",
            "Trigger Delay Seconds",
            formState.values.triggerDelaySeconds,
            formState.errors.triggerDelaySeconds,
            ' inputmode="numeric"',
          )}
          ${renderTextInputField(
            "triggerEventType",
            "Trigger Event Type",
            formState.values.triggerEventType,
            formState.errors.triggerEventType,
          )}
          ${renderTextInputField(
            "durationSeconds",
            "Duration Seconds",
            formState.values.durationSeconds,
            formState.errors.durationSeconds,
            ' inputmode="numeric"',
          )}
          ${renderTextareaField(
            "steps",
            "Steps JSON",
            formState.values.steps,
            formState.errors.steps,
            8,
          )}
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

const renderScenarioList = (
  scenarios: readonly ScenarioRecord[],
  bots: readonly BotRecord[],
  editForms: ReadonlyMap<string, ScenarioFormState>,
): string => {
  if (scenarios.length === 0) {
    return "<p>No scenarios configured yet.</p>";
  }

  return `<ul>
      ${scenarios
        .map((scenario) => {
          const editFormState =
            editForms.get(scenario.id) ??
            makeScenarioFormState(makeScenarioEditorFormValues(scenario));

          return `<li>
            <strong>${escapeHtml(scenario.name)}</strong><br />
            ${escapeHtml(scenario.description)}<br />
            Topic: ${escapeHtml(scenario.topic)}<br />
            Participants: ${scenario.participants.length}<br />
            Trigger: ${escapeHtml(scenario.triggerType)}<br />
            Duration: ${scenario.durationSeconds ?? "none"}<br />
            Enabled: ${scenario.enabled ? "yes" : "no"}
            <details>
              <summary>Edit scenario</summary>
              ${renderScenarioEditorForm(`/scenarios/${scenario.id}`, "Save Scenario", editFormState, bots)}
              <form action="/scenarios/${scenario.id}/delete" method="post">
                <button type="submit">Delete Scenario</button>
              </form>
            </details>
          </li>`;
        })
        .join("")}
    </ul>`;
};

const renderScenarioManagerDocument = (
  scenarios: readonly ScenarioRecord[],
  bots: readonly BotRecord[],
  createForm: ScenarioFormState,
  editForms: ReadonlyMap<string, ScenarioFormState>,
): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lonely Chat Scenarios</title>
  </head>
  <body>
    <main>
      <h1>Scenarios</h1>
      <p>Manage predefined chat sequences for active sessions.</p>
      <nav>
        <a href="/">Dashboard</a>
        <a href="/chat">Chat Viewer</a>
        <a href="/bots">Bot Manager</a>
      </nav>
      <section>
        <h2>Create Scenario</h2>
        ${renderScenarioEditorForm("/scenarios", "Create Scenario", createForm, bots)}
      </section>
      <section>
        <h2>Scenario List</h2>
        ${renderScenarioList(scenarios, bots, editForms)}
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

const loadChatViewerState = Effect.fn("App.loadChatViewerState")(function* loadChatViewerState() {
  const activeSession = yield* SessionService.use((sessionService) =>
    sessionService.getActiveSession(),
  );
  const selectedSession =
    activeSession ??
    (yield* SessionService.use((sessionService) => sessionService.getMostRecentSession()));
  const messages =
    selectedSession === null
      ? ([] as const)
      : yield* SessionService.use((sessionService) =>
          sessionService.getSessionMessages(selectedSession.id),
        );

  return {
    activeSession,
    messages,
    selectedSession,
  } satisfies ChatViewerState;
});

const loadBots = Effect.fn("App.loadBots")(function* loadBots() {
  return yield* BotService.use((botService) => botService.listBots());
});

const loadScenarios = Effect.fn("App.loadScenarios")(function* loadScenarios() {
  return yield* ScenarioService.use((scenarioService) => scenarioService.listScenarios());
});

const loadBot = Effect.fn("App.loadBot")(function* loadBot(botId: BotId) {
  return yield* BotService.use((botService) => botService.getBot(botId));
});

const loadScenario = Effect.fn("App.loadScenario")(function* loadScenario(scenarioId: ScenarioId) {
  return yield* ScenarioService.use((scenarioService) => scenarioService.getScenario(scenarioId));
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

const readScenarioFormValues = (formData: FormData): ScenarioEditorFormValues =>
  new ScenarioEditorFormValues({
    description: readStringFormField(formData, "description"),
    durationSeconds: readStringFormField(formData, "durationSeconds"),
    enabled: formData.get("enabled") === "on",
    name: readStringFormField(formData, "name"),
    participants: formData
      .getAll("participants")
      .flatMap((value) => (typeof value === "string" ? [value] : [])),
    steps: readStringFormField(formData, "steps"),
    topic: readStringFormField(formData, "topic"),
    triggerDelaySeconds: readStringFormField(formData, "triggerDelaySeconds"),
    triggerEventType: readStringFormField(formData, "triggerEventType"),
    triggerType: readStringFormField(formData, "triggerType"),
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

const serializeSession = (session: SessionRecord) => ({
  channel: session.channel,
  endReason: session.endReason,
  endedAt: session.endedAt,
  id: session.id,
  platform: session.platform,
  startedAt: session.startedAt,
  status: session.status,
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

const renderChatMessageListItem = (
  message: SessionMessageRecord,
): string => `<li data-session-message-id="${message.id}">
          <strong>${escapeHtml(message.username)}</strong> (${message.isBot ? "bot" : "viewer"}, ${escapeHtml(message.platform)})<br />
          ${escapeHtml(message.content)}<br />
          <small>${escapeHtml(message.sentAt)}</small>
        </li>`;

const renderChatViewerDocument = (state: ChatViewerState): string => {
  let sessionHeading = "No Session History";

  if (state.activeSession !== null) {
    sessionHeading = "Active Session";
  } else if (state.selectedSession !== null) {
    sessionHeading = "Most Recent Session";
  }

  const sessionDetails =
    state.selectedSession === null
      ? "<p>No chat session history is available yet.</p>"
      : `<p>Status: ${escapeHtml(state.selectedSession.status)}</p>
        <p>Platform: ${escapeHtml(state.selectedSession.platform)}</p>
        <p>Channel: ${escapeHtml(state.selectedSession.channel)}</p>`;
  const messagesMarkup =
    state.messages.length === 0
      ? '<li id="chat-empty">No messages captured for this session yet.</li>'
      : state.messages.map(renderChatMessageListItem).join("");
  const initialState = serializeForInlineScript({
    activeSession: state.activeSession === null ? null : serializeSession(state.activeSession),
    messages: state.messages.map(serializeSessionMessage),
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lonely Chat Chat Viewer</title>
  </head>
  <body>
    <main>
      <h1>Chat Viewer</h1>
      <p>Live mock chat plus persisted session history.</p>
      <nav>
        <a href="/">Dashboard</a>
        <a href="/bots">Bot Manager</a>
      </nav>
      <section>
        <h2>${sessionHeading}</h2>
        ${sessionDetails}
      </section>
      <section>
        <h2>Messages</h2>
        <ul id="chat-messages">
          ${messagesMarkup}
        </ul>
      </section>
    </main>
    <script>
      const chatState = ${initialState};
      const activeSession = chatState.activeSession;
      const messagesList = document.getElementById("chat-messages");
      const createMessageItem = (message) => {
        const item = document.createElement("li");
        item.dataset.sessionMessageId = message.id;

        const name = document.createElement("strong");
        name.textContent = message.username;
        item.appendChild(name);
        item.append(" (" + (message.isBot ? "bot" : "viewer") + ", " + message.platform + ")");
        item.appendChild(document.createElement("br"));
        item.append(message.content);
        item.appendChild(document.createElement("br"));

        const time = document.createElement("small");
        time.textContent = message.sentAt;
        item.appendChild(time);

        return item;
      };

      if (activeSession !== null && messagesList !== null) {
        const source = new EventSource("/api/chat/stream");
        source.onmessage = (event) => {
          const message = JSON.parse(event.data);

          if (message.sessionId !== activeSession.id) {
            return;
          }

          const existing = document.querySelector('[data-session-message-id="' + message.id + '"]');

          if (existing !== null) {
            return;
          }

          document.getElementById("chat-empty")?.remove();
          messagesList.appendChild(createMessageItem(message));
        };

        window.addEventListener("beforeunload", () => source.close(), { once: true });
      }
    </script>
  </body>
</html>`;
};

export const makeAppRuntime = (
  dbPath: string,
): ManagedRuntime.ManagedRuntime<AppServices, unknown> => {
  const databaseLayer = makeDatabaseLayer(dbPath);
  const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
  const scenarioServiceLayer = ScenarioServiceLive.pipe(Layer.provide(databaseLayer));
  const sessionServiceLayer = SessionServiceLive.pipe(
    Layer.provide(MockPlatformAdapterLive),
    Layer.provide(FakeAiClientLive),
    Layer.provide(botServiceLayer),
    Layer.provide(databaseLayer),
  );

  return ManagedRuntime.make(
    Layer.mergeAll(FakeAiClientLive, botServiceLayer, scenarioServiceLayer, sessionServiceLayer),
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

  app.get("/chat", async (context) => {
    const chatViewerState = await runtime.runPromise(loadChatViewerState());

    return context.html(renderChatViewerDocument(chatViewerState));
  });

  app.get("/api/chat/stream", async (context) => {
    const activeSession = await runtime.runPromise(
      SessionService.use((sessionService) => sessionService.getActiveSession()),
    );

    if (activeSession === null) {
      return context.notFound();
    }

    context.header("Cache-Control", "no-cache, no-transform");
    context.header("X-Accel-Buffering", "no");
    context.header("X-Content-Type-Options", "nosniff");

    return streamSSE(context, async (stream) => {
      let stopped = false;
      const liveMessagesFiber = runtime.runFork(
        SessionService.use((sessionService) =>
          sessionService.liveMessages.pipe(
            Stream.filter((message) => message.sessionId === activeSession.id),
            Stream.runForEach((message) =>
              Effect.promise(async () => {
                await stream.writeSSE({
                  data: JSON.stringify(serializeSessionMessage(message)),
                });
              }),
            ),
          ),
        ),
      );

      const stop = async function stopStream(): Promise<void> {
        if (stopped) {
          return;
        }

        stopped = true;
        await runtime.runPromise(Fiber.interrupt(liveMessagesFiber));
      };

      stream.onAbort(() => {
        void stop().catch(() => {});
      });

      await runtime.runPromise(Fiber.await(liveMessagesFiber));
    });
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

  app.get("/scenarios", async (context) => {
    const [bots, scenarios] = await Promise.all([
      runtime.runPromise(loadBots()),
      runtime.runPromise(loadScenarios()),
    ]);

    return context.html(
      renderScenarioManagerDocument(
        scenarios,
        bots,
        makeScenarioFormState(makeEmptyScenarioEditorFormValues()),
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

  app.post("/scenarios", async (context) => {
    const formValues = readScenarioFormValues(await context.req.formData());
    const parsedForm = parseScenarioEditorFields(formValues);
    const [bots, scenarios] = await Promise.all([
      runtime.runPromise(loadBots()),
      runtime.runPromise(loadScenarios()),
    ]);

    if (parsedForm.editorFields === null) {
      return context.html(
        renderScenarioManagerDocument(
          scenarios,
          bots,
          makeScenarioFormState(parsedForm.values, parsedForm.errors),
          new Map(),
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      ScenarioService.use((scenarioService) =>
        scenarioService.createScenario(
          makeScenarioRecordFromEditorFields(parsedForm.editorFields, new Date().toISOString()),
        ),
      ),
    );

    return context.redirect("/scenarios", redirectSeeOtherStatus);
  });

  app.post("/scenarios/:scenarioId", async (context) => {
    const scenarioId = ScenarioId.makeUnsafe(context.req.param("scenarioId"));
    const existingScenario = await runtime.runPromise(loadScenario(scenarioId));

    if (existingScenario === null) {
      return context.notFound();
    }

    const formValues = readScenarioFormValues(await context.req.formData());
    const parsedForm = parseScenarioEditorFields(formValues);
    const [bots, scenarios] = await Promise.all([
      runtime.runPromise(loadBots()),
      runtime.runPromise(loadScenarios()),
    ]);

    if (parsedForm.editorFields === null) {
      const editForms = new Map<string, ScenarioFormState>([
        [existingScenario.id, makeScenarioFormState(parsedForm.values, parsedForm.errors)],
      ]);

      return context.html(
        renderScenarioManagerDocument(
          scenarios,
          bots,
          makeScenarioFormState(makeEmptyScenarioEditorFormValues()),
          editForms,
        ),
        badRequestStatus,
      );
    }

    await runtime.runPromise(
      ScenarioService.use((scenarioService) =>
        scenarioService.updateScenario(
          makeScenarioRecordFromEditorFields(
            parsedForm.editorFields,
            new Date().toISOString(),
            existingScenario,
          ),
        ),
      ),
    );

    return context.redirect("/scenarios", redirectSeeOtherStatus);
  });

  app.post("/scenarios/:scenarioId/delete", async (context) => {
    const scenarioId = ScenarioId.makeUnsafe(context.req.param("scenarioId"));

    await runtime.runPromise(
      ScenarioService.use((scenarioService) => scenarioService.deleteScenario(scenarioId)),
    );

    return context.redirect("/scenarios", redirectSeeOtherStatus);
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
