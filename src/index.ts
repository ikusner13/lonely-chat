import * as Effect from "effect/Effect";

import { getDatabasePath, initializeDatabase } from "./db/database";
import { app } from "./app";

const defaultPort = 3000;
const port = Number(Bun.env["PORT"] ?? defaultPort);

if (import.meta.main) {
  await Effect.runPromise(initializeDatabase(getDatabasePath()));

  Bun.serve({
    fetch: app.fetch,
    port,
  });
}
