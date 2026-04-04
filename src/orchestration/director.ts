import { Schema } from "effect";

import type { AiGenerateRequest, AiPromptMessage } from "../ai/Services/ai-client";
import { AiModelName, BotName } from "../ai/Services/ai-client";
import type { BotRecord } from "../bots/bot-record";
import type { PlatformName } from "../platforms/Services/platform-adapter";
import type { SessionMessageRecord } from "../sessions/session-message-record";
import { buildChatHistoryMessages } from "../ai/prompt-assembly";

const directorMessageThreshold = 15;
const directorTimeThresholdMs = 2 * 60 * 1000;
const directorModel = AiModelName.makeUnsafe("openrouter/director-model");

export const DirectorVibe = Schema.Literals([
  "high_energy",
  "low_energy",
  "argumentative",
  "friendly",
  "stale",
]);
export type DirectorVibe = typeof DirectorVibe.Type;

export class DirectorEvaluation extends Schema.Class("DirectorEvaluation")({
  nudgeBot: Schema.NullOr(Schema.String),
  nudgeReason: Schema.NullOr(Schema.String),
  suggestedTopic: Schema.NullOr(Schema.String),
  topicShift: Schema.Boolean,
  vibe: DirectorVibe,
}) {}

export class DirectorDirective extends Schema.Class("DirectorDirective")({
  hint: Schema.NullOr(Schema.String),
  nudgedBotName: Schema.NullOr(Schema.String),
  talkativenessBoostPercent: Schema.Number,
}) {}

export interface DirectorTriggerState {
  readonly lastEvaluatedAt: number | null;
  readonly messagesSinceLastEvaluation: number;
  readonly now: number;
  readonly scenarioInjectionRequested?: boolean;
}

const DirectorEvaluationJson = Schema.Struct(DirectorEvaluation.fields);
const decodeDirectorEvaluationJson = Schema.decodeSync(
  Schema.fromJsonString(DirectorEvaluationJson),
);

const normalizeOptionalText = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length === 0 ? null : normalizedValue;
};

const makeDirectorSystemPrompt = (): string =>
  [
    "You are a conversation director.",
    "Analyze the chat log and output only valid JSON.",
    'Use this exact shape: {"topicShift":boolean,"suggestedTopic":string|null,"vibe":"high_energy"|"low_energy"|"argumentative"|"friendly"|"stale","nudgeBot":string|null,"nudgeReason":string|null}.',
    "Use null for any optional field you are not setting.",
  ].join("\n");

const makeDirectorRosterMessage = (bots: readonly BotRecord[]): AiPromptMessage => ({
  content: `Available bots: ${bots.map((bot) => bot.name).join(", ") || "none"}`,
  role: "user",
});

export const shouldEvaluateDirector = (state: DirectorTriggerState): boolean =>
  Boolean(state.scenarioInjectionRequested) ||
  state.messagesSinceLastEvaluation >= directorMessageThreshold ||
  (state.lastEvaluatedAt !== null && state.now - state.lastEvaluatedAt >= directorTimeThresholdMs);

export const decodeDirectorEvaluation = (value: string): DirectorEvaluation =>
  new DirectorEvaluation(decodeDirectorEvaluationJson(value));

export const makeDirectorDirective = (evaluation: DirectorEvaluation): DirectorDirective | null => {
  const suggestedTopic = normalizeOptionalText(evaluation.suggestedTopic);
  const nudgeBotName = normalizeOptionalText(evaluation.nudgeBot);
  const nudgeReason = normalizeOptionalText(evaluation.nudgeReason);
  const hintLines = [
    evaluation.vibe === "stale"
      ? "The conversation feels stale. Consider bringing up a new topic naturally."
      : null,
    evaluation.topicShift && suggestedTopic !== null
      ? `Consider steering the conversation toward: ${suggestedTopic}.`
      : null,
    `Current vibe: ${evaluation.vibe}.`,
    nudgeReason === null ? null : `Why now: ${nudgeReason}.`,
  ].filter((line): line is string => line !== null);

  if (hintLines.length === 0 && nudgeBotName === null && evaluation.vibe !== "stale") {
    return null;
  }

  return new DirectorDirective({
    hint: hintLines.length === 0 ? null : `[CONTEXT: ${hintLines.join(" ")}]`,
    nudgedBotName: nudgeBotName,
    talkativenessBoostPercent: evaluation.vibe === "stale" ? 20 : 0,
  });
};

export const makeDirectorEvaluationRequest = (
  bots: readonly BotRecord[],
  platform: PlatformName,
  recentMessages: readonly SessionMessageRecord[],
  activeScenarioTopic: string | null,
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe("Director"),
  messages: [
    {
      content: `${makeDirectorSystemPrompt()}\nPlatform: ${platform}.`,
      role: "system",
    },
    ...buildChatHistoryMessages(recentMessages),
    makeDirectorRosterMessage(bots),
    ...(activeScenarioTopic === null
      ? []
      : [
          {
            content: `Active scenario topic: ${activeScenarioTopic}`,
            role: "user" as const,
          },
        ]),
  ],
  model: directorModel,
});
