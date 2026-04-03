import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createApp, makeAppRuntime } from "./app";
import type { BotCoreFieldFormValues } from "./bots/bot-core-fields";
import { BotRecord, BotId } from "./bots/bot-record";
import { BotService } from "./bots/Services/bot-service";

const okStatus = 200;
const seeOtherStatus = 303;
const botCreatedAt = "2026-04-03T00:00:00.000Z";
const botUpdatedAt = "2026-04-03T00:00:00.000Z";

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-app-"));

    return directory;
  }),
  (directory) =>
    Effect.promise(async () => {
      await rm(directory, {
        force: true,
        recursive: true,
      });
    }).pipe(Effect.orDie),
).pipe(Effect.map((directory) => join(directory, "lonely-chat.sqlite")));

const createTestRuntime = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.sync(() => makeAppRuntime(dbPath)),
    (runtime) =>
      Effect.promise(async () => {
        await runtime.dispose();
      }).pipe(Effect.orDie),
  );

const makeTestBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: botCreatedAt,
    description: "Snarky speedrunner commentary.",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["clip it", "that split is cursed"],
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

const requestApp = (
  app: ReturnType<typeof createApp>,
  url: string,
  init?: RequestInit,
): Effect.Effect<Response> =>
  Effect.promise(async () => {
    const response = await app.request(url, init);

    return response;
  });

const requestBotForm = (
  app: ReturnType<typeof createApp>,
  url: string,
  values: BotCoreFieldFormValues,
): Effect.Effect<Response> => {
  const body = new URLSearchParams({
    displayName: values.displayName,
    model: values.model,
    name: values.name,
    platform: values.platform,
    talkativeness: values.talkativeness,
  });

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
      expect(
        yield* Effect.promise(async () => {
          const body = await response.json();

          return body;
        }),
      ).toEqual({
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
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Lonely Chat");
      expect(body).toContain("Status: idle");
      expect(body).toContain("Start Session");

      response = yield* requestApp(app, "http://localhost/session/start", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const activeBody = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(activeBody).toContain("Status: active");
      expect(activeBody).toContain("Platform: mock");
      expect(activeBody).toContain("Channel: lonely-chat");
      expect(activeBody).toContain("Stop Session");

      response = yield* requestApp(app, "http://localhost/session/stop", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const stoppedBody = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(stoppedBody).toContain("Status: idle");
      expect(stoppedBody).toContain("Last session ended: manual");
      expect(stoppedBody).toContain("Start Session");
    }),
  );

  it.effect("lists persisted bots through the bot listing api", () =>
    Effect.gen(function* listsPersistedBotsThroughTheBotListingApi() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const bot = makeTestBot();

      yield* Effect.promise(async () => {
        await createStoredBot(runtime, bot);
      });

      const response = yield* requestApp(app, "http://localhost/api/bots");

      expect(response.status).toBe(okStatus);
      expect(
        yield* Effect.promise(async () => {
          const body = await response.json();

          return body;
        }),
      ).toEqual({
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
      let response = yield* requestBotForm(app, "http://localhost/bots", {
        displayName: "Pixel",
        enabled: true,
        model: "openai/gpt-5-mini",
        name: "pixel_bot",
        platform: "twitch",
        talkativeness: "65",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/bots");
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Bot Manager");
      expect(body).toContain("Pixel");
      expect(body).toContain("@pixel_bot");
      expect(body).toContain("Model: openai/gpt-5-mini");
      expect(body).toContain("Talkativeness: 65");
      expect(body).toContain("Edit core fields");
    }),
  );

  it.effect("updates a bot from the bot manager form", () =>
    Effect.gen(function* updatesABotFromTheBotManagerForm() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const storedBot = makeTestBot();

      yield* Effect.promise(async () => {
        await createStoredBot(runtime, storedBot);
      });

      let response = yield* requestBotForm(app, `http://localhost/bots/${storedBot.id}`, {
        displayName: "Marble",
        enabled: false,
        model: "anthropic/claude-3.7-sonnet",
        name: "marble_bot",
        platform: "kick",
        talkativeness: "12",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/bots");
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Marble");
      expect(body).toContain("@marble_bot");
      expect(body).toContain("Platform: kick");
      expect(body).toContain("Model: anthropic/claude-3.7-sonnet");
      expect(body).toContain("Enabled: no");
      expect(body).toContain("Talkativeness: 12");
    }),
  );

  it.effect("shows validation errors for invalid bot form input", () =>
    Effect.gen(function* showsValidationErrorsForInvalidBotFormInput() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);

      const response = yield* requestBotForm(app, "http://localhost/bots", {
        displayName: "",
        enabled: false,
        model: "",
        name: "   ",
        platform: "youtube",
        talkativeness: "101",
      });
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(400);
      expect(body).toContain("Name is required.");
      expect(body).toContain("Display name is required.");
      expect(body).toContain("Model is required.");
      expect(body).toContain("Platform must be twitch or kick.");
      expect(body).toContain("Talkativeness must be an integer between 0 and 100.");
    }),
  );
});
