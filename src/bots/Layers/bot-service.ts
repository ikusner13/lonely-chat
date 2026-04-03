import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { BotId, BotRecord } from "../bot-record";
import { BotService } from "../Services/bot-service";
import type { BotServiceShape } from "../Services/bot-service";

const decodeStringArray = Schema.decodeUnknownSync(Schema.Array(Schema.String));

interface BotRow {
  readonly created_at: string;
  readonly description: string;
  readonly display_name: string;
  readonly enabled: number;
  readonly example_messages: string;
  readonly fallback_models: string;
  readonly first_message: string | null;
  readonly id: string;
  readonly max_tokens: number;
  readonly model: string;
  readonly name: string;
  readonly personality: string;
  readonly platform: "twitch" | "kick";
  readonly post_history_prompt: string | null;
  readonly response_length_max: number;
  readonly response_length_min: number;
  readonly system_prompt: string | null;
  readonly talkativeness: number;
  readonly temperature: number;
  readonly updated_at: string;
  readonly vocabulary_rules: string;
}

const parseStringArray = (value: string): readonly string[] =>
  decodeStringArray(JSON.parse(value) as unknown);

const makeBotRecord = (row: BotRow): BotRecord =>
  new BotRecord({
    createdAt: row.created_at,
    description: row.description,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    exampleMessages: parseStringArray(row.example_messages),
    fallbackModels: parseStringArray(row.fallback_models),
    firstMessage: row.first_message,
    id: BotId.makeUnsafe(row.id),
    maxTokens: row.max_tokens,
    model: row.model,
    name: row.name,
    personality: row.personality,
    platform: row.platform,
    postHistoryPrompt: row.post_history_prompt,
    responseLength: {
      max: row.response_length_max,
      min: row.response_length_min,
    },
    systemPrompt: row.system_prompt,
    talkativeness: row.talkativeness,
    temperature: row.temperature,
    updatedAt: row.updated_at,
    vocabularyRules: parseStringArray(row.vocabulary_rules),
  });

const selectFirstBot = (rows: readonly BotRow[]): BotRecord | null => {
  const [bot] = rows;

  if (bot === undefined) {
    return null;
  }

  return makeBotRecord(bot);
};

export const BotServiceLive = Layer.effect(
  BotService,
  Effect.gen(function* makeBotService() {
    const sql = yield* SqlClient.SqlClient;

    const createBot = Effect.fn("BotService.createBot")(function* createBotEffect(bot: BotRecord) {
      yield* sql`INSERT INTO bots (
          id,
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
          created_at,
          updated_at
        )
        VALUES (
          ${bot.id},
          ${bot.name},
          ${bot.displayName},
          ${bot.platform},
          ${bot.model},
          ${JSON.stringify(bot.fallbackModels)},
          ${bot.temperature},
          ${bot.maxTokens},
          ${bot.personality},
          ${bot.description},
          ${JSON.stringify(bot.exampleMessages)},
          ${bot.firstMessage},
          ${bot.postHistoryPrompt},
          ${JSON.stringify(bot.vocabularyRules)},
          ${bot.responseLength.min},
          ${bot.responseLength.max},
          ${bot.talkativeness},
          ${bot.systemPrompt},
          ${bot.enabled ? 1 : 0},
          ${bot.createdAt},
          ${bot.updatedAt}
        )`;

      return bot;
    });

    const getBot = Effect.fn("BotService.getBot")(function* getBotEffect(id: BotId) {
      const rows = yield* sql<BotRow>`SELECT
          id,
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
          created_at,
          updated_at
        FROM bots
        WHERE id = ${id}
        LIMIT 1`;

      return selectFirstBot(rows);
    });

    const listBots = Effect.fn("BotService.listBots")(function* listBotsEffect() {
      const rows = yield* sql<BotRow>`SELECT
          id,
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
          created_at,
          updated_at
        FROM bots
        ORDER BY created_at ASC, name ASC`;

      return rows.map(makeBotRecord);
    });

    const updateBot = Effect.fn("BotService.updateBot")(function* updateBotEffect(bot: BotRecord) {
      yield* sql`UPDATE bots
        SET name = ${bot.name},
            display_name = ${bot.displayName},
            platform = ${bot.platform},
            model = ${bot.model},
            fallback_models = ${JSON.stringify(bot.fallbackModels)},
            temperature = ${bot.temperature},
            max_tokens = ${bot.maxTokens},
            personality = ${bot.personality},
            description = ${bot.description},
            example_messages = ${JSON.stringify(bot.exampleMessages)},
            first_message = ${bot.firstMessage},
            post_history_prompt = ${bot.postHistoryPrompt},
            vocabulary_rules = ${JSON.stringify(bot.vocabularyRules)},
            response_length_min = ${bot.responseLength.min},
            response_length_max = ${bot.responseLength.max},
            talkativeness = ${bot.talkativeness},
            system_prompt = ${bot.systemPrompt},
            enabled = ${bot.enabled ? 1 : 0},
            updated_at = ${bot.updatedAt}
        WHERE id = ${bot.id}`;

      return yield* getBot(bot.id);
    });

    return BotService.of({
      createBot,
      getBot,
      listBots,
      updateBot,
    } satisfies BotServiceShape);
  }),
);
