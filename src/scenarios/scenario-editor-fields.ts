import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { BotId } from "../bots/bot-record";
import {
  ScenarioId,
  ScenarioRecord,
  ScenarioStep,
  ScenarioTriggerConfig,
  ScenarioTriggerType,
} from "./scenario-record";
import type { ScenarioTriggerType as ScenarioTriggerTypeValue } from "./scenario-record";

const defaultEnabled = true;
const defaultTriggerType = "manual";
const positiveIntegerMaximum = Number.MAX_SAFE_INTEGER;
const positiveIntegerMinimum = 1;
const stepJsonIndent = 2;

const PositiveInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({
    maximum: positiveIntegerMaximum,
    minimum: positiveIntegerMinimum,
  }),
);

export class ScenarioEditorFields extends Schema.Class<ScenarioEditorFields>(
  "ScenarioEditorFields",
)({
  description: Schema.NonEmptyString,
  durationSeconds: Schema.NullOr(PositiveInteger),
  enabled: Schema.Boolean,
  name: Schema.NonEmptyString,
  participants: Schema.Array(BotId),
  steps: Schema.Array(ScenarioStep),
  topic: Schema.NonEmptyString,
  triggerConfig: ScenarioTriggerConfig,
  triggerType: ScenarioTriggerType,
}) {}

export interface ScenarioEditorFormErrors {
  description?: string;
  durationSeconds?: string;
  name?: string;
  participants?: string;
  steps?: string;
  topic?: string;
  triggerDelaySeconds?: string;
  triggerEventType?: string;
  triggerType?: string;
}

export class ScenarioEditorFormValues extends Schema.Class<ScenarioEditorFormValues>(
  "ScenarioEditorFormValues",
)({
  description: Schema.String,
  durationSeconds: Schema.String,
  enabled: Schema.Boolean,
  name: Schema.String,
  participants: Schema.Array(Schema.String),
  steps: Schema.String,
  topic: Schema.String,
  triggerDelaySeconds: Schema.String,
  triggerEventType: Schema.String,
  triggerType: Schema.String,
}) {}

interface ParsedScenarioEditorFieldsFailure {
  readonly editorFields: null;
  readonly errors: ScenarioEditorFormErrors;
  readonly values: ScenarioEditorFormValues;
}

interface ParsedScenarioEditorFieldsSuccess {
  readonly editorFields: ScenarioEditorFields;
  readonly errors: ScenarioEditorFormErrors;
  readonly values: ScenarioEditorFormValues;
}

export type ParsedScenarioEditorFields =
  | ParsedScenarioEditorFieldsFailure
  | ParsedScenarioEditorFieldsSuccess;

const decodeNonEmptyString = Schema.decodeUnknownResult(Schema.NonEmptyString);
const decodePositiveIntegerFromForm = Schema.decodeUnknownResult(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isBetween({
        maximum: positiveIntegerMaximum,
        minimum: positiveIntegerMinimum,
      }),
    ),
  ),
);
const decodePositiveIntegerFromFormSync: (input: unknown) => number = Schema.decodeUnknownSync(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isBetween({
        maximum: positiveIntegerMaximum,
        minimum: positiveIntegerMinimum,
      }),
    ),
  ),
);
const decodeScenarioStepsFromJson = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Array(ScenarioStep)),
);
const decodeScenarioStepsFromJsonSync = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(ScenarioStep)),
);
const decodeScenarioTriggerType = Schema.decodeUnknownResult(ScenarioTriggerType);
const decodeScenarioTriggerTypeSync = Schema.decodeUnknownSync(ScenarioTriggerType);
const decodeParticipantsFromForm = Schema.decodeUnknownSync(Schema.Array(BotId));

const trimFormValue = (value: string): string => value.trim();

const toOptionalString = (value: string): string | null => (value === "" ? null : value);

const toOptionalPositiveInteger = (value: string): number | null =>
  value === "" ? null : decodePositiveIntegerFromFormSync(value);

const canDecodeNonEmptyString = (value: string): boolean =>
  Result.isSuccess(decodeNonEmptyString(value));

const canDecodePositiveIntegerFromForm = (value: string): boolean =>
  Result.isSuccess(decodePositiveIntegerFromForm(value));

const isScenarioTriggerType = (value: string): value is ScenarioTriggerTypeValue =>
  Result.isSuccess(decodeScenarioTriggerType(value));

const canDecodeStepsJson = (value: string): boolean =>
  value === "" || Result.isSuccess(decodeScenarioStepsFromJson(value));

export const makeEmptyScenarioEditorFormValues = (): ScenarioEditorFormValues =>
  new ScenarioEditorFormValues({
    description: "",
    durationSeconds: "",
    enabled: defaultEnabled,
    name: "",
    participants: [],
    steps: "",
    topic: "",
    triggerDelaySeconds: "",
    triggerEventType: "",
    triggerType: defaultTriggerType,
  });

export const makeScenarioEditorFormValues = (scenario: ScenarioRecord): ScenarioEditorFormValues =>
  new ScenarioEditorFormValues({
    description: scenario.description,
    durationSeconds: scenario.durationSeconds === null ? "" : String(scenario.durationSeconds),
    enabled: scenario.enabled,
    name: scenario.name,
    participants: [...scenario.participants],
    steps:
      scenario.steps.length === 0
        ? ""
        : JSON.stringify(
            scenario.steps.map((step) => ({
              action: step.action,
              botId: step.botId,
              content: step.content,
              delayAfter: step.delayAfter,
            })),
            null,
            stepJsonIndent,
          ),
    topic: scenario.topic,
    triggerDelaySeconds:
      scenario.triggerConfig.delaySeconds === null
        ? ""
        : String(scenario.triggerConfig.delaySeconds),
    triggerEventType: scenario.triggerConfig.eventType ?? "",
    triggerType: scenario.triggerType,
  });

export const parseScenarioEditorFields = (
  values: ScenarioEditorFormValues,
): ParsedScenarioEditorFields => {
  const normalizedValues = new ScenarioEditorFormValues({
    description: trimFormValue(values.description),
    durationSeconds: trimFormValue(values.durationSeconds),
    enabled: values.enabled,
    name: trimFormValue(values.name),
    participants: values.participants.map(trimFormValue).filter((value) => value.length > 0),
    steps: values.steps.trim(),
    topic: trimFormValue(values.topic),
    triggerDelaySeconds: trimFormValue(values.triggerDelaySeconds),
    triggerEventType: trimFormValue(values.triggerEventType),
    triggerType: trimFormValue(values.triggerType),
  });

  const errors: ScenarioEditorFormErrors = {};

  if (!canDecodeNonEmptyString(normalizedValues.name)) {
    errors.name = "Name is required.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.description)) {
    errors.description = "Description is required.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.topic)) {
    errors.topic = "Topic is required.";
  }

  if (normalizedValues.participants.length === 0) {
    errors.participants = "Select at least one participant.";
  }

  if (!isScenarioTriggerType(normalizedValues.triggerType)) {
    errors.triggerType = "Trigger type must be manual, timed, or on_event.";
  }

  if (
    normalizedValues.durationSeconds !== "" &&
    !canDecodePositiveIntegerFromForm(normalizedValues.durationSeconds)
  ) {
    errors.durationSeconds = "Duration must be a positive integer.";
  }

  if (!canDecodeStepsJson(normalizedValues.steps)) {
    errors.steps = "Steps must be valid JSON matching the scenario step schema.";
  }

  if (normalizedValues.triggerType === "timed") {
    if (!canDecodePositiveIntegerFromForm(normalizedValues.triggerDelaySeconds)) {
      errors.triggerDelaySeconds = "Timed triggers require delay seconds.";
    }
  } else if (
    normalizedValues.triggerDelaySeconds !== "" &&
    !canDecodePositiveIntegerFromForm(normalizedValues.triggerDelaySeconds)
  ) {
    errors.triggerDelaySeconds = "Delay seconds must be a positive integer.";
  }

  if (
    normalizedValues.triggerType === "on_event" &&
    !canDecodeNonEmptyString(normalizedValues.triggerEventType)
  ) {
    errors.triggerEventType = "On-event triggers require an event type.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      editorFields: null,
      errors,
      values: normalizedValues,
    };
  }

  const triggerType: ScenarioTriggerTypeValue = decodeScenarioTriggerTypeSync(
    normalizedValues.triggerType,
  );
  const delaySeconds =
    triggerType === "timed"
      ? decodePositiveIntegerFromFormSync(normalizedValues.triggerDelaySeconds)
      : toOptionalPositiveInteger(normalizedValues.triggerDelaySeconds);

  return {
    editorFields: new ScenarioEditorFields({
      description: normalizedValues.description,
      durationSeconds: toOptionalPositiveInteger(normalizedValues.durationSeconds),
      enabled: normalizedValues.enabled,
      name: normalizedValues.name,
      participants: decodeParticipantsFromForm(normalizedValues.participants),
      steps:
        normalizedValues.steps === ""
          ? []
          : decodeScenarioStepsFromJsonSync(normalizedValues.steps),
      topic: normalizedValues.topic,
      triggerConfig: new ScenarioTriggerConfig({
        delaySeconds,
        eventType:
          triggerType === "on_event" ? toOptionalString(normalizedValues.triggerEventType) : null,
      }),
      triggerType,
    }),
    errors,
    values: normalizedValues,
  };
};

const makeScenarioRecordMetadata = (now: string, existingScenario?: ScenarioRecord) =>
  existingScenario === undefined
    ? {
        createdAt: now,
        id: ScenarioId.makeUnsafe(crypto.randomUUID()),
      }
    : {
        createdAt: existingScenario.createdAt,
        id: existingScenario.id,
      };

export const makeScenarioRecordFromEditorFields = (
  editorFields: ScenarioEditorFields,
  now: string,
  existingScenario?: ScenarioRecord,
): ScenarioRecord =>
  new ScenarioRecord({
    ...makeScenarioRecordMetadata(now, existingScenario),
    description: editorFields.description,
    durationSeconds: editorFields.durationSeconds,
    enabled: editorFields.enabled,
    name: editorFields.name,
    participants: [...editorFields.participants],
    steps: [...editorFields.steps],
    topic: editorFields.topic,
    triggerConfig: new ScenarioTriggerConfig({
      delaySeconds: editorFields.triggerConfig.delaySeconds,
      eventType: editorFields.triggerConfig.eventType,
    }),
    triggerType: editorFields.triggerType,
    updatedAt: now,
  });
