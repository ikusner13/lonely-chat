import { describe, expect, it } from "vitest";

import { app } from "./app";

const okStatus = 200;

describe("app shell", () => {
  it("serves a health endpoint", async () => {
    const response = await app.request("http://localhost/health");

    expect(response.status).toBe(okStatus);
    expect(await response.json()).toEqual({
      status: "ok",
    });
  });

  it("serves a placeholder dashboard", async () => {
    const response = await app.request("http://localhost/");
    const body = await response.text();

    expect(response.status).toBe(okStatus);
    expect(body).toContain("Lonely Chat");
    expect(body).toContain("Placeholder dashboard");
  });
});
