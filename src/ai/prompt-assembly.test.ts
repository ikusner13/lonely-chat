import { describe, expect, it } from "@effect/vitest";

import { BotMemoryId, BotMemoryRecord } from "../bots/bot-memory-record";
import { BotId, BotRecord } from "../bots/bot-record";
import { SessionId } from "../sessions/Services/session-service";
import { buildBotPromptMessages } from "./prompt-assembly";

const makeTestBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "Dry speedrun analyst with zero patience for fake hype.",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["clip it", "that split is cursed"],
    fallbackModels: ["openai/gpt-4.1-mini"],
    firstMessage: null,
    id: BotId.makeUnsafe("bot-pixel"),
    maxTokens: 160,
    model: "openai/gpt-5-mini",
    name: "pixel_bot",
    personality: "Fast, dry, and allergic to momentum speeches.",
    platform: "twitch",
    postHistoryPrompt: "Stay clipped and in character.",
    responseLength: {
      max: 10,
      min: 3,
    },
    systemPrompt: null,
    talkativeness: 65,
    temperature: 0.7,
    updatedAt: "2026-04-03T00:00:00.000Z",
    vocabularyRules: ["Never use emojis."],
    ...overrides,
  });

const makeBotMemory = (id: string, createdAt: string, summary: string): BotMemoryRecord =>
  new BotMemoryRecord({
    botId: BotId.makeUnsafe("bot-pixel"),
    createdAt,
    id: BotMemoryId.makeUnsafe(id),
    sessionId: SessionId.makeUnsafe(`session-${id}`),
    summary,
  });

describe("prompt assembly memories", () => {
  it("injects the three most recent memories before example messages", () => {
    const messages = buildBotPromptMessages(makeTestBot(), "mock", {
      botMemories: [
        makeBotMemory("memory-1", "2026-04-03T00:01:00.000Z", "Older memory."),
        makeBotMemory("memory-4", "2026-04-03T00:04:00.000Z", "Newest memory."),
        makeBotMemory("memory-2", "2026-04-03T00:02:00.000Z", "Second memory."),
        makeBotMemory("memory-3", "2026-04-03T00:03:00.000Z", "Third memory."),
      ],
    });

    expect(messages).toEqual([
      {
        content: `You are pixel_bot. You are chatting in a live stream chat on mock.

Fast, dry, and allergic to momentum speeches.

Dry speedrun analyst with zero patience for fake hype.

RULES:
- Keep responses between 3 and 10 words
- DO NOT include your name or any prefix in messages
- DO NOT use action tags like *action*
- DO NOT continue or respond as other chatters
- Just write your direct response
- NEVER: Never use emojis.

Stay clipped and in character.`,
        role: "system",
      },
      {
        content: [
          "THINGS YOU REMEMBER FROM PAST SESSIONS:",
          "- Newest memory.",
          "- Third memory.",
          "- Second memory.",
        ].join("\n"),
        role: "system",
      },
      {
        content: "[example] pixel_bot: clip it",
        role: "assistant",
      },
      {
        content: "[example] pixel_bot: that split is cursed",
        role: "assistant",
      },
    ]);
  });
});
