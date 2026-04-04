import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { makeDatabaseLayer } from "../db/database";
import { SessionId } from "../sessions/Services/session-service";
import { BotAuthStatusRecord, BotTokenId, BotTokenRecord } from "./bot-token-record";
import { BotMemoryId, BotMemoryRecord } from "./bot-memory-record";
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

interface StoredBotMemoryRow {
  readonly bot_id: string;
  readonly created_at: string;
  readonly session_id: string;
  readonly summary: string;
}

interface StoredBotTokenRow {
  readonly access_token: string;
  readonly bot_id: string;
  readonly created_at: string;
  readonly expires_at: string;
  readonly platform: string;
  readonly refresh_token: string;
  readonly scopes: string;
  readonly updated_at: string;
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

const loadStoredBotMemories = (
  dbPath: string,
): Effect.Effect<readonly StoredBotMemoryRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredBotMemories() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredBotMemoryRow>`SELECT
          bot_id,
          session_id,
          summary,
          created_at
        FROM bot_memory
        ORDER BY created_at DESC, rowid DESC`;
    }),
  );

const loadStoredBotTokens = (
  dbPath: string,
): Effect.Effect<readonly StoredBotTokenRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryStoredBotTokens() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<StoredBotTokenRow>`SELECT
          bot_id,
          platform,
          access_token,
          refresh_token,
          scopes,
          expires_at,
          created_at,
          updated_at
        FROM bot_tokens
        ORDER BY created_at ASC, rowid ASC`;
    }),
  );

const insertStoredSession = (
  dbPath: string,
  sessionId: string,
  startedAt: string,
): Effect.Effect<void, unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* insertStoredSessionRow() {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO sessions (
          id,
          platform,
          channel,
          status,
          started_at,
          ended_at,
          end_reason,
          total_messages,
          total_tokens_used,
          total_cost_usd,
          time_limit_seconds,
          cost_limit_usd
        )
        VALUES (
          ${sessionId},
          ${"mock"},
          ${"lonely-chat"},
          ${"ended"},
          ${startedAt},
          ${startedAt},
          ${"manual"},
          ${0},
          ${0},
          ${0},
          ${null},
          ${null}
        )`;
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

const makeTestToken = (bot: BotRecord, overrides?: Partial<BotTokenRecord>): BotTokenRecord =>
  new BotTokenRecord({
    accessToken: "access-token-1",
    botId: bot.id,
    createdAt,
    expiresAt: "2026-04-04T00:00:00.000Z",
    id: BotTokenId.makeUnsafe(`token-${bot.id}`),
    platform: bot.platform,
    refreshToken: "refresh-token-1",
    scopes: ["chat:read", "chat:edit"],
    updatedAt,
    ...overrides,
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

  it.effect("stores and lists recent bot memory summaries in reverse chronological order", () =>
    Effect.gen(function* storesAndListsRecentBotMemorySummariesInReverseChronologicalOrder() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const bot = makeTestBot();
      const olderMemory = new BotMemoryRecord({
        botId: bot.id,
        createdAt: "2026-04-03T00:10:00.000Z",
        id: BotMemoryId.makeUnsafe("memory-older"),
        sessionId: SessionId.makeUnsafe("session-older"),
        summary: "Kept calling everything a halftime adjustment.",
      });
      const newerMemory = new BotMemoryRecord({
        botId: bot.id,
        createdAt: "2026-04-03T00:20:00.000Z",
        id: BotMemoryId.makeUnsafe("memory-newer"),
        sessionId: SessionId.makeUnsafe("session-newer"),
        summary: "Started a running joke about referee reviews.",
      });

      const storedMemories = yield* Effect.gen(function* exerciseBotMemoryPersistence() {
        const botService = yield* BotService;

        yield* botService.createBot(bot);
        yield* insertStoredSession(dbPath, olderMemory.sessionId, olderMemory.createdAt);
        yield* insertStoredSession(dbPath, newerMemory.sessionId, newerMemory.createdAt);
        yield* botService.createBotMemory(olderMemory);
        yield* botService.createBotMemory(newerMemory);

        return yield* botService.listBotMemories(bot.id);
      }).pipe(Effect.provide(botLayer));

      expect(storedMemories).toEqual([newerMemory, olderMemory]);
      expect(yield* loadStoredBotMemories(dbPath)).toEqual([
        {
          bot_id: bot.id,
          created_at: newerMemory.createdAt,
          session_id: newerMemory.sessionId,
          summary: newerMemory.summary,
        },
        {
          bot_id: bot.id,
          created_at: olderMemory.createdAt,
          session_id: olderMemory.sessionId,
          summary: olderMemory.summary,
        },
      ]);
    }),
  );

  it.effect("upserts bot tokens and persists token metadata", () =>
    Effect.gen(function* upsertsBotTokensAndPersistsTokenMetadata() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const bot = makeTestBot();
      const initialToken = makeTestToken(bot);
      const refreshedToken = makeTestToken(bot, {
        accessToken: "access-token-2",
        expiresAt: "2026-04-05T00:00:00.000Z",
        id: BotTokenId.makeUnsafe("token-refreshed"),
        refreshToken: "refresh-token-2",
        scopes: ["chat:edit"],
        updatedAt: "2026-04-03T00:00:02.000Z",
      });

      const storedToken = yield* Effect.gen(function* exerciseBotTokenPersistence() {
        const botService = yield* BotService;

        yield* botService.createBot(bot);
        yield* botService.upsertBotToken(initialToken);

        return yield* botService.upsertBotToken(refreshedToken);
      }).pipe(Effect.provide(botLayer));

      expect(storedToken).toEqual(
        new BotTokenRecord({
          accessToken: "access-token-2",
          botId: bot.id,
          createdAt: createdAt,
          expiresAt: "2026-04-05T00:00:00.000Z",
          id: BotTokenId.makeUnsafe(`token-${bot.id}`),
          platform: bot.platform,
          refreshToken: "refresh-token-2",
          scopes: ["chat:edit"],
          updatedAt: "2026-04-03T00:00:02.000Z",
        }),
      );
      expect(yield* loadStoredBotTokens(dbPath)).toEqual([
        {
          access_token: "access-token-2",
          bot_id: bot.id,
          created_at: createdAt,
          expires_at: "2026-04-05T00:00:00.000Z",
          platform: bot.platform,
          refresh_token: "refresh-token-2",
          scopes: JSON.stringify(["chat:edit"]),
          updated_at: "2026-04-03T00:00:02.000Z",
        },
      ]);
    }),
  );

  it.effect("prefers the token matching the bot platform when multiple tokens exist", () =>
    Effect.gen(function* prefersTheTokenMatchingTheBotPlatformWhenMultipleTokensExist() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const bot = makeTestBot();
      const staleKickToken = makeTestToken(bot, {
        accessToken: "kick-access-token",
        expiresAt: "2026-04-05T00:00:00.000Z",
        id: BotTokenId.makeUnsafe("token-kick"),
        platform: "kick",
        refreshToken: "kick-refresh-token",
        scopes: ["chat:write"],
        updatedAt: "2026-04-03T00:00:01.000Z",
      });
      const currentTwitchToken = makeTestToken(bot, {
        accessToken: "twitch-access-token",
        expiresAt: "2026-04-06T00:00:00.000Z",
        id: BotTokenId.makeUnsafe("token-twitch"),
        platform: "twitch",
        refreshToken: "twitch-refresh-token",
        scopes: ["chat:read", "chat:edit"],
        updatedAt: "2026-04-03T00:00:02.000Z",
      });

      const resolved = yield* Effect.gen(function* exercisePlatformScopedTokenLookup() {
        const botService = yield* BotService;

        yield* botService.createBot(bot);
        yield* botService.upsertBotToken(staleKickToken);
        yield* botService.upsertBotToken(currentTwitchToken);

        return {
          authEntries: yield* botService.listBotsWithAuthStatus("2026-04-03T12:00:00.000Z"),
          token: yield* botService.getBotToken(bot.id),
        };
      }).pipe(Effect.provide(botLayer));

      expect(resolved.token).toEqual(currentTwitchToken);
      expect(resolved.authEntries).toEqual([
        {
          auth: new BotAuthStatusRecord({
            botId: bot.id,
            expiresAt: "2026-04-06T00:00:00.000Z",
            platform: "twitch",
            scopes: ["chat:read", "chat:edit"],
            status: "valid",
            updatedAt: "2026-04-03T00:00:02.000Z",
          }),
          bot,
          token: currentTwitchToken,
        },
      ]);
    }),
  );

  it.effect("lists valid, expired, and missing bot auth statuses", () =>
    Effect.gen(function* listsValidExpiredAndMissingBotAuthStatuses() {
      const dbPath = yield* createDatabasePath;
      const botLayer = BotServiceLive.pipe(Layer.provide(makeDatabaseLayer(dbPath)));
      const validBot = makeTestBot();
      const expiredBot = new BotRecord({
        createdAt,
        description: "Pixel is neon and brief.",
        displayName: "Expired Pixel",
        enabled: true,
        exampleMessages: ["expired ping"],
        fallbackModels: ["openai/gpt-4o-mini"],
        firstMessage: "expired hello",
        id: BotId.makeUnsafe("bot-expired"),
        maxTokens: 128,
        model: "openai/gpt-4o-mini",
        name: "expired_bot",
        personality: "Sarcastic but focused.",
        platform: "twitch",
        postHistoryPrompt: "Stay sharp.",
        responseLength: {
          max: 12,
          min: 4,
        },
        systemPrompt: null,
        talkativeness: 42,
        temperature: 0.8,
        updatedAt,
        vocabularyRules: ["avoid emojis"],
      });
      const missingBot = new BotRecord({
        createdAt,
        description: "Pixel is neon and brief.",
        displayName: "Missing Pixel",
        enabled: true,
        exampleMessages: ["missing ping"],
        fallbackModels: ["openai/gpt-4o-mini"],
        firstMessage: "missing hello",
        id: BotId.makeUnsafe("bot-missing"),
        maxTokens: 128,
        model: "openai/gpt-4o-mini",
        name: "missing_bot",
        personality: "Sarcastic but focused.",
        platform: "twitch",
        postHistoryPrompt: "Stay sharp.",
        responseLength: {
          max: 12,
          min: 4,
        },
        systemPrompt: null,
        talkativeness: 42,
        temperature: 0.8,
        updatedAt,
        vocabularyRules: ["avoid emojis"],
      });

      const statuses = yield* Effect.gen(function* exerciseBotAuthStatuses() {
        const botService = yield* BotService;

        yield* botService.createBot(validBot);
        yield* botService.createBot(expiredBot);
        yield* botService.createBot(missingBot);
        yield* botService.upsertBotToken(makeTestToken(validBot));
        yield* botService.upsertBotToken(
          makeTestToken(expiredBot, {
            accessToken: "expired-access-token",
            botId: expiredBot.id,
            expiresAt: "2026-04-02T00:00:00.000Z",
            id: BotTokenId.makeUnsafe("token-expired"),
            refreshToken: "expired-refresh-token",
          }),
        );

        return yield* botService.listBotsWithAuthStatus("2026-04-03T00:00:00.000Z");
      }).pipe(Effect.provide(botLayer));

      expect(statuses).toEqual([
        {
          auth: new BotAuthStatusRecord({
            botId: expiredBot.id,
            expiresAt: "2026-04-02T00:00:00.000Z",
            platform: "twitch",
            scopes: ["chat:read", "chat:edit"],
            status: "expired",
            updatedAt,
          }),
          bot: expiredBot,
          token: makeTestToken(expiredBot, {
            accessToken: "expired-access-token",
            botId: expiredBot.id,
            expiresAt: "2026-04-02T00:00:00.000Z",
            id: BotTokenId.makeUnsafe("token-expired"),
            refreshToken: "expired-refresh-token",
          }),
        },
        {
          auth: new BotAuthStatusRecord({
            botId: missingBot.id,
            expiresAt: null,
            platform: "twitch",
            scopes: [],
            status: "missing",
            updatedAt: null,
          }),
          bot: missingBot,
          token: null,
        },
        {
          auth: new BotAuthStatusRecord({
            botId: validBot.id,
            expiresAt: "2026-04-04T00:00:00.000Z",
            platform: "twitch",
            scopes: ["chat:read", "chat:edit"],
            status: "valid",
            updatedAt,
          }),
          bot: validBot,
          token: makeTestToken(validBot),
        },
      ]);
    }),
  );
});
