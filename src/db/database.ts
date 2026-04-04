import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";

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

const resolveDatabasePath = Config.string("DATABASE_PATH").pipe(
  Config.orElse(() => Config.succeed(defaultDatabasePath)),
);

export const makeDatabaseLayer = (
  dbPath?: string,
): Layer.Layer<SqlClient.SqlClient | SqliteClient.SqliteClient, unknown> =>
  Layer.unwrap(
    Effect.gen(function* buildDatabaseLayer() {
      const resolvedPath = dbPath ?? (yield* resolveDatabasePath);

      if (resolvedPath !== ":memory:") {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        yield* fileSystem.makeDirectory(path.dirname(resolvedPath), {
          recursive: true,
        });
      }

      return Layer.provideMerge(DatabaseSetupLive, SqliteClient.layer({ filename: resolvedPath }));
    }).pipe(Effect.provide([NodeFileSystem.layer, NodePath.layer])),
  );

export const initializeDatabase = (dbPath?: string): Effect.Effect<void, unknown> =>
  Effect.scoped(
    Effect.gen(function* bootDatabase() {
      const sql = yield* SqlClient.SqlClient;

      yield* sql`SELECT ${databaseHealthCheck}`;
    }).pipe(Effect.provide(makeDatabaseLayer(dbPath))),
  );
