import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createApp, makeAppRuntime } from "./app";
import { FakeAiClientLive } from "./ai/Layers/fake-ai-client";
import { BotEditorFormValues } from "./bots/bot-editor-fields";
import { BotServiceLive } from "./bots/Layers/bot-service";
import { BotId, BotRecord } from "./bots/bot-record";
import { BotService } from "./bots/Services/bot-service";
import { makeDatabaseLayer } from "./db/database";
import { makeMockPlatformAdapter } from "./platforms/Layers/mock-platform-adapter";
import { ChannelName, ChatUsername, PlatformAdapter } from "./platforms/Services/platform-adapter";
import { ScenarioEditorFormValues } from "./scenarios/scenario-editor-fields";
import { ScenarioServiceLive } from "./scenarios/Layers/scenario-service";
import { ScenarioService } from "./scenarios/Services/scenario-service";
import { SessionServiceLive } from "./sessions/Layers/session-service";
import { SessionService, SessionStartOptions } from "./sessions/Services/session-service";

const okStatus = 200;
const seeOtherStatus = 303;
const botCreatedAt = "2026-04-03T00:00:00.000Z";
const botUpdatedAt = "2026-04-03T00:00:00.000Z";

interface BotListApiResponse {
  readonly bots: readonly unknown[];
}

const decodeBotListApiResponse: (input: unknown) => BotListApiResponse = Schema.decodeUnknownSync(
  Schema.Struct({
    bots: Schema.Array(Schema.Unknown),
  }),
);
const decodeBotPreviewApiResponse = Schema.decodeUnknownSync(
  Schema.Struct({
    model: Schema.String,
    prompt: Schema.String,
    response: Schema.String,
  }),
);
const decodeChatStreamMessage = Schema.decodeUnknownSync(
  Schema.Struct({
    botId: Schema.NullOr(Schema.String),
    content: Schema.String,
    id: Schema.String,
    isBot: Schema.Boolean,
    modelUsed: Schema.NullOr(Schema.String),
    platform: Schema.String,
    sentAt: Schema.String,
    sessionId: Schema.String,
    tokensUsed: Schema.NullOr(Schema.Number),
    username: Schema.String,
  }),
);

const fromPromise = <Value>(value: PromiseLike<Value> | Value): Effect.Effect<Value> =>
  Effect.promise(async (): Promise<Value> => value);

const createDatabasePath = Effect.acquireRelease(
  fromPromise(mkdtemp(join(tmpdir(), "lonely-chat-app-"))),
  (directory) =>
    fromPromise(
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ).pipe(Effect.orDie),
).pipe(Effect.map((directory) => join(directory, "lonely-chat.sqlite")));

const createTestRuntime = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.sync(() => makeAppRuntime(dbPath)),
    (runtime) => fromPromise(runtime.dispose()).pipe(Effect.orDie),
  );

const createTestRuntimeWithMockPlatform = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.gen(function* createRuntimeWithMockPlatformEffect() {
      const mockPlatformAdapter = yield* makeMockPlatformAdapter;
      const databaseLayer = makeDatabaseLayer(dbPath);
      const platformLayer = Layer.succeed(
        PlatformAdapter,
        PlatformAdapter.of(mockPlatformAdapter.platformAdapter),
      );
      const botServiceLayer = BotServiceLive.pipe(Layer.provide(databaseLayer));
      const scenarioServiceLayer = ScenarioServiceLive.pipe(Layer.provide(databaseLayer));
      const sessionServiceDependencies = Layer.mergeAll(
        FakeAiClientLive,
        botServiceLayer,
        databaseLayer,
        platformLayer,
        scenarioServiceLayer,
      );
      const sessionServiceLayer = SessionServiceLive.pipe(
        Layer.provide(sessionServiceDependencies),
      );
      const runtime = ManagedRuntime.make(
        Layer.mergeAll(
          FakeAiClientLive,
          botServiceLayer,
          scenarioServiceLayer,
          sessionServiceLayer,
        ),
      ) as ReturnType<typeof makeAppRuntime>;

      return {
        mockPlatformAdapter,
        runtime,
      };
    }),
    ({ runtime }) => fromPromise(runtime.dispose()).pipe(Effect.orDie),
  );

const makeTestBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: botCreatedAt,
    description: "Snarky speedrunner commentary.",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["clip it", "that split is cursed", "chat is farming resets"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: null,
    id: BotId.makeUnsafe("bot-pixel"),
    maxTokens: 160,
    model: "openai/gpt-5-mini",
    name: "pixel_bot",
    personality: "Fast, dry, and chat-native.",
    platform: "twitch",
    postHistoryPrompt: null,
    responseLength: {
      max: 10,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 65,
    temperature: 0.7,
    updatedAt: botUpdatedAt,
    vocabularyRules: ["Never use emojis."],
    ...overrides,
  });

const makeValidBotFormValues = (overrides?: Partial<BotEditorFormValues>): BotEditorFormValues =>
  new BotEditorFormValues({
    description: "Snarky speedrunner commentary.",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: "clip it\nthat split is cursed\nchat is farming resets",
    fallbackModels: "openai/gpt-4.1-mini\nanthropic/claude-3.7-sonnet",
    firstMessage: "loading in",
    maxTokens: "160",
    model: "openai/gpt-5-mini",
    name: "pixel_bot",
    personality: "Fast, dry, and chat-native.",
    platform: "twitch",
    postHistoryPrompt: "Stay in character.",
    responseLengthMax: "10",
    responseLengthMin: "3",
    systemPrompt: "",
    talkativeness: "65",
    temperature: "0.7",
    vocabularyRules: "Never use emojis.\nNever apologize.",
    ...overrides,
  });

const makeValidScenarioFormValues = (
  overrides?: Partial<ScenarioEditorFormValues>,
): ScenarioEditorFormValues =>
  new ScenarioEditorFormValues({
    description: "Kick off a merch promotion sequence.",
    durationSeconds: "45",
    enabled: true,
    name: "Ad CTA Hype",
    participants: ["bot-pixel", "bot-marble"],
    steps: JSON.stringify(
      [
        {
          action: "say",
          botId: "bot-pixel",
          content: "check out the merch",
          delayAfter: 3,
        },
      ],
      null,
      2,
    ),
    topic: "new merch drop",
    triggerDelaySeconds: "12",
    triggerEventType: "",
    triggerType: "timed",
    ...overrides,
  });

const requestApp = (
  app: ReturnType<typeof createApp>,
  url: string,
  init?: RequestInit,
): Effect.Effect<Response> => fromPromise(app.request(url, init));

const waitForChatViewerMessage = (
  app: ReturnType<typeof createApp>,
  messageText: string,
  remainingAttempts = 20,
): Effect.Effect<string> =>
  Effect.gen(function* waitForChatViewerMessageEffect() {
    const response = yield* requestApp(app, "http://localhost/chat");
    const body = yield* fromPromise(response.text());

    if (body.includes(messageText) || remainingAttempts <= 1) {
      return body;
    }

    yield* Effect.sleep("10 millis");

    return yield* waitForChatViewerMessage(app, messageText, remainingAttempts - 1);
  });

const readFirstServerSentEvent = async function readFirstServerSentEvent(
  response: Response,
): Promise<string> {
  if (response.body === null) {
    throw new Error("Expected a streaming response body.");
  }

  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const chunk = await reader.read();

      if (chunk.done) {
        throw new Error("The event stream closed before any data arrived.");
      }

      buffer += decoder.decode(chunk.value, {
        stream: true,
      });

      const eventBoundary = buffer.indexOf("\n\n");

      if (eventBoundary === -1) {
        continue;
      }

      const frame = buffer.slice(0, eventBoundary);
      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));

      if (dataLine !== undefined) {
        return dataLine.slice("data: ".length);
      }

      buffer = buffer.slice(eventBoundary + 2);
    }
  } finally {
    await reader.cancel();
  }
};

const requestBotForm = (
  app: ReturnType<typeof createApp>,
  url: string,
  values: BotEditorFormValues,
): Effect.Effect<Response> => {
  const body = new URLSearchParams({
    description: values.description,
    displayName: values.displayName,
    exampleMessages: values.exampleMessages,
    fallbackModels: values.fallbackModels,
    firstMessage: values.firstMessage,
    maxTokens: values.maxTokens,
    model: values.model,
    name: values.name,
    personality: values.personality,
    platform: values.platform,
    postHistoryPrompt: values.postHistoryPrompt,
    responseLengthMax: values.responseLengthMax,
    responseLengthMin: values.responseLengthMin,
    systemPrompt: values.systemPrompt,
    talkativeness: values.talkativeness,
    temperature: values.temperature,
    vocabularyRules: values.vocabularyRules,
  });

  if (values.enabled) {
    body.set("enabled", "on");
  }

  return requestApp(app, url, {
    body,
    method: "POST",
  });
};

const requestBotPreviewApi = (
  app: ReturnType<typeof createApp>,
  botId: string,
  prompt: string,
): Effect.Effect<Response> =>
  requestApp(app, `http://localhost/api/bots/${botId}/preview`, {
    body: JSON.stringify({
      prompt,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

const requestBotPreviewForm = (
  app: ReturnType<typeof createApp>,
  botId: string,
  prompt: string,
): Effect.Effect<Response> =>
  requestApp(app, `http://localhost/bots/${botId}/preview`, {
    body: new URLSearchParams({
      prompt,
    }),
    method: "POST",
  });

const requestScenarioForm = (
  app: ReturnType<typeof createApp>,
  url: string,
  values: ScenarioEditorFormValues,
): Effect.Effect<Response> => {
  const body = new URLSearchParams({
    description: values.description,
    durationSeconds: values.durationSeconds,
    name: values.name,
    steps: values.steps,
    topic: values.topic,
    triggerDelaySeconds: values.triggerDelaySeconds,
    triggerEventType: values.triggerEventType,
    triggerType: values.triggerType,
  });

  for (const participant of values.participants) {
    body.append("participants", participant);
  }

  if (values.enabled) {
    body.set("enabled", "on");
  }

  return requestApp(app, url, {
    body,
    method: "POST",
  });
};

const createStoredBot = async function createStoredBot(
  runtime: ReturnType<typeof makeAppRuntime>,
  bot: BotRecord,
): Promise<BotRecord> {
  const createdBot = await runtime.runPromise(
    BotService.use((botService) => botService.createBot(bot)),
  );

  return createdBot;
};

describe("app shell", () => {
  it.effect("serves a health endpoint", () =>
    Effect.gen(function* servesHealthEndpoint() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const response = yield* requestApp(app, "http://localhost/health");

      expect(response.status).toBe(okStatus);
      expect(yield* fromPromise(response.json())).toEqual({
        status: "ok",
      });
    }),
  );

  it.effect("starts and stops a mock session from the dashboard", () =>
    Effect.gen(function* startsAndStopsAMockSessionFromTheDashboard() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);

      let response = yield* requestApp(app, "http://localhost/");
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Lonely Chat");
      expect(body).toContain("Status: idle");
      expect(body).toContain("Start Session");

      response = yield* requestApp(app, "http://localhost/session/start", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const activeBody = yield* fromPromise(response.text());

      expect(activeBody).toContain("Status: active");
      expect(activeBody).toContain("Platform: mock");
      expect(activeBody).toContain("Channel: lonely-chat");
      expect(activeBody).toContain("Stop Session");

      response = yield* requestApp(app, "http://localhost/session/stop", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const stoppedBody = yield* fromPromise(response.text());

      expect(stoppedBody).toContain("Status: idle");
      expect(stoppedBody).toContain("Last session ended: manual");
      expect(stoppedBody).toContain("Start Session");
    }),
  );

  it.effect("renders active cost alerts on the dashboard", () =>
    Effect.gen(function* rendersActiveCostAlertsOnTheDashboard() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);

      yield* fromPromise(
        runtime.runPromise(
          SessionService.use((sessionService) =>
            sessionService.startSession(
              new SessionStartOptions({
                costLimitUsd: 1,
                timeLimitSeconds: null,
              }),
            ),
          ),
        ),
      );
      yield* fromPromise(
        runtime.runPromise(
          SessionService.use((sessionService) => sessionService.recordCost(50, 0.75)),
        ),
      );

      const response = yield* requestApp(app, "http://localhost/");
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Alert Banner");
      expect(body).toContain("cost alert: 50% of 1 reached");
      expect(body).toContain("cost alert: 75% of 1 reached");
      expect(body).toContain("Total cost: $0.7500");
      expect(body).toContain("Cost limit: $1.0000");
    }),
  );

  it.effect("renders persisted chat history and streams live chat updates", () =>
    Effect.gen(function* rendersPersistedChatHistoryAndStreamsLiveChatUpdates() {
      const dbPath = yield* createDatabasePath;
      const { mockPlatformAdapter, runtime } = yield* createTestRuntimeWithMockPlatform(dbPath);
      const app = createApp(runtime);

      yield* fromPromise(
        runtime.runPromise(SessionService.use((sessionService) => sessionService.startSession())),
      );
      yield* Effect.yieldNow;
      yield* mockPlatformAdapter.emitIncomingMessage({
        channel: ChannelName.makeUnsafe("lonely-chat"),
        text: "hello from live chat",
        username: ChatUsername.makeUnsafe("viewer-1"),
      });

      const body = yield* waitForChatViewerMessage(app, "hello from live chat");

      expect(body).toContain("Chat Viewer");
      expect(body).toContain("hello from live chat");
      expect(body).toContain("viewer-1");
      expect(body).toContain("/api/chat/stream");

      const streamResponse = yield* requestApp(app, "http://localhost/api/chat/stream");

      expect(streamResponse.status).toBe(okStatus);

      const streamedMessage = Effect.promise(() =>
        readFirstServerSentEvent(streamResponse).then((payload) =>
          decodeChatStreamMessage(JSON.parse(payload) as unknown),
        ),
      );

      yield* Effect.yieldNow;
      yield* mockPlatformAdapter.emitIncomingMessage({
        channel: ChannelName.makeUnsafe("lonely-chat"),
        text: "second live line",
        username: ChatUsername.makeUnsafe("viewer-2"),
      });

      expect(yield* streamedMessage).toEqual(
        expect.objectContaining({
          botId: null,
          content: "second live line",
          isBot: false,
          platform: "mock",
          username: "viewer-2",
        }),
      );
    }),
  );

  it.effect("renders export links and downloads session history as csv and json", () =>
    Effect.gen(function* rendersExportLinksAndDownloadsSessionHistoryAsCsvAndJson() {
      const dbPath = yield* createDatabasePath;
      const { mockPlatformAdapter, runtime } = yield* createTestRuntimeWithMockPlatform(dbPath);
      const app = createApp(runtime);

      const session = yield* fromPromise(
        runtime.runPromise(SessionService.use((sessionService) => sessionService.startSession())),
      );
      yield* Effect.yieldNow;
      yield* mockPlatformAdapter.emitIncomingMessage({
        channel: ChannelName.makeUnsafe("lonely-chat"),
        text: "export this chat",
        username: ChatUsername.makeUnsafe("viewer-export"),
      });
      yield* waitForChatViewerMessage(app, "export this chat");
      yield* fromPromise(
        runtime.runPromise(SessionService.use((sessionService) => sessionService.stopSession())),
      );

      let response = yield* requestApp(app, "http://localhost/chat");
      let body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain(`/chat/export/${session.id}/csv`);
      expect(body).toContain(`/chat/export/${session.id}/json`);
      expect(body).toContain("Export CSV");
      expect(body).toContain("Export JSON");

      response = yield* requestApp(app, `http://localhost/chat/export/${session.id}/csv`);
      body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="session-${session.id}.csv"`,
      );
      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(body).toContain("timestamp,username,content,is_bot,model_used,tokens_used");
      expect(body).toContain('"viewer-export"');
      expect(body).toContain('"export this chat"');

      response = yield* requestApp(app, `http://localhost/chat/export/${session.id}/json`);

      expect(response.status).toBe(okStatus);
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="session-${session.id}.json"`,
      );
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(yield* fromPromise(response.json())).toEqual([
        expect.objectContaining({
          botId: null,
          content: "export this chat",
          isBot: false,
          platform: "mock",
          sessionId: session.id,
          tokensUsed: null,
          username: "viewer-export",
        }),
      ]);
    }),
  );

  it.effect("lists persisted bots through the bot listing api", () =>
    Effect.gen(function* listsPersistedBotsThroughTheBotListingApi() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const bot = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, bot));

      const response = yield* requestApp(app, "http://localhost/api/bots");

      expect(response.status).toBe(okStatus);
      expect(yield* fromPromise(response.json())).toEqual({
        bots: [
          {
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
          },
        ],
      });
    }),
  );

  it.effect("creates a bot from the bot manager form", () =>
    Effect.gen(function* createsABotFromTheBotManagerForm() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      let response = yield* requestBotForm(app, "http://localhost/bots", makeValidBotFormValues());

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/bots");
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Bot Manager");
      expect(body).toContain("Pixel");
      expect(body).toContain("@pixel_bot");
      expect(body).toContain("Model: openai/gpt-5-mini");
      expect(body).toContain("Talkativeness: 65");
      expect(body).toContain("Response Length: 3-10 words");
      expect(body).toContain("Edit bot");

      response = yield* requestApp(app, "http://localhost/api/bots");
      const apiBody = yield* Effect.promise(() =>
        response.json().then((payload): BotListApiResponse => decodeBotListApiResponse(payload)),
      );

      expect(apiBody.bots).toEqual([
        expect.objectContaining({
          description: "Snarky speedrunner commentary.",
          exampleMessages: ["clip it", "that split is cursed", "chat is farming resets"],
          fallbackModels: ["openai/gpt-4.1-mini", "anthropic/claude-3.7-sonnet"],
          firstMessage: "loading in",
          maxTokens: 160,
          personality: "Fast, dry, and chat-native.",
          postHistoryPrompt: "Stay in character.",
          responseLength: {
            max: 10,
            min: 3,
          },
          temperature: 0.7,
          vocabularyRules: ["Never use emojis.", "Never apologize."],
        }),
      ]);
    }),
  );

  it.effect("updates a bot from the bot manager form", () =>
    Effect.gen(function* updatesABotFromTheBotManagerForm() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const storedBot = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, storedBot));

      let response = yield* requestBotForm(
        app,
        `http://localhost/bots/${storedBot.id}`,
        makeValidBotFormValues({
          description: "Cool-headed late-night moderator.",
          displayName: "Marble",
          enabled: false,
          exampleMessages: "calm down chat\nsave it for halftime\nmods are awake",
          fallbackModels: "meta-llama/llama-3.1-8b-instruct:free",
          firstMessage: "",
          maxTokens: "96",
          model: "anthropic/claude-3.7-sonnet",
          name: "marble_bot",
          personality: "Calm, sharp, and a little smug.",
          platform: "kick",
          postHistoryPrompt: "Keep it clipped and confident.",
          responseLengthMax: "6",
          responseLengthMin: "2",
          systemPrompt: "You are Marble. Stay clipped.",
          talkativeness: "12",
          temperature: "1.1",
          vocabularyRules: "Never hedge.\nNever use emojis.",
        }),
      );

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/bots");
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Marble");
      expect(body).toContain("@marble_bot");
      expect(body).toContain("Platform: kick");
      expect(body).toContain("Model: anthropic/claude-3.7-sonnet");
      expect(body).toContain("Enabled: no");
      expect(body).toContain("Talkativeness: 12");
      expect(body).toContain("Response Length: 2-6 words");

      response = yield* requestApp(app, "http://localhost/api/bots");
      const apiBody = yield* Effect.promise(() =>
        response.json().then((payload): BotListApiResponse => decodeBotListApiResponse(payload)),
      );

      expect(apiBody.bots).toEqual([
        expect.objectContaining({
          description: "Cool-headed late-night moderator.",
          displayName: "Marble",
          enabled: false,
          exampleMessages: ["calm down chat", "save it for halftime", "mods are awake"],
          fallbackModels: ["meta-llama/llama-3.1-8b-instruct:free"],
          firstMessage: null,
          maxTokens: 96,
          model: "anthropic/claude-3.7-sonnet",
          name: "marble_bot",
          personality: "Calm, sharp, and a little smug.",
          platform: "kick",
          postHistoryPrompt: "Keep it clipped and confident.",
          responseLength: {
            max: 6,
            min: 2,
          },
          systemPrompt: "You are Marble. Stay clipped.",
          talkativeness: 12,
          temperature: 1.1,
          vocabularyRules: ["Never hedge.", "Never use emojis."],
        }),
      ]);
    }),
  );

  it.effect("shows validation errors for invalid bot form input", () =>
    Effect.gen(function* showsValidationErrorsForInvalidBotFormInput() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);

      const response = yield* requestBotForm(
        app,
        "http://localhost/bots",
        makeValidBotFormValues({
          description: " ",
          displayName: "",
          exampleMessages: "one\ntwo",
          maxTokens: "0",
          model: "",
          name: "   ",
          personality: "",
          platform: "youtube",
          responseLengthMax: "2",
          responseLengthMin: "5",
          talkativeness: "101",
          temperature: "3",
        }),
      );
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(400);
      expect(body).toContain("Name is required.");
      expect(body).toContain("Display name is required.");
      expect(body).toContain("Model is required.");
      expect(body).toContain("Platform must be twitch or kick.");
      expect(body).toContain("Talkativeness must be an integer between 0 and 100.");
      expect(body).toContain("Description is required.");
      expect(body).toContain("Personality is required.");
      expect(body).toContain("Example messages must include 3 to 5 entries.");
      expect(body).toContain("Temperature must be a number between 0 and 2.");
      expect(body).toContain("Max tokens must be a positive integer.");
      expect(body).toContain("Maximum response length must be greater than or equal to minimum.");
    }),
  );

  it.effect("previews a bot response through the preview api", () =>
    Effect.gen(function* previewsABotResponseThroughThePreviewApi() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const storedBot = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, storedBot));

      const response = yield* requestBotPreviewApi(app, storedBot.id, "  why is chat screaming?  ");

      expect(response.status).toBe(okStatus);

      const body = yield* Effect.promise(() =>
        response.json().then((payload) => decodeBotPreviewApiResponse(payload)),
      );

      expect(body).toEqual({
        model: "openai/gpt-5-mini",
        prompt: "why is chat screaming?",
        response: "Pixel: [fake:openai/gpt-5-mini] why is chat screaming?",
      });
    }),
  );

  it.effect("renders a preview response in the bot manager ui", () =>
    Effect.gen(function* rendersAPreviewResponseInTheBotManagerUi() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const storedBot = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, storedBot));

      const response = yield* requestBotPreviewForm(
        app,
        storedBot.id,
        "what happened to that split?",
      );
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Preview Bot");
      expect(body).toContain(
        "Preview Response: Pixel: [fake:openai/gpt-5-mini] what happened to that split?",
      );
    }),
  );

  it.effect("creates, updates, and deletes scenarios from the scenarios page", () =>
    Effect.gen(function* createsUpdatesAndDeletesScenariosFromTheScenariosPage() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const pixel = makeTestBot();
      const marble = makeTestBot({
        displayName: "Marble",
        id: BotId.makeUnsafe("bot-marble"),
        name: "marble_bot",
      });

      yield* fromPromise(
        Promise.all([createStoredBot(runtime, pixel), createStoredBot(runtime, marble)]),
      );

      let response = yield* requestScenarioForm(
        app,
        "http://localhost/scenarios",
        makeValidScenarioFormValues(),
      );

      expect(response.status).toBe(seeOtherStatus);

      const [storedScenario] = yield* Effect.promise(() =>
        runtime.runPromise(
          ScenarioService.use((scenarioService) => scenarioService.listScenarios()),
        ),
      );
      const scenarioId = storedScenario?.id ?? "";

      expect(storedScenario).toBeDefined();
      expect(scenarioId).not.toBe("");

      response = yield* requestApp(app, "http://localhost/scenarios");
      let body = yield* fromPromise(response.text());

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Scenarios");
      expect(body).toContain("Ad CTA Hype");
      expect(body).toContain("Kick off a merch promotion sequence.");
      expect(body).toContain("Participants: 2");
      expect(body).toContain("Trigger: timed");

      response = yield* requestScenarioForm(
        app,
        `http://localhost/scenarios/${scenarioId}`,
        makeValidScenarioFormValues({
          description: "Stress-test a heated debate flow.",
          durationSeconds: "",
          enabled: false,
          name: "Heated Debate",
          participants: ["bot-pixel"],
          steps: "",
          topic: "controversial gaming opinion",
          triggerDelaySeconds: "",
          triggerEventType: "new_viewer_joined",
          triggerType: "on_event",
        }),
      );

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/scenarios");
      body = yield* fromPromise(response.text());

      expect(body).toContain("Heated Debate");
      expect(body).toContain("Stress-test a heated debate flow.");
      expect(body).toContain("Participants: 1");
      expect(body).toContain("Trigger: on_event");
      expect(body).toContain("Enabled: no");

      response = yield* requestApp(app, `http://localhost/scenarios/${scenarioId}/delete`, {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/scenarios");
      body = yield* fromPromise(response.text());

      expect(body).toContain("No scenarios configured yet.");
    }),
  );

  it.effect("runs a manual scenario from the scenarios page during an active session", () =>
    Effect.gen(function* runsAManualScenarioFromTheScenariosPageDuringAnActiveSession() {
      const dbPath = yield* createDatabasePath;
      const { runtime } = yield* createTestRuntimeWithMockPlatform(dbPath);
      const app = createApp(runtime);
      const pixel = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, pixel));

      let response = yield* requestScenarioForm(
        app,
        "http://localhost/scenarios",
        makeValidScenarioFormValues({
          participants: [pixel.id],
          steps: JSON.stringify([
            {
              action: "say",
              botId: pixel.id,
              content: "scripted hello from scenario",
              delayAfter: 0,
            },
          ]),
          triggerDelaySeconds: "",
          triggerType: "manual",
        }),
      );

      expect(response.status).toBe(seeOtherStatus);

      const [storedScenario] = yield* Effect.promise(() =>
        runtime.runPromise(
          ScenarioService.use((scenarioService) => scenarioService.listScenarios()),
        ),
      );
      const scenarioId = storedScenario?.id ?? "";

      expect(scenarioId).not.toBe("");

      response = yield* requestApp(app, "http://localhost/session/start", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/scenarios");
      let body = yield* fromPromise(response.text());

      expect(body).toContain("Session status: active on lonely-chat");
      expect(body).toContain("Run Scenario");

      response = yield* requestApp(app, `http://localhost/scenarios/${scenarioId}/run`, {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      body = yield* waitForChatViewerMessage(app, "scripted hello from scenario");

      expect(body).toContain("scripted hello from scenario");
      expect(body).toContain("pixel_bot");
    }),
  );

  it.effect("shows validation errors for invalid scenario form input", () =>
    Effect.gen(function* showsValidationErrorsForInvalidScenarioFormInput() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const pixel = makeTestBot();

      yield* fromPromise(createStoredBot(runtime, pixel));

      const response = yield* requestScenarioForm(
        app,
        "http://localhost/scenarios",
        makeValidScenarioFormValues({
          description: " ",
          durationSeconds: "0",
          enabled: false,
          name: " ",
          participants: [],
          steps: "{bad json",
          topic: " ",
          triggerDelaySeconds: "",
          triggerEventType: "",
          triggerType: "timed",
        }),
      );
      const body = yield* fromPromise(response.text());

      expect(response.status).toBe(400);
      expect(body).toContain("Name is required.");
      expect(body).toContain("Description is required.");
      expect(body).toContain("Topic is required.");
      expect(body).toContain("Select at least one participant.");
      expect(body).toContain("Duration must be a positive integer.");
      expect(body).toContain("Timed triggers require delay seconds.");
      expect(body).toContain("Steps must be valid JSON matching the scenario step schema.");
    }),
  );
});
