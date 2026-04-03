import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqliteMigrator from "@effect/sql-sqlite-bun/SqliteMigrator";

const createSettingsMigrationId = 1;
const createSessionsMigrationId = 2;

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

const migrationEntries = [
  [createSettingsMigrationId, "create_settings", createSettingsTable],
  [createSessionsMigrationId, "create_sessions", createSessionsTable],
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
