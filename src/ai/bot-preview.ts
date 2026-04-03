import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

import type { BotRecord } from "../bots/bot-record";
import { AiModelName, BotName } from "./Services/ai-client";
import type { AiGenerateRequest, AiPromptMessage } from "./Services/ai-client";

export class BotPreviewInput extends Schema.Class("BotPreviewInput")({
  prompt: Schema.NonEmptyString,
}) {}

export interface ParsedBotPreviewInput {
  readonly error?: string;
  readonly input: BotPreviewInput | null;
  readonly value: string;
}

export class BotPreviewApiResponse extends Schema.Class("BotPreviewApiResponse")({
  model: Schema.String,
  prompt: Schema.String,
  response: Schema.String,
}) {}

const decodeBotPreviewRequestBody = Schema.decodeUnknownResult(
  Schema.Struct({
    prompt: Schema.String,
  }),
);

const decodeNonEmptyPreviewPrompt = Schema.decodeUnknownResult(Schema.NonEmptyString);

const trimPreviewPrompt = (value: string): string => value.trim();

const buildStructuredSystemPrompt = (bot: BotRecord): string => {
  const vocabularyRules = bot.vocabularyRules.map((rule) => `- NEVER: ${rule}`);
  const promptLines = [
    `You are ${bot.name}. You are chatting in a live stream chat on ${bot.platform}.`,
    "",
    bot.personality,
    "",
    bot.description,
    "",
    "RULES:",
    `- Keep responses between ${bot.responseLength.min} and ${bot.responseLength.max} words`,
    "- DO NOT include your name or any prefix in messages",
    "- DO NOT use action tags like *action*",
    "- DO NOT continue or respond as other chatters",
    "- Just write your direct response",
    ...vocabularyRules,
  ];

  if (bot.postHistoryPrompt !== null) {
    promptLines.push("", bot.postHistoryPrompt);
  }

  return promptLines.join("\n");
};

const buildSystemPrompt = (bot: BotRecord): string =>
  bot.systemPrompt ?? buildStructuredSystemPrompt(bot);

const buildExampleMessages = (bot: BotRecord): readonly AiPromptMessage[] =>
  bot.exampleMessages.map((message) => ({
    content: `[example] ${bot.name}: ${message}`,
    role: "assistant",
  }));

export const parseBotPreviewInput = (prompt: string): ParsedBotPreviewInput => {
  const normalizedPrompt = trimPreviewPrompt(prompt);
  const decodedPrompt = decodeNonEmptyPreviewPrompt(normalizedPrompt);

  if (Result.isSuccess(decodedPrompt)) {
    return {
      input: new BotPreviewInput({
        prompt: decodedPrompt.success,
      }),
      value: normalizedPrompt,
    };
  }

  return {
    error: "Preview prompt is required.",
    input: null,
    value: normalizedPrompt,
  };
};

export const parseBotPreviewRequestBody = (input: unknown): ParsedBotPreviewInput => {
  const request = decodeBotPreviewRequestBody(input);

  if (Result.isSuccess(request)) {
    return parseBotPreviewInput(request.success.prompt);
  }

  return parseBotPreviewInput("");
};

export const makeBotPreviewRequest = (
  bot: BotRecord,
  input: BotPreviewInput,
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: [
    {
      content: buildSystemPrompt(bot),
      role: "system",
    },
    ...buildExampleMessages(bot),
    {
      content: input.prompt,
      role: "user",
    },
  ],
  model: AiModelName.makeUnsafe(bot.model),
});
