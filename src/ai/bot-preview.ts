import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

import type { BotRecord } from "../bots/bot-record";
import { buildBotPromptMessages, buildGenerationSettings } from "./prompt-assembly";
import { AiModelName, BotName } from "./Services/ai-client";
import type { AiGenerateRequest } from "./Services/ai-client";

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
  messages: buildBotPromptMessages(bot, bot.platform, {
    finalUserPrompt: input.prompt,
  }),
  model: AiModelName.makeUnsafe(bot.model),
  settings: buildGenerationSettings(bot),
});
