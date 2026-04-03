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

export interface AiGenerateRequest {
  readonly botName: BotName;
  readonly messages: readonly AiPromptMessage[];
  readonly model: AiModelName;
}

export interface AiGenerateResponse {
  readonly model: AiModelName;
  readonly text: string;
}

export interface AiClientShape {
  readonly generateText: (
    request: AiGenerateRequest,
  ) => Effect.Effect<AiGenerateResponse, AiGenerationError>;
}

export class AiClient extends ServiceMap.Service<AiClient, AiClientShape>()(
  "lonely-chat/ai/Services/AiClient",
) {}
