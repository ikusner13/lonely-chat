import type { Effect } from "effect";
import { Schema, ServiceMap } from "effect";

import type { AiGenerationError } from "../ai-generation-error";

export const BotName = Schema.String.pipe(Schema.brand("BotName"));
export type BotName = typeof BotName.Type;

export const AiModelName = Schema.String.pipe(Schema.brand("AiModelName"));
export type AiModelName = typeof AiModelName.Type;

export type AiMessageRole = "system" | "user" | "assistant";

export interface AiPromptMessage {
  readonly role: AiMessageRole;
  readonly content: string;
}

export class AiGenerationSettings extends Schema.Class("AiGenerationSettings")({
  fallbackModels: Schema.Array(AiModelName),
  maxOutputTokens: Schema.Number,
  stopSequences: Schema.Array(Schema.String),
  temperature: Schema.Number,
}) {}

export interface AiGenerateRequest {
  readonly botName: BotName;
  readonly messages: readonly AiPromptMessage[];
  readonly model: AiModelName;
  readonly settings?: AiGenerationSettings;
}

export interface AiGenerateResponse {
  readonly costUsd: number;
  readonly model: AiModelName;
  readonly text: string;
  readonly tokensUsed: number;
}

export interface AiClientShape {
  readonly generateText: (
    request: AiGenerateRequest,
  ) => Effect.Effect<AiGenerateResponse, AiGenerationError>;
}

export class AiClient extends ServiceMap.Service<AiClient, AiClientShape>()(
  "lonely-chat/ai/Services/AiClient",
) {}
