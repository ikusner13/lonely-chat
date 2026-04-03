import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";

import { MigrationsLive } from "./migrations";

const defaultDatabasePath = "./.data/lonely-chat.sqlite";
const databaseHealthCheck = 1;

const DatabaseSetupLive = Layer.effectDiscard(
  Effect.gen(function* DatabaseSetupLive() {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`PRAGMA foreign_keys = ON`;
    yield* sql`PRAGMA journal_mode = WAL`;
  }),
).pipe(Layer.provideMerge(MigrationsLive));

export const getDatabasePath = (): string => Bun.env["DATABASE_PATH"] ?? defaultDatabasePath;

export const makeDatabaseLayer = (
  dbPath: string,
): Layer.Layer<SqlClient.SqlClient | SqliteClient.SqliteClient, unknown> =>
  Layer.unwrap(
    Effect.gen(function* buildDatabaseLayer() {
      if (dbPath !== ":memory:") {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fileSystem.makeDirectory(path.dirname(dbPath), {
          recursive: true,
        });
      }

      return Layer.provideMerge(DatabaseSetupLive, SqliteClient.layer({ filename: dbPath }));
    }).pipe(Effect.provide([BunFileSystem.layer, BunPath.layer])),
  );

export const initializeDatabase = (dbPath: string): Effect.Effect<void, unknown> =>
  Effect.scoped(
    Effect.gen(function* bootDatabase() {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`SELECT ${databaseHealthCheck}`;
    }).pipe(Effect.provide(makeDatabaseLayer(dbPath))),
  );
