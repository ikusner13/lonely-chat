import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { BotAuthStatusRecord, BotTokenId, BotTokenRecord } from "../bot-token-record";
import { BotMemoryId, BotMemoryRecord } from "../bot-memory-record";
import { BotId, BotRecord } from "../bot-record";
import { SessionId } from "../../sessions/Services/session-service";
import { BotService } from "../Services/bot-service";
import type { BotServiceShape } from "../Services/bot-service";

const decodeStringArrayFromJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Schema.String)),
);

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

interface BotMemoryRow {
  readonly bot_id: string;
  readonly created_at: string;
  readonly id: string;
  readonly session_id: string;
  readonly summary: string;
}

interface BotTokenRow {
  readonly access_token: string;
  readonly bot_id: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly id: string;
  readonly platform: "twitch" | "kick";
  readonly refresh_token: string;
  readonly scopes: string;
  readonly updated_at: string;
}

const parseStringArray = (value: string): readonly string[] => decodeStringArrayFromJson(value);

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

const makeBotMemoryRecord = (row: BotMemoryRow): BotMemoryRecord =>
  new BotMemoryRecord({
    botId: BotId.makeUnsafe(row.bot_id),
    createdAt: row.created_at,
    id: BotMemoryId.makeUnsafe(row.id),
    sessionId: SessionId.makeUnsafe(row.session_id),
    summary: row.summary,
  });

const makeBotTokenRecord = (row: BotTokenRow): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: row.access_token,
    botId: BotId.makeUnsafe(row.bot_id),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    id: BotTokenId.makeUnsafe(row.id),
    platform: row.platform,
    refreshToken: row.refresh_token,
    scopes: parseStringArray(row.scopes),
    updatedAt: row.updated_at,
  });

const makeMissingBotAuthStatus = (bot: BotRecord): BotAuthStatusRecord =>
  new BotAuthStatusRecord({
    botId: bot.id,
    expiresAt: null,
    platform: bot.platform,
    scopes: [],
    status: "missing",
    updatedAt: null,
  });

const makeBotAuthStatusRecord = (
  bot: BotRecord,
  token: BotTokenRecord | null,
  now: string,
): BotAuthStatusRecord => {
  if (token === null) {
    return makeMissingBotAuthStatus(bot);
  }

  return new BotAuthStatusRecord({
    botId: token.botId,
    expiresAt: token.expiresAt,
    platform: token.platform,
    scopes: token.scopes,
    status: token.expiresAt <= now ? "expired" : "valid",
    updatedAt: token.updatedAt,
  });
};

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

    const createBotMemory = Effect.fn("BotService.createBotMemory")(function* createBotMemoryEffect(
      memory: BotMemoryRecord,
    ) {
      yield* sql`INSERT INTO bot_memory (
          id,
          bot_id,
          session_id,
          summary,
          created_at
        )
        VALUES (
          ${memory.id},
          ${memory.botId},
          ${memory.sessionId},
          ${memory.summary},
          ${memory.createdAt}
        )`;

      return memory;
    });

    const getBotToken = Effect.fn("BotService.getBotToken")(function* getBotTokenEffect(
      botId: BotId,
    ) {
      const rows = yield* sql<BotTokenRow>`SELECT
          bot_tokens.id,
          bot_tokens.bot_id,
          bot_tokens.platform,
          bot_tokens.access_token,
          bot_tokens.refresh_token,
          bot_tokens.scopes,
          bot_tokens.expires_at,
          bot_tokens.created_at,
          bot_tokens.updated_at
        FROM bot_tokens
        LEFT JOIN bots ON bots.id = bot_tokens.bot_id
        WHERE bot_tokens.bot_id = ${botId}
        ORDER BY
          CASE
            WHEN bots.platform IS NULL THEN 1
            WHEN bot_tokens.platform = bots.platform THEN 0
            ELSE 1
          END ASC,
          bot_tokens.updated_at DESC,
          bot_tokens.created_at DESC,
          bot_tokens.rowid DESC
        LIMIT 1`;

      const [token] = rows;

      return token === undefined ? null : makeBotTokenRecord(token);
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

    const getBotAuthStatus = Effect.fn("BotService.getBotAuthStatus")(
      function* getBotAuthStatusEffect(botId: BotId, now: string) {
        const bot = yield* getBot(botId);

        if (bot === null) {
          return new BotAuthStatusRecord({
            botId,
            expiresAt: null,
            platform: "twitch",
            scopes: [],
            status: "missing",
            updatedAt: null,
          });
        }

        const token = yield* getBotToken(botId);

        return makeBotAuthStatusRecord(bot, token, now);
      },
    );

    const listBotMemories = Effect.fn("BotService.listBotMemories")(function* listBotMemoriesEffect(
      botId: BotId,
    ) {
      const rows = yield* sql<BotMemoryRow>`SELECT
          id,
          bot_id,
          session_id,
          summary,
          created_at
        FROM bot_memory
        WHERE bot_id = ${botId}
        ORDER BY created_at DESC, rowid DESC`;

      return rows.map(makeBotMemoryRecord);
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

    const listBotsWithAuthStatus = Effect.fn("BotService.listBotsWithAuthStatus")(
      function* listBotsWithAuthStatusEffect(now: string) {
        const bots = yield* listBots();
        const authEntries: {
          readonly auth: BotAuthStatusRecord;
          readonly bot: BotRecord;
          readonly token: BotTokenRecord | null;
        }[] = [];

        for (const bot of bots) {
          const token = yield* getBotToken(bot.id);

          authEntries.push({
            auth: makeBotAuthStatusRecord(bot, token, now),
            bot,
            token,
          });
        }

        return authEntries;
      },
    );

    const upsertBotToken = Effect.fn("BotService.upsertBotToken")(function* upsertBotTokenEffect(
      token: BotTokenRecord,
    ) {
      yield* sql`INSERT INTO bot_tokens (
          id,
          bot_id,
          platform,
          access_token,
          refresh_token,
          scopes,
          expires_at,
          created_at,
          updated_at
        )
        VALUES (
          ${token.id},
          ${token.botId},
          ${token.platform},
          ${token.accessToken},
          ${token.refreshToken},
          ${JSON.stringify(token.scopes)},
          ${token.expiresAt},
          ${token.createdAt},
          ${token.updatedAt}
        )
        ON CONFLICT(bot_id, platform)
        DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          scopes = excluded.scopes,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`;

      const storedToken = yield* getBotToken(token.botId);

      return storedToken ?? token;
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
      createBotMemory,
      getBotAuthStatus,
      getBot,
      getBotToken,
      listBotMemories,
      listBots,
      listBotsWithAuthStatus,
      upsertBotToken,
      updateBot,
    } satisfies BotServiceShape);
  }),
);
