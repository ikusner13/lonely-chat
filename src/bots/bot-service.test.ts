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
  readonly display_name: string;
  readonly enabled: number;
  readonly fallback_models: string;
  readonly model: string;
  readonly name: string;
  readonly platform: string;
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

      return yield* sql<StoredBotRow>`SELECT name, display_name, platform, model, enabled, fallback_models
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
    exampleMessages: ["calm down chat"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: null,
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
  it.effect("creates bot records and lists persisted bots", () =>
    Effect.gen(function* createsBotRecordsAndListsPersistedBots() {
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
          display_name: "ModBot",
          enabled: 1,
          fallback_models: JSON.stringify(["openai/gpt-4.1-mini"]),
          model: "openai/gpt-5-mini",
          name: "mod_bot",
          platform: "twitch",
        },
      ]);
    }),
  );
});
