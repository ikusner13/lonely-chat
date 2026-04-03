import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqliteMigrator from "@effect/sql-sqlite-bun/SqliteMigrator";

const createSettingsMigrationId = 1;

const createSettingsTable = Effect.gen(function* createSettingsTable() {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;
});

const migrationEntries = [
  [createSettingsMigrationId, "create_settings", createSettingsTable],
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
