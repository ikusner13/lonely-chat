import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqliteMigrator from "@effect/sql-sqlite-bun/SqliteMigrator";

const createSettingsMigrationId = 1;
const createSessionsMigrationId = 2;
const createBotsMigrationId = 3;
const createSessionMessagesMigrationId = 4;
const createScenariosMigrationId = 5;

const createSettingsTable = Effect.gen(function* createSettingsTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
});

const createSessionsTable = Effect.gen(function* createSessionsTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    platform TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    end_reason TEXT,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_tokens_used INTEGER NOT NULL DEFAULT 0,
    total_cost_usd REAL NOT NULL DEFAULT 0,
    time_limit_seconds INTEGER,
    cost_limit_usd REAL
  )`;
});

const createBotsTable = Effect.gen(function* createBotsTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    model TEXT NOT NULL,
    fallback_models TEXT NOT NULL,
    temperature REAL NOT NULL,
    max_tokens INTEGER NOT NULL,
    personality TEXT NOT NULL,
    description TEXT NOT NULL,
    example_messages TEXT NOT NULL,
    first_message TEXT,
    post_history_prompt TEXT,
    vocabulary_rules TEXT NOT NULL,
    response_length_min INTEGER NOT NULL,
    response_length_max INTEGER NOT NULL,
    talkativeness INTEGER NOT NULL,
    system_prompt TEXT,
    enabled INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
});

const createSessionMessagesTable = Effect.gen(function* createSessionMessagesTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS session_messages (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    bot_id TEXT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    platform TEXT NOT NULL,
    is_bot INTEGER NOT NULL,
    tokens_used INTEGER,
    model_used TEXT,
    sent_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (bot_id) REFERENCES bots(id)
  )`;
});

const createScenariosTable = Effect.gen(function* createScenariosTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    topic TEXT NOT NULL,
    participants TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_config TEXT NOT NULL,
    steps TEXT NOT NULL,
    duration_seconds INTEGER,
    enabled INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
});

const migrationEntries = [
  [createSettingsMigrationId, "create_settings", createSettingsTable],
  [createSessionsMigrationId, "create_sessions", createSessionsTable],
  [createBotsMigrationId, "create_bots", createBotsTable],
  [createSessionMessagesMigrationId, "create_session_messages", createSessionMessagesTable],
  [createScenariosMigrationId, "create_scenarios", createScenariosTable],
] as const;

export const makeMigrationLoader = (): ReturnType<typeof SqliteMigrator.fromRecord> =>
  SqliteMigrator.fromRecord(
    Object.fromEntries(
      migrationEntries.map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

export const runMigrations = Effect.fn("Db.runMigrations")(function* runMigrations() {
  return yield* SqliteMigrator.run({ loader: makeMigrationLoader() });
});

export const MigrationsLive = Layer.effectDiscard(runMigrations());
