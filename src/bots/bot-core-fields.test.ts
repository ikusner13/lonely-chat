import { describe, expect, it } from "@effect/vitest";

import { parseBotCoreFields } from "./bot-core-fields";

describe("bot core fields", () => {
  it("parses valid core bot fields", () => {
    const result = parseBotCoreFields({
      displayName: "  Pixel  ",
      enabled: true,
      model: "  openai/gpt-5-mini  ",
      name: "  pixel_bot  ",
      platform: "twitch",
      talkativeness: "65",
    });

    expect(result.coreFields).not.toBeNull();
    expect(result.values).toEqual({
      displayName: "Pixel",
      enabled: true,
      model: "openai/gpt-5-mini",
      name: "pixel_bot",
      platform: "twitch",
      talkativeness: "65",
    });
  });

  it("returns field errors for invalid core bot fields", () => {
    const result = parseBotCoreFields({
      displayName: "",
      enabled: false,
      model: "",
      name: "   ",
      platform: "youtube",
      talkativeness: "101",
    });

    expect(result.coreFields).toBeNull();
    expect(result.errors).toEqual({
      displayName: "Display name is required.",
      model: "Model is required.",
      name: "Name is required.",
      platform: "Platform must be twitch or kick.",
      talkativeness: "Talkativeness must be an integer between 0 and 100.",
    });
  });
});
