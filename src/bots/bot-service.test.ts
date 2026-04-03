import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeDatabaseLayer } from "../db/database";
import { BotId, BotRecord } from "./bot-record";
import { BotServiceLive } from "./Layers/bot-service";
import { BotService } from "./Services/bot-service";

const createdAt = "2026-04-03T00:00:00.000Z";
const updatedAt = "2026-04-03T00:00:01.000Z";

interface StoredBotRow {
  readonly description: string;
  readonly display_name: string;
  readonly enabled: number;
  readonly example_messages: string;
  readonly fallback_models: string;
  readonly first_message: string | null;
  readonly max_tokens: number;
  readonly model: string;
  readonly name: string;
  readonly personality: string;
  readonly platform: string;
  readonly post_history_prompt: string | null;
  readonly response_length_max: number;
  readonly response_length_min: number;
  readonly system_prompt: string | null;
  readonly talkativeness: number;
  readonly temperature: number;
  readonly updated_at: string;
  readonly vocabulary_rules: string;
}

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-bot-"));

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

const runWithDatabase = <Result, Error>(
  dbPath: string,
  effect: Effect.Effect<Result, Error, SqlClient.SqlClient>,
): Effect.Effect<Result, unknown> =>
  Effect.scoped(effect.pipe(Effect.provide(makeDatabaseLayer(dbPath))));

const loadStoredBots = (dbPath: string): Effect.Effect<readonly StoredBotRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredBots() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredBotRow>`SELECT
          name,
          display_name,
          platform,
          model,
          fallback_models,
          temperature,
          max_tokens,
          personality,
          description,
          example_messages,
          first_message,
          post_history_prompt,
          vocabulary_rules,
          response_length_min,
          response_length_max,
          talkativeness,
          system_prompt,
          enabled,
          updated_at
        FROM bots
        ORDER BY created_at ASC`;
    }),
  );

const makeTestBot = (): BotRecord =>
  new BotRecord({
    createdAt,
    description: "Dry moderator energy.",
    displayName: "ModBot",
    enabled: true,
    exampleMessages: ["calm down chat", "save it for halftime", "mods are awake"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: "checking in",
    id: BotId.makeUnsafe("bot-mod"),
    maxTokens: 128,
    model: "openai/gpt-5-mini",
    name: "mod_bot",
    personality: "Brief and sarcastic.",
    platform: "twitch",
    postHistoryPrompt: "Stay snappy.",
    responseLength: {
      max: 8,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 40,
    temperature: 0.6,
    updatedAt,
    vocabularyRules: ["Never apologize."],
  });

describe("bot service", () => {
  it.effect("creates bot records and persists advanced JSON-backed fields", () =>
    Effect.gen(function* createsBotRecordsAndPersistsAdvancedJsonBackedFields() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const bot = makeTestBot();

      const listedBots = yield* Effect.gen(function* exerciseBotService() {
        const botService = yield* BotService;

        expect(yield* botService.createBot(bot)).toEqual(bot);

        return yield* botService.listBots();
      }).pipe(Effect.provide(botLayer));

      expect(listedBots).toEqual([bot]);
      expect(yield* loadStoredBots(dbPath)).toEqual([
        {
          description: "Dry moderator energy.",
          display_name: "ModBot",
          enabled: 1,
          example_messages: JSON.stringify([
            "calm down chat",
            "save it for halftime",
            "mods are awake",
          ]),
          fallback_models: JSON.stringify(["openai/gpt-4.1-mini"]),
          first_message: "checking in",
          max_tokens: 128,
          model: "openai/gpt-5-mini",
          name: "mod_bot",
          personality: "Brief and sarcastic.",
          platform: "twitch",
          post_history_prompt: "Stay snappy.",
          response_length_max: 8,
          response_length_min: 3,
          system_prompt: null,
          talkativeness: 40,
          temperature: 0.6,
          updated_at: updatedAt,
          vocabulary_rules: JSON.stringify(["Never apologize."]),
        },
      ]);
    }),
  );

  it.effect("updates persisted advanced bot fields", () =>
    Effect.gen(function* updatesPersistedAdvancedBotFields() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const bot = makeTestBot();

      const updatedBot = yield* Effect.gen(function* exerciseBotUpdate() {
        const botService = yield* BotService;

        yield* botService.createBot(bot);

        return yield* botService.updateBot(
          new BotRecord({
            createdAt: bot.createdAt,
            description: "Night-shift moderator with zero patience.",
            displayName: "ModBotPrime",
            enabled: false,
            exampleMessages: ["save it", "take a lap", "chat is on notice"],
            fallbackModels: ["meta-llama/llama-3.1-8b-instruct:free"],
            firstMessage: null,
            id: bot.id,
            maxTokens: 96,
            model: "anthropic/claude-3.7-sonnet",
            name: bot.name,
            personality: "Short, icy, and amused.",
            platform: "kick",
            postHistoryPrompt: "Stay clipped and confident.",
            responseLength: {
              max: 6,
              min: 2,
            },
            systemPrompt: "You are ModBotPrime. Stay clipped.",
            talkativeness: 12,
            temperature: 1.1,
            updatedAt: "2026-04-03T00:00:02.000Z",
            vocabularyRules: ["Never hedge.", "Never use emojis."],
          }),
        );
      }).pipe(Effect.provide(botLayer));

      expect(updatedBot).not.toBeNull();
      expect(updatedBot?.description).toBe("Night-shift moderator with zero patience.");
      expect(updatedBot?.fallbackModels).toEqual(["meta-llama/llama-3.1-8b-instruct:free"]);
      expect(updatedBot?.responseLength).toEqual({
        max: 6,
        min: 2,
      });
      expect(updatedBot?.systemPrompt).toBe("You are ModBotPrime. Stay clipped.");
      expect(yield* loadStoredBots(dbPath)).toEqual([
        {
          description: "Night-shift moderator with zero patience.",
          display_name: "ModBotPrime",
          enabled: 0,
          example_messages: JSON.stringify(["save it", "take a lap", "chat is on notice"]),
          fallback_models: JSON.stringify(["meta-llama/llama-3.1-8b-instruct:free"]),
          first_message: null,
          max_tokens: 96,
          model: "anthropic/claude-3.7-sonnet",
          name: "mod_bot",
          personality: "Short, icy, and amused.",
          platform: "kick",
          post_history_prompt: "Stay clipped and confident.",
          response_length_max: 6,
          response_length_min: 2,
          system_prompt: "You are ModBotPrime. Stay clipped.",
          talkativeness: 12,
          temperature: 1.1,
          updated_at: "2026-04-03T00:00:02.000Z",
          vocabulary_rules: JSON.stringify(["Never hedge.", "Never use emojis."]),
        },
      ]);
    }),
  );
});
