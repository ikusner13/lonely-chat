import * as Schema from "effect/Schema";

import { BotId, BotPlatform, BotRecord } from "./bot-record";
import type { BotPlatform as BotPlatformType } from "./bot-record";

const defaultEnabled = true;
const defaultMaxTokens = 160;
const defaultPlatform = "twitch";
const defaultResponseLengthMaximum = 10;
const defaultResponseLengthMinimum = 3;
const defaultTalkativeness = "50";
const defaultTemperature = 0.7;
const talkativenessMaximum = 100;
const talkativenessMinimum = 0;

export class BotCoreFields extends Schema.Class("BotCoreFields")({
  displayName: Schema.NonEmptyString,
  enabled: Schema.Boolean,
  model: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  platform: BotPlatform,
  talkativeness: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({
      maximum: talkativenessMaximum,
      minimum: talkativenessMinimum,
    }),
  ),
}) {}

export interface BotCoreFieldFormErrors {
  displayName?: string;
  model?: string;
  name?: string;
  platform?: string;
  talkativeness?: string;
}

export class BotCoreFieldFormValues extends Schema.Class("BotCoreFieldFormValues")({
  displayName: Schema.String,
  enabled: Schema.Boolean,
  model: Schema.String,
  name: Schema.String,
  platform: Schema.String,
  talkativeness: Schema.String,
}) {}

interface ParsedBotCoreFieldsFailure {
  readonly coreFields: null;
  readonly errors: BotCoreFieldFormErrors;
  readonly values: BotCoreFieldFormValues;
}

interface ParsedBotCoreFieldsSuccess {
  readonly coreFields: BotCoreFields;
  readonly errors: BotCoreFieldFormErrors;
  readonly values: BotCoreFieldFormValues;
}

export type ParsedBotCoreFields = ParsedBotCoreFieldsFailure | ParsedBotCoreFieldsSuccess;

const decodeNonEmptyString: (input: unknown) => string = Schema.decodeUnknownSync(
  Schema.NonEmptyString,
);
const decodeTalkativenessFromForm: (input: unknown) => number = Schema.decodeUnknownSync(
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
const decodeBotCoreFieldsFromForm: (input: unknown) => {
  readonly displayName: string;
  readonly enabled: boolean;
  readonly model: string;
  readonly name: string;
  readonly platform: BotPlatformType;
  readonly talkativeness: number;
} = Schema.decodeUnknownSync(
  Schema.Struct({
    displayName: Schema.NonEmptyString,
    enabled: Schema.Boolean,
    model: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    platform: BotPlatform,
    talkativeness: Schema.NumberFromString.pipe(
      Schema.check(
        Schema.isInt(),
        Schema.isBetween({
          maximum: talkativenessMaximum,
          minimum: talkativenessMinimum,
        }),
      ),
    ),
  }),
);

const trimFormValue = (value: string): string => value.trim();

const isBotPlatform = (value: string): value is BotPlatformType =>
  value === "kick" || value === "twitch";

const canDecodeNonEmptyString = (value: string): boolean => {
  try {
    decodeNonEmptyString(value);

    return true;
  } catch {
    return false;
  }
};

const canDecodeTalkativenessFromForm = (value: string): boolean => {
  try {
    decodeTalkativenessFromForm(value);

    return true;
  } catch {
    return false;
  }
};

export const makeEmptyBotCoreFieldFormValues = (): BotCoreFieldFormValues =>
  new BotCoreFieldFormValues({
    displayName: "",
    enabled: defaultEnabled,
    model: "",
    name: "",
    platform: defaultPlatform,
    talkativeness: defaultTalkativeness,
  });

export const makeBotCoreFieldFormValues = (bot: BotRecord): BotCoreFieldFormValues =>
  new BotCoreFieldFormValues({
    displayName: bot.displayName,
    enabled: bot.enabled,
    model: bot.model,
    name: bot.name,
    platform: bot.platform,
    talkativeness: String(bot.talkativeness),
  });

export const parseBotCoreFields = (values: BotCoreFieldFormValues): ParsedBotCoreFields => {
  const normalizedValues = new BotCoreFieldFormValues({
    displayName: trimFormValue(values.displayName),
    enabled: values.enabled,
    model: trimFormValue(values.model),
    name: trimFormValue(values.name),
    platform: values.platform,
    talkativeness: trimFormValue(values.talkativeness),
  });

  const errors: BotCoreFieldFormErrors = {};

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

  if (Object.keys(errors).length > 0) {
    return {
      coreFields: null,
      errors,
      values: normalizedValues,
    };
  }

  const decodedCoreFieldsFromForm = decodeBotCoreFieldsFromForm(normalizedValues);

  return {
    coreFields: new BotCoreFields(decodedCoreFieldsFromForm),
    errors,
    values: normalizedValues,
  };
};

const cloneExistingBotFields = (existingBot: BotRecord) => ({
  createdAt: existingBot.createdAt,
  description: existingBot.description,
  exampleMessages: [...existingBot.exampleMessages],
  fallbackModels: [...existingBot.fallbackModels],
  firstMessage: existingBot.firstMessage,
  id: existingBot.id,
  maxTokens: existingBot.maxTokens,
  personality: existingBot.personality,
  postHistoryPrompt: existingBot.postHistoryPrompt,
  responseLength: existingBot.responseLength,
  systemPrompt: existingBot.systemPrompt,
  temperature: existingBot.temperature,
  vocabularyRules: [...existingBot.vocabularyRules],
});

const makeDefaultBotFields = (now: string) => ({
  createdAt: now,
  description: "",
  exampleMessages: [] as string[],
  fallbackModels: [] as string[],
  firstMessage: null,
  id: BotId.makeUnsafe(crypto.randomUUID()),
  maxTokens: defaultMaxTokens,
  personality: "",
  postHistoryPrompt: null,
  responseLength: {
    max: defaultResponseLengthMaximum,
    min: defaultResponseLengthMinimum,
  },
  systemPrompt: null,
  temperature: defaultTemperature,
  vocabularyRules: [] as string[],
});

const makePreservedBotFields = (now: string, existingBot?: BotRecord) =>
  existingBot === undefined ? makeDefaultBotFields(now) : cloneExistingBotFields(existingBot);

export const makeBotRecordFromCoreFields = (
  coreFields: BotCoreFields,
  now: string,
  existingBot?: BotRecord,
): BotRecord =>
  new BotRecord({
    ...makePreservedBotFields(now, existingBot),
    displayName: coreFields.displayName,
    enabled: coreFields.enabled,
    model: coreFields.model,
    name: coreFields.name,
    platform: coreFields.platform,
    talkativeness: coreFields.talkativeness,
    updatedAt: now,
  });
