import { describe, expect, it } from "@effect/vitest";

import { parseBotEditorFields } from "./bot-editor-fields";

describe("bot editor fields", () => {
  it("parses valid advanced bot fields", () => {
    const result = parseBotEditorFields({
      description: "  Deadpan tournament analyst.  ",
      displayName: "  Pixel  ",
      enabled: true,
      exampleMessages: "  clip it  \nthat split is cursed\nchat is farming resets",
      fallbackModels: " openai/gpt-4.1-mini \nanthropic/claude-3.7-sonnet ",
      firstMessage: "  loading in  ",
      maxTokens: " 120 ",
      model: "  openai/gpt-5-mini  ",
      name: "  pixel_bot  ",
      personality: "  Dry, fast, and allergic to hype.  ",
      platform: "twitch",
      postHistoryPrompt: "  Stay in character.  ",
      responseLengthMax: " 9 ",
      responseLengthMin: " 3 ",
      systemPrompt: "",
      talkativeness: "65",
      temperature: " 0.8 ",
      vocabularyRules: " Never use emojis. \nNever say gg easy ",
    });

    expect(result.editorFields).not.toBeNull();
    expect(result.values).toEqual({
      description: "Deadpan tournament analyst.",
      displayName: "Pixel",
      enabled: true,
      exampleMessages: "clip it\nthat split is cursed\nchat is farming resets",
      fallbackModels: "openai/gpt-4.1-mini\nanthropic/claude-3.7-sonnet",
      firstMessage: "loading in",
      maxTokens: "120",
      model: "openai/gpt-5-mini",
      name: "pixel_bot",
      personality: "Dry, fast, and allergic to hype.",
      platform: "twitch",
      postHistoryPrompt: "Stay in character.",
      responseLengthMax: "9",
      responseLengthMin: "3",
      systemPrompt: "",
      talkativeness: "65",
      temperature: "0.8",
      vocabularyRules: "Never use emojis.\nNever say gg easy",
    });
  });

  it("returns field errors for invalid advanced bot fields", () => {
    const result = parseBotEditorFields({
      description: " ",
      displayName: "",
      enabled: false,
      exampleMessages: "one\ntwo",
      fallbackModels: "",
      firstMessage: "",
      maxTokens: "0",
      model: "",
      name: "   ",
      personality: "",
      platform: "youtube",
      postHistoryPrompt: "",
      responseLengthMax: "2",
      responseLengthMin: "5",
      systemPrompt: "",
      talkativeness: "101",
      temperature: "3",
      vocabularyRules: "",
    });

    expect(result.editorFields).toBeNull();
    expect(result.errors).toEqual({
      description: "Description is required.",
      displayName: "Display name is required.",
      exampleMessages: "Example messages must include 3 to 5 entries.",
      maxTokens: "Max tokens must be a positive integer.",
      model: "Model is required.",
      name: "Name is required.",
      personality: "Personality is required.",
      platform: "Platform must be twitch or kick.",
      responseLengthMax: "Maximum response length must be greater than or equal to minimum.",
      talkativeness: "Talkativeness must be an integer between 0 and 100.",
      temperature: "Temperature must be a number between 0 and 2.",
    });
  });
});
