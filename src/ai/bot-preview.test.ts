import { describe, expect, it } from "@effect/vitest";

import { BotId, BotRecord } from "../bots/bot-record";
import { makeBotPreviewRequest, parseBotPreviewInput } from "./bot-preview";

const makeTestBot = (overrides?: Partial<BotRecord>): BotRecord =>
  new BotRecord({
    createdAt: "2026-04-03T00:00:00.000Z",
    description: "Dry speedrun analyst with zero patience for fake hype.",
    displayName: "Pixel",
    enabled: true,
    exampleMessages: ["clip it", "that split is cursed", "chat is farming resets"],
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
    vocabularyRules: ["Never use emojis.", "Never say gg easy."],
    ...overrides,
  });

const getParsedPreviewInput = (prompt: string) => {
  const parsedInput = parseBotPreviewInput(prompt);

  expect(parsedInput.input).not.toBeNull();

  if (parsedInput.input === null) {
    throw new Error("Expected preview input to parse.");
  }

  return parsedInput.input;
};

describe("bot preview prompt assembly", () => {
  it("assembles preview prompts from structured bot fields", () => {
    const request = makeBotPreviewRequest(
      makeTestBot(),
      getParsedPreviewInput("  what happened to that split?  "),
    );

    expect(request).toEqual({
      botName: "Pixel",
      messages: [
        {
          content: `You are pixel_bot. You are chatting in a live stream chat on twitch.

Fast, dry, and allergic to momentum speeches.

Dry speedrun analyst with zero patience for fake hype.

RULES:
- Keep responses between 3 and 10 words
- DO NOT include your name or any prefix in messages
- DO NOT use action tags like *action*
- DO NOT continue or respond as other chatters
- Just write your direct response
- NEVER: Never use emojis.
- NEVER: Never say gg easy.

Stay clipped and in character.`,
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
        {
          content: "[example] pixel_bot: chat is farming resets",
          role: "assistant",
        },
        {
          content: "what happened to that split?",
          role: "user",
        },
      ],
      model: "openai/gpt-5-mini",
    });
  });

  it("uses the system prompt override verbatim when present", () => {
    const request = makeBotPreviewRequest(
      makeTestBot({
        systemPrompt: "You are Pixel. Stay clipped.",
      }),
      getParsedPreviewInput("say something"),
    );

    expect(request.messages[0]).toEqual({
      content: "You are Pixel. Stay clipped.",
      role: "system",
    });
    expect(request.messages[1]).toEqual({
      content: "[example] pixel_bot: clip it",
      role: "assistant",
    });
    expect(request.messages.at(-1)).toEqual({
      content: "say something",
      role: "user",
    });
  });
});
