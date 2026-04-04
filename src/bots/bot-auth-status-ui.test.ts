import { describe, expect, it } from "@effect/vitest";

import {
  getBotAuthStatusBadgeClass,
  getBotAuthStatusDetail,
  getBotAuthStatusLabel,
} from "./bot-auth-status-ui";
import { BotId } from "./bot-record";
import { BotAuthStatusRecord } from "./bot-token-record";

const makeAuthStatus = (
  status: "missing" | "expired" | "valid",
  expiresAt: string | null,
): BotAuthStatusRecord =>
  new BotAuthStatusRecord({
    botId: BotId.makeUnsafe("bot-pixel"),
    expiresAt,
    platform: "twitch",
    scopes: ["chat:read", "chat:edit"],
    status,
    updatedAt: "2026-04-03T00:00:00.000Z",
  });

describe("bot auth status ui", () => {
  it("renders valid auth metadata copy", () => {
    const auth = makeAuthStatus("valid", "2026-04-04T00:00:00.000Z");

    expect(getBotAuthStatusLabel(auth)).toBe("Valid");
    expect(getBotAuthStatusBadgeClass(auth)).toContain("text-green-400");
    expect(getBotAuthStatusDetail(auth)).toBe("Credential expires 2026-04-04T00:00:00.000Z.");
  });

  it("renders expired auth metadata copy", () => {
    const auth = makeAuthStatus("expired", "2026-04-02T00:00:00.000Z");

    expect(getBotAuthStatusLabel(auth)).toBe("Expired");
    expect(getBotAuthStatusBadgeClass(auth)).toContain("text-amber-300");
    expect(getBotAuthStatusDetail(auth)).toBe("Credential expired 2026-04-02T00:00:00.000Z.");
  });

  it("renders missing auth metadata copy", () => {
    const auth = makeAuthStatus("missing", null);

    expect(getBotAuthStatusLabel(auth)).toBe("Missing");
    expect(getBotAuthStatusBadgeClass(auth)).toContain("text-zinc-300");
    expect(getBotAuthStatusDetail(auth)).toBe("No credential metadata stored yet.");
  });
});
