import { app } from "./app";

const defaultPort = 3000;
const port = Number(Bun.env["PORT"] ?? defaultPort);

if (import.meta.main) {
  Bun.serve({
    fetch: app.fetch,
    port,
  });
}
