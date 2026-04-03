import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { describe, expect, it } from "@effect/vitest";
import { initializeDatabase, makeDatabaseLayer } from "./database";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const channelSettingKey = "channel";
const createSettingsMigrationId = 1;
const createSettingsMigrationName = "create_settings";
const updatedAt = "2026-04-02T00:00:00.000Z";

interface TableRow {
  readonly name: string;
}

interface MigrationRow {
  readonly migration_id: number;
  readonly name: string;
}

interface SettingsRow {
  readonly key: string;
  readonly updated_at: string;
  readonly value: string;
}

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-db-"));

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

const loadMigratedTables = (dbPath: string): Effect.Effect<readonly TableRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryMigratedTables() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<TableRow>`SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('settings', 'effect_sql_migrations')
        ORDER BY name`;
    }),
  );

const loadExecutedMigrations = (dbPath: string): Effect.Effect<readonly MigrationRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryExecutedMigrations() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<MigrationRow>`SELECT migration_id, name
        FROM effect_sql_migrations
        ORDER BY migration_id`;
    }),
  );

const insertChannelSetting = (dbPath: string): Effect.Effect<void, unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* insertStoredChannelSetting() {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`INSERT INTO settings (key, value, updated_at)
        VALUES (${channelSettingKey}, ${JSON.stringify("lonely-chat")}, ${updatedAt})`;
    }),
  );

const loadChannelSetting = (dbPath: string): Effect.Effect<readonly SettingsRow[], unknown> =>
  runWithDatabase(
    dbPath,
    Effect.gen(function* queryChannelSetting() {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql<SettingsRow>`SELECT key, value, updated_at
        FROM settings
        WHERE key = ${channelSettingKey}`;
    }),
  );

describe("database runtime", () => {
  it.effect("boots the sqlite layer and runs migrations once", () =>
    Effect.gen(function* bootsDatabaseLayerAndRunsMigrations() {
      const dbPath = yield* createDatabasePath;

      yield* initializeDatabase(dbPath);
      yield* initializeDatabase(dbPath);

      const tables = yield* loadMigratedTables(dbPath);
      const migrations = yield* loadExecutedMigrations(dbPath);

      expect(tables).toEqual([{ name: "effect_sql_migrations" }, { name: "settings" }]);
      expect(migrations).toEqual([
        {
          migration_id: createSettingsMigrationId,
          name: createSettingsMigrationName,
        },
      ]);
    }),
  );

  it.effect("supports a simple settings read and write", () =>
    Effect.gen(function* supportsSimpleSettingsReadAndWrite() {
      const dbPath = yield* createDatabasePath;

      yield* initializeDatabase(dbPath);
      yield* insertChannelSetting(dbPath);
      const rows = yield* loadChannelSetting(dbPath);

      expect(rows).toEqual([
        {
          key: channelSettingKey,
          updated_at: updatedAt,
          value: JSON.stringify("lonely-chat"),
        },
      ]);
    }),
  );
});
