import * as Schema from "effect/Schema";

import { BotId } from "../bots/bot-record";

const safeIntegerMaximum = Number.MAX_SAFE_INTEGER;

const NonNegativeInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({
    maximum: safeIntegerMaximum,
    minimum: 0,
  }),
);

export const ScenarioId = Schema.String.pipe(Schema.brand("ScenarioId"));
export type ScenarioId = typeof ScenarioId.Type;

export const ScenarioTriggerType = Schema.Literals(["manual", "timed", "on_event"]);
export type ScenarioTriggerType = typeof ScenarioTriggerType.Type;

export const ScenarioStepAction = Schema.Literals(["say", "respond", "wait"]);
export type ScenarioStepAction = typeof ScenarioStepAction.Type;

export class ScenarioTriggerConfig extends Schema.Class<ScenarioTriggerConfig>(
  "ScenarioTriggerConfig",
)({
  delaySeconds: Schema.NullOr(NonNegativeInteger),
  eventType: Schema.NullOr(Schema.NonEmptyString),
}) {}

export class ScenarioStep extends Schema.Class<ScenarioStep>("ScenarioStep")({
  action: ScenarioStepAction,
  botId: BotId,
  content: Schema.NullOr(Schema.NonEmptyString),
  delayAfter: NonNegativeInteger,
}) {}

export class ScenarioRecord extends Schema.Class<ScenarioRecord>("ScenarioRecord")({
  createdAt: Schema.String,
  description: Schema.String,
  durationSeconds: Schema.NullOr(NonNegativeInteger),
  enabled: Schema.Boolean,
  id: ScenarioId,
  name: Schema.String,
  participants: Schema.Array(BotId),
  steps: Schema.Array(ScenarioStep),
  topic: Schema.String,
  triggerConfig: ScenarioTriggerConfig,
  triggerType: ScenarioTriggerType,
  updatedAt: Schema.String,
}) {}
