import { Schema } from "effect";

export const BotId = Schema.String.pipe(Schema.brand("BotId"));
export type BotId = typeof BotId.Type;

export const BotPlatform = Schema.Literals(["twitch", "kick"]);
export type BotPlatform = typeof BotPlatform.Type;

const ResponseLength = Schema.Struct({
  max: Schema.Number,
  min: Schema.Number,
});

export class BotRecord extends Schema.Class("BotRecord")({
  createdAt: Schema.String,
  description: Schema.String,
  displayName: Schema.String,
  enabled: Schema.Boolean,
  exampleMessages: Schema.Array(Schema.String),
  fallbackModels: Schema.Array(Schema.String),
  firstMessage: Schema.NullOr(Schema.String),
  id: BotId,
  maxTokens: Schema.Number,
  model: Schema.String,
  name: Schema.String,
  personality: Schema.String,
  platform: BotPlatform,
  postHistoryPrompt: Schema.NullOr(Schema.String),
  responseLength: ResponseLength,
  systemPrompt: Schema.NullOr(Schema.String),
  talkativeness: Schema.Number,
  temperature: Schema.Number,
  updatedAt: Schema.String,
  vocabularyRules: Schema.Array(Schema.String),
}) {}
