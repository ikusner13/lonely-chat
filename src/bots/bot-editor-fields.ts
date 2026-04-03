import * as Schema from "effect/Schema";
import * as Result from "effect/Result";

import { BotId, BotPlatform, BotRecord } from "./bot-record";
import type { BotPlatform as BotPlatformType } from "./bot-record";

const defaultEnabled = true;
const defaultMaxTokens = "160";
const defaultPlatform = "twitch";
const defaultResponseLengthMaximum = "10";
const defaultResponseLengthMinimum = "3";
const defaultTalkativeness = "50";
const defaultTemperature = "0.7";
const listItemSeparator = /\r?\n/gu;
const talkativenessMaximum = 100;
const talkativenessMinimum = 0;
const temperatureMaximum = 2;
const temperatureMinimum = 0;
const positiveIntegerMaximum = Number.MAX_SAFE_INTEGER;
const positiveIntegerMinimum = 1;
const exampleMessageMaximum = 5;
const exampleMessageMinimum = 3;

const Talkativeness = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({
    maximum: talkativenessMaximum,
    minimum: talkativenessMinimum,
  }),
);

const Temperature = Schema.Number.check(
  Schema.isBetween({
    maximum: temperatureMaximum,
    minimum: temperatureMinimum,
  }),
);

const PositiveInteger = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({
    maximum: positiveIntegerMaximum,
    minimum: positiveIntegerMinimum,
  }),
);

export class BotEditorFields extends Schema.Class("BotEditorFields")({
  description: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  enabled: Schema.Boolean,
  exampleMessages: Schema.Array(Schema.NonEmptyString),
  fallbackModels: Schema.Array(Schema.NonEmptyString),
  firstMessage: Schema.NullOr(Schema.NonEmptyString),
  maxTokens: PositiveInteger,
  model: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  personality: Schema.NonEmptyString,
  platform: BotPlatform,
  postHistoryPrompt: Schema.NullOr(Schema.NonEmptyString),
  responseLength: Schema.Struct({
    max: PositiveInteger,
    min: PositiveInteger,
  }),
  systemPrompt: Schema.NullOr(Schema.NonEmptyString),
  talkativeness: Talkativeness,
  temperature: Temperature,
  vocabularyRules: Schema.Array(Schema.NonEmptyString),
}) {}

export interface BotEditorFormErrors {
  description?: string;
  displayName?: string;
  exampleMessages?: string;
  maxTokens?: string;
  model?: string;
  name?: string;
  personality?: string;
  platform?: string;
  responseLengthMax?: string;
  responseLengthMin?: string;
  talkativeness?: string;
  temperature?: string;
}

export class BotEditorFormValues extends Schema.Class("BotEditorFormValues")({
  description: Schema.String,
  displayName: Schema.String,
  enabled: Schema.Boolean,
  exampleMessages: Schema.String,
  fallbackModels: Schema.String,
  firstMessage: Schema.String,
  maxTokens: Schema.String,
  model: Schema.String,
  name: Schema.String,
  personality: Schema.String,
  platform: Schema.String,
  postHistoryPrompt: Schema.String,
  responseLengthMax: Schema.String,
  responseLengthMin: Schema.String,
  systemPrompt: Schema.String,
  talkativeness: Schema.String,
  temperature: Schema.String,
  vocabularyRules: Schema.String,
}) {}

interface ParsedBotEditorFieldsFailure {
  readonly editorFields: null;
  readonly errors: BotEditorFormErrors;
  readonly values: BotEditorFormValues;
}

interface ParsedBotEditorFieldsSuccess {
  readonly editorFields: BotEditorFields;
  readonly errors: BotEditorFormErrors;
  readonly values: BotEditorFormValues;
}

export type ParsedBotEditorFields = ParsedBotEditorFieldsFailure | ParsedBotEditorFieldsSuccess;

const decodeNonEmptyString = Schema.decodeUnknownResult(Schema.NonEmptyString);
const decodeTalkativenessFromForm = Schema.decodeUnknownResult(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isBetween({
        maximum: talkativenessMaximum,
        minimum: talkativenessMinimum,
      }),
    ),
  ),
);
const decodeTalkativenessFromFormSync: (input: unknown) => number = Schema.decodeUnknownSync(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isBetween({
        maximum: talkativenessMaximum,
        minimum: talkativenessMinimum,
      }),
    ),
  ),
);
const decodeTemperatureFromForm = Schema.decodeUnknownResult(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isBetween({
        maximum: temperatureMaximum,
        minimum: temperatureMinimum,
      }),
    ),
  ),
);
const decodeTemperatureFromFormSync: (input: unknown) => number = Schema.decodeUnknownSync(
  Schema.NumberFromString.pipe(
    Schema.check(
      Schema.isBetween({
        maximum: temperatureMaximum,
        minimum: temperatureMinimum,
      }),
    ),
  ),
);
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
const decodeBotEditorFieldsFromForm: (input: unknown) => {
  readonly description: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly exampleMessages: readonly string[];
  readonly fallbackModels: readonly string[];
  readonly firstMessage: string | null;
  readonly maxTokens: number;
  readonly model: string;
  readonly name: string;
  readonly personality: string;
  readonly platform: BotPlatformType;
  readonly postHistoryPrompt: string | null;
  readonly responseLength: {
    readonly max: number;
    readonly min: number;
  };
  readonly systemPrompt: string | null;
  readonly talkativeness: number;
  readonly temperature: number;
  readonly vocabularyRules: readonly string[];
} = Schema.decodeUnknownSync(
  Schema.Struct({
    description: Schema.NonEmptyString,
    displayName: Schema.NonEmptyString,
    enabled: Schema.Boolean,
    exampleMessages: Schema.Array(Schema.NonEmptyString),
    fallbackModels: Schema.Array(Schema.NonEmptyString),
    firstMessage: Schema.NullOr(Schema.NonEmptyString),
    maxTokens: PositiveInteger,
    model: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    personality: Schema.NonEmptyString,
    platform: BotPlatform,
    postHistoryPrompt: Schema.NullOr(Schema.NonEmptyString),
    responseLength: Schema.Struct({
      max: PositiveInteger,
      min: PositiveInteger,
    }),
    systemPrompt: Schema.NullOr(Schema.NonEmptyString),
    talkativeness: Talkativeness,
    temperature: Temperature,
    vocabularyRules: Schema.Array(Schema.NonEmptyString),
  }),
);

const trimFormValue = (value: string): string => value.trim();

const splitListValue = (value: string): readonly string[] => value.split(listItemSeparator);

const normalizeListValue = (value: string): string =>
  splitListValue(value)
    .map(trimFormValue)
    .filter((entry) => entry.length > 0)
    .join("\n");

const toOptionalString = (value: string): string | null => (value === "" ? null : value);

const isBotPlatform = (value: string): value is BotPlatformType =>
  value === "kick" || value === "twitch";

const canDecodeNonEmptyString = (value: string): boolean =>
  Result.isSuccess(decodeNonEmptyString(value));

const canDecodeTalkativenessFromForm = (value: string): boolean =>
  Result.isSuccess(decodeTalkativenessFromForm(value));

const canDecodeTemperatureFromForm = (value: string): boolean =>
  Result.isSuccess(decodeTemperatureFromForm(value));

const canDecodePositiveIntegerFromForm = (value: string): boolean =>
  Result.isSuccess(decodePositiveIntegerFromForm(value));

const hasValidExampleMessageCount = (value: string): boolean => {
  const exampleMessages = splitListValue(value)
    .map(trimFormValue)
    .filter((entry) => entry.length > 0);

  return (
    exampleMessages.length >= exampleMessageMinimum &&
    exampleMessages.length <= exampleMessageMaximum
  );
};

export const makeEmptyBotEditorFormValues = (): BotEditorFormValues =>
  new BotEditorFormValues({
    description: "",
    displayName: "",
    enabled: defaultEnabled,
    exampleMessages: "",
    fallbackModels: "",
    firstMessage: "",
    maxTokens: defaultMaxTokens,
    model: "",
    name: "",
    personality: "",
    platform: defaultPlatform,
    postHistoryPrompt: "",
    responseLengthMax: defaultResponseLengthMaximum,
    responseLengthMin: defaultResponseLengthMinimum,
    systemPrompt: "",
    talkativeness: defaultTalkativeness,
    temperature: defaultTemperature,
    vocabularyRules: "",
  });

export const makeBotEditorFormValues = (bot: BotRecord): BotEditorFormValues =>
  new BotEditorFormValues({
    description: bot.description,
    displayName: bot.displayName,
    enabled: bot.enabled,
    exampleMessages: bot.exampleMessages.join("\n"),
    fallbackModels: bot.fallbackModels.join("\n"),
    firstMessage: bot.firstMessage ?? "",
    maxTokens: String(bot.maxTokens),
    model: bot.model,
    name: bot.name,
    personality: bot.personality,
    platform: bot.platform,
    postHistoryPrompt: bot.postHistoryPrompt ?? "",
    responseLengthMax: String(bot.responseLength.max),
    responseLengthMin: String(bot.responseLength.min),
    systemPrompt: bot.systemPrompt ?? "",
    talkativeness: String(bot.talkativeness),
    temperature: String(bot.temperature),
    vocabularyRules: bot.vocabularyRules.join("\n"),
  });

export const parseBotEditorFields = (values: BotEditorFormValues): ParsedBotEditorFields => {
  const normalizedValues = new BotEditorFormValues({
    description: trimFormValue(values.description),
    displayName: trimFormValue(values.displayName),
    enabled: values.enabled,
    exampleMessages: normalizeListValue(values.exampleMessages),
    fallbackModels: normalizeListValue(values.fallbackModels),
    firstMessage: trimFormValue(values.firstMessage),
    maxTokens: trimFormValue(values.maxTokens),
    model: trimFormValue(values.model),
    name: trimFormValue(values.name),
    personality: trimFormValue(values.personality),
    platform: values.platform,
    postHistoryPrompt: trimFormValue(values.postHistoryPrompt),
    responseLengthMax: trimFormValue(values.responseLengthMax),
    responseLengthMin: trimFormValue(values.responseLengthMin),
    systemPrompt: trimFormValue(values.systemPrompt),
    talkativeness: trimFormValue(values.talkativeness),
    temperature: trimFormValue(values.temperature),
    vocabularyRules: normalizeListValue(values.vocabularyRules),
  });

  const errors: BotEditorFormErrors = {};

  if (!canDecodeNonEmptyString(normalizedValues.name)) {
    errors.name = "Name is required.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.displayName)) {
    errors.displayName = "Display name is required.";
  }

  if (!isBotPlatform(normalizedValues.platform)) {
    errors.platform = "Platform must be twitch or kick.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.model)) {
    errors.model = "Model is required.";
  }

  if (!canDecodeTalkativenessFromForm(normalizedValues.talkativeness)) {
    errors.talkativeness = "Talkativeness must be an integer between 0 and 100.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.personality)) {
    errors.personality = "Personality is required.";
  }

  if (!canDecodeNonEmptyString(normalizedValues.description)) {
    errors.description = "Description is required.";
  }

  if (!hasValidExampleMessageCount(normalizedValues.exampleMessages)) {
    errors.exampleMessages = "Example messages must include 3 to 5 entries.";
  }

  if (!canDecodeTemperatureFromForm(normalizedValues.temperature)) {
    errors.temperature = "Temperature must be a number between 0 and 2.";
  }

  if (!canDecodePositiveIntegerFromForm(normalizedValues.maxTokens)) {
    errors.maxTokens = "Max tokens must be a positive integer.";
  }

  if (!canDecodePositiveIntegerFromForm(normalizedValues.responseLengthMin)) {
    errors.responseLengthMin = "Minimum response length must be a positive integer.";
  }

  if (!canDecodePositiveIntegerFromForm(normalizedValues.responseLengthMax)) {
    errors.responseLengthMax = "Maximum response length must be a positive integer.";
  }

  if (
    errors.responseLengthMin === undefined &&
    errors.responseLengthMax === undefined &&
    Number(normalizedValues.responseLengthMin) > Number(normalizedValues.responseLengthMax)
  ) {
    errors.responseLengthMax = "Maximum response length must be greater than or equal to minimum.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      editorFields: null,
      errors,
      values: normalizedValues,
    };
  }

  const decodedEditorFieldsFromForm = decodeBotEditorFieldsFromForm({
    description: normalizedValues.description,
    displayName: normalizedValues.displayName,
    enabled: normalizedValues.enabled,
    exampleMessages: splitListValue(normalizedValues.exampleMessages)
      .map(trimFormValue)
      .filter((entry) => entry.length > 0),
    fallbackModels: splitListValue(normalizedValues.fallbackModels)
      .map(trimFormValue)
      .filter((entry) => entry.length > 0),
    firstMessage: toOptionalString(normalizedValues.firstMessage),
    maxTokens: decodePositiveIntegerFromFormSync(normalizedValues.maxTokens),
    model: normalizedValues.model,
    name: normalizedValues.name,
    personality: normalizedValues.personality,
    platform: normalizedValues.platform,
    postHistoryPrompt: toOptionalString(normalizedValues.postHistoryPrompt),
    responseLength: {
      max: decodePositiveIntegerFromFormSync(normalizedValues.responseLengthMax),
      min: decodePositiveIntegerFromFormSync(normalizedValues.responseLengthMin),
    },
    systemPrompt: toOptionalString(normalizedValues.systemPrompt),
    talkativeness: decodeTalkativenessFromFormSync(normalizedValues.talkativeness),
    temperature: decodeTemperatureFromFormSync(normalizedValues.temperature),
    vocabularyRules: splitListValue(normalizedValues.vocabularyRules)
      .map(trimFormValue)
      .filter((entry) => entry.length > 0),
  });

  return {
    editorFields: new BotEditorFields(decodedEditorFieldsFromForm),
    errors,
    values: normalizedValues,
  };
};

const makeBotRecordMetadata = (now: string, existingBot?: BotRecord) =>
  existingBot === undefined
    ? {
        createdAt: now,
        id: BotId.makeUnsafe(crypto.randomUUID()),
      }
    : {
        createdAt: existingBot.createdAt,
        id: existingBot.id,
      };

export const makeBotRecordFromEditorFields = (
  editorFields: BotEditorFields,
  now: string,
  existingBot?: BotRecord,
): BotRecord =>
  new BotRecord({
    ...makeBotRecordMetadata(now, existingBot),
    description: editorFields.description,
    displayName: editorFields.displayName,
    enabled: editorFields.enabled,
    exampleMessages: [...editorFields.exampleMessages],
    fallbackModels: [...editorFields.fallbackModels],
    firstMessage: editorFields.firstMessage,
    maxTokens: editorFields.maxTokens,
    model: editorFields.model,
    name: editorFields.name,
    personality: editorFields.personality,
    platform: editorFields.platform,
    postHistoryPrompt: editorFields.postHistoryPrompt,
    responseLength: {
      max: editorFields.responseLength.max,
      min: editorFields.responseLength.min,
    },
    systemPrompt: editorFields.systemPrompt,
    talkativeness: editorFields.talkativeness,
    temperature: editorFields.temperature,
    updatedAt: now,
    vocabularyRules: [...editorFields.vocabularyRules],
  });
