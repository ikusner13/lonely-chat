import { describe, expect, it } from "@effect/vitest";

import { BotId, BotRecord } from "../bots/bot-record";
import { selectSingleMentionedBot } from "./mention-response";

const makeBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "test bot",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: [],
    fallbackModels: [],
    firstMessage: null,
    id: BotId.makeUnsafe("bot-pixel"),
    maxTokens: 120,
    model: "openrouter/mock-model",
    name: "pixel",
    personality: "dry humor",
    platform: "twitch",
    postHistoryPrompt: null,
    responseLength: {
      max: 12,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 60,
    temperature: 0.8,
    updatedAt: "2026-04-03T00:00:00.000Z",
    vocabularyRules: [],
    ...overrides,
  });

describe("mention response selection", () => {
  it("selects one enabled bot for an exact case-insensitive mention", () => {
    const pixel = makeBot();

    expect(selectSingleMentionedBot("hey @PiXeL, lock in", [pixel])).toEqual(pixel);
  });

  it("does not treat partial or multiple mentions as a single-bot trigger", () => {
    const pixel = makeBot();
    const echo = makeBot({
      displayName: "Echo",
      id: BotId.makeUnsafe("bot-echo"),
      name: "echo",
    });

    expect(selectSingleMentionedBot("hey @pixelated", [pixel])).toBeNull();
    expect(selectSingleMentionedBot("hey @pixel and @echo", [pixel, echo])).toBeNull();
  });

  it("ignores disabled bots", () => {
    const pixel = makeBot({
      enabled: false,
    });

    expect(selectSingleMentionedBot("hey @pixel", [pixel])).toBeNull();
  });
});
