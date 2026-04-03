import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { app } from "./app";

const okStatus = 200;

const requestApp = (url: string): Effect.Effect<Response> =>
  Effect.promise(async () => {
    const response = await app.request(url);

    return response;
  });

describe("app shell", () => {
  it.effect("serves a health endpoint", () =>
    Effect.gen(function* servesHealthEndpoint() {
      const response = yield* requestApp("http://localhost/health");

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

  it.effect("serves a placeholder dashboard", () =>
    Effect.gen(function* servesPlaceholderDashboard() {
      const response = yield* requestApp("http://localhost/");
      const body = yield* Effect.promise(async () => {
        const text = await response.text();

        return text;
      });

      expect(response.status).toBe(okStatus);
      expect(body).toContain("Lonely Chat");
      expect(body).toContain("Placeholder dashboard");
    }),
  );
});
