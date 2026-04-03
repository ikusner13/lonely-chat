import * as Effect from "effect/Effect";

import { getDatabasePath, initializeDatabase } from "./db/database";
import { app, appRuntime } from "./app";

const defaultPort = 3000;
const port = Number(Bun.env["PORT"] ?? defaultPort);

const shutdown = () => {
  void appRuntime.dispose();
};

if (import.meta.main) {
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await Effect.runPromise(initializeDatabase(getDatabasePath()));

  Bun.serve({
    fetch: app.fetch,
    port,
  });
}
