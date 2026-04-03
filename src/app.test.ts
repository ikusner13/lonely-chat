import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createApp, makeAppRuntime } from "./app";

const okStatus = 200;
const seeOtherStatus = 303;

const createDatabasePath = Effect.acquireRelease(
  Effect.promise(async () => {
    const directory = await mkdtemp(join(tmpdir(), "lonely-chat-app-"));

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

const createTestRuntime = (dbPath: string) =>
  Effect.acquireRelease(
    Effect.sync(() => makeAppRuntime(dbPath)),
    (runtime) =>
      Effect.promise(async () => {
        await runtime.dispose();
      }).pipe(Effect.orDie),
  );

const requestApp = (
  app: ReturnType<typeof createApp>,
  url: string,
  init?: RequestInit,
): Effect.Effect<Response> =>
  Effect.promise(async () => {
    const response = await app.request(url, init);

    return response;
  });

describe("app shell", () => {
  it.effect("serves a health endpoint", () =>
    Effect.gen(function* servesHealthEndpoint() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);
      const response = yield* requestApp(app, "http://localhost/health");

      expect(response.status).toBe(okStatus);
      expect(
        yield* Effect.promise(async () => {
          const body = await response.json();

          return body;
        }),
      ).toEqual({
        status: "ok",
      });
    }),
  );

  it.effect("starts and stops a mock session from the dashboard", () =>
    Effect.gen(function* startsAndStopsAMockSessionFromTheDashboard() {
      const dbPath = yield* createDatabasePath;
      const runtime = yield* createTestRuntime(dbPath);
      const app = createApp(runtime);

      let response = yield* requestApp(app, "http://localhost/");
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Lonely Chat");
      expect(body).toContain("Status: idle");
      expect(body).toContain("Start Session");

      response = yield* requestApp(app, "http://localhost/session/start", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const activeBody = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(activeBody).toContain("Status: active");
      expect(activeBody).toContain("Platform: mock");
      expect(activeBody).toContain("Channel: lonely-chat");
      expect(activeBody).toContain("Stop Session");

      response = yield* requestApp(app, "http://localhost/session/stop", {
        method: "POST",
      });

      expect(response.status).toBe(seeOtherStatus);

      response = yield* requestApp(app, "http://localhost/");
      const stoppedBody = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(stoppedBody).toContain("Status: idle");
      expect(stoppedBody).toContain("Last session ended: manual");
      expect(stoppedBody).toContain("Start Session");
    }),
  );
});
