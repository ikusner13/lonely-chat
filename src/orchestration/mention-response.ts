import { Schema } from "effect";

import { buildBotPromptMessages, buildGenerationSettings } from "../ai/prompt-assembly";
import { AiModelName, BotName } from "../ai/Services/ai-client";
import type { AiGenerateRequest } from "../ai/Services/ai-client";
import type { BotMemoryRecord } from "../bots/bot-memory-record";
import { BotRecord } from "../bots/bot-record";
import { BotId } from "../platforms/Services/platform-adapter";
import type { PlatformName } from "../platforms/Services/platform-adapter";
import type { SessionMessageRecord } from "../sessions/session-message-record";
import type { DirectorDirective } from "./director";

const responderCap = 3;
const consecutiveMessageLimit = 3;
const threadContinuationThreshold = 0.4;
const baseCooldownMs = 5000;
const consecutiveCooldownMs = 2000;
const mentionDelayRange = {
  max: 3000,
  min: 1000,
} as const;
const threadDelayRange = {
  max: 4000,
  min: 1000,
} as const;
const voluntaryDelayRange = {
  max: 6000,
  min: 2000,
} as const;
const silenceDelayRange = {
  max: 8000,
  min: 3000,
} as const;
const staggerDelayRange = {
  max: 1500,
  min: 500,
} as const;

export const SpeakerSelectionReason = Schema.Literals([
  "mention",
  "director",
  "thread",
  "talkativeness",
]);
export type SpeakerSelectionReason = typeof SpeakerSelectionReason.Type;
export const ResponseTrigger = Schema.Literals(["mention", "thread", "talkativeness", "silence"]);
export type ResponseTrigger = typeof ResponseTrigger.Type;

export class BotSpeakerState extends Schema.Class("BotSpeakerState")({
  botId: BotId,
  consecutiveCount: Schema.Number,
  cooldownUntil: Schema.Number,
  lastSpokeAt: Schema.NullOr(Schema.Number),
}) {}

export class SelectedSpeaker extends Schema.Class("SelectedSpeaker")({
  bot: Schema.instanceOf(BotRecord),
  reason: SpeakerSelectionReason,
}) {}

interface SpeakerSelectionOptions {
  readonly botStates?: readonly BotSpeakerState[];
  readonly directorDirective?: DirectorDirective | null;
  readonly now?: number;
  readonly recentMessages?: readonly SessionMessageRecord[];
  readonly talkativenessRoll?: (bot: BotRecord) => number;
  readonly threadRoll?: (bot: BotRecord) => number;
}

interface ResponseDelayOptions {
  readonly baseDelayRoll?: () => number;
  readonly selectionIndex?: number;
  readonly staggerDelayRoll?: () => number;
}

const escapeRegExp = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const makeMentionPattern = (botName: string): RegExp =>
  new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(botName)}(?=$|[^\\p{L}\\p{N}_])`, "iu");

export const findMentionedBots = (
  messageText: string,
  bots: readonly BotRecord[],
): readonly BotRecord[] =>
  bots.filter((bot) => bot.enabled && makeMentionPattern(bot.name).test(messageText));

const makeStateMap = (
  botStates: readonly BotSpeakerState[],
): ReadonlyMap<BotSpeakerState["botId"], BotSpeakerState> =>
  new Map(botStates.map((botState) => [botState.botId, botState]));

const hasBotSpokenRecently = (
  bot: BotRecord,
  recentMessages: readonly SessionMessageRecord[],
): boolean =>
  recentMessages
    .toReversed()
    .slice(0, responderCap)
    .some((message) => message.isBot && message.botId === BotId.makeUnsafe(bot.id));

const selectionPriority = (reason: SpeakerSelectionReason): number => {
  switch (reason) {
    case "mention": {
      return 0;
    }
    case "director": {
      return 1;
    }
    case "thread": {
      return 2;
    }
    case "talkativeness": {
      return 3;
    }
    default: {
      return responderCap;
    }
  }
};

const interpolateDelay = (minimumDelayMs: number, maximumDelayMs: number, roll: number): number =>
  minimumDelayMs + Math.round((maximumDelayMs - minimumDelayMs) * Math.min(Math.max(roll, 0), 1));

const matchesDirectorNudge = (bot: BotRecord, directive: DirectorDirective | null): boolean =>
  directive?.nudgedBotName?.localeCompare(bot.name, undefined, {
    sensitivity: "accent",
    usage: "search",
  }) === 0;

export const isEligibleByState = (
  bot: BotRecord,
  stateMap: ReadonlyMap<BotSpeakerState["botId"], BotSpeakerState>,
  now: number,
): boolean => {
  const botState = stateMap.get(BotId.makeUnsafe(bot.id));

  if (botState === undefined) {
    return true;
  }

  return botState.consecutiveCount < consecutiveMessageLimit && botState.cooldownUntil <= now;
};

export const isEligibleSpeaker = (
  bot: BotRecord,
  botStates: readonly BotSpeakerState[],
  now: number,
): boolean => isEligibleByState(bot, makeStateMap(botStates), now);

const delayRangeForTrigger = (
  trigger: ResponseTrigger,
): Readonly<{
  readonly max: number;
  readonly min: number;
}> => {
  switch (trigger) {
    case "mention": {
      return mentionDelayRange;
    }
    case "thread": {
      return threadDelayRange;
    }
    case "talkativeness": {
      return voluntaryDelayRange;
    }
    case "silence": {
      return silenceDelayRange;
    }
    default: {
      return silenceDelayRange;
    }
  }
};

export const calculateResponseDelay = (
  trigger: ResponseTrigger,
  options: ResponseDelayOptions = {},
): number => {
  const baseDelayRoll = options.baseDelayRoll ?? (() => Math.random());
  const staggerDelayRoll = options.staggerDelayRoll ?? (() => Math.random());
  const baseDelayRange = delayRangeForTrigger(trigger);
  const baseDelay = interpolateDelay(baseDelayRange.min, baseDelayRange.max, baseDelayRoll());
  const selectionIndex = options.selectionIndex ?? 0;

  if (selectionIndex <= 0) {
    return baseDelay;
  }

  const staggerDelay = interpolateDelay(
    staggerDelayRange.min,
    staggerDelayRange.max,
    staggerDelayRoll(),
  );

  return baseDelay + staggerDelay * selectionIndex;
};

export const responseTriggerForSelectionReason = (
  reason: SpeakerSelectionReason,
): ResponseTrigger => {
  switch (reason) {
    case "mention": {
      return "mention";
    }
    case "thread": {
      return "thread";
    }
    case "director": {
      return "talkativeness";
    }
    case "talkativeness": {
      return "talkativeness";
    }
    default: {
      return "talkativeness";
    }
  }
};

export const selectSilenceBreaker = (
  bots: readonly BotRecord[],
  options: Pick<SpeakerSelectionOptions, "botStates" | "directorDirective" | "now"> = {},
): BotRecord | null => {
  const enabledBots = bots.filter((bot) => bot.enabled);
  const stateMap = makeStateMap(options.botStates ?? []);
  const now = options.now ?? Date.now();
  const eligibleBots = enabledBots.filter((bot) => isEligibleByState(bot, stateMap, now));
  const nudgedBot = eligibleBots.find((bot) =>
    matchesDirectorNudge(bot, options.directorDirective ?? null),
  );

  if (nudgedBot !== undefined) {
    return nudgedBot;
  }

  const [selectedBot] = eligibleBots.toSorted(
    (left, right) => right.talkativeness - left.talkativeness,
  );

  return selectedBot ?? null;
};

export const selectSpeakers = (
  messageText: string,
  bots: readonly BotRecord[],
  options: SpeakerSelectionOptions = {},
): readonly SelectedSpeaker[] => {
  const enabledBots = bots.filter((bot) => bot.enabled);
  const stateMap = makeStateMap(options.botStates ?? []);
  const directorDirective = options.directorDirective ?? null;
  const now = options.now ?? Date.now();
  const recentMessages = options.recentMessages ?? [];
  const talkativenessRoll = options.talkativenessRoll ?? (() => Math.random());
  const threadRoll = options.threadRoll ?? (() => Math.random());
  const mentionedBots = findMentionedBots(messageText, enabledBots);
  const eligibleMentionedSpeakers = mentionedBots
    .map(
      (bot) =>
        new SelectedSpeaker({
          bot,
          reason: "mention",
        }),
    )
    .filter((speaker) => isEligibleByState(speaker.bot, stateMap, now));

  if (eligibleMentionedSpeakers.length > 0) {
    const nudgedMentionedSpeaker = enabledBots.find(
      (bot) =>
        matchesDirectorNudge(bot, directorDirective) &&
        !eligibleMentionedSpeakers.some((speaker) => speaker.bot.id === bot.id) &&
        isEligibleByState(bot, stateMap, now),
    );

    if (nudgedMentionedSpeaker === undefined) {
      return eligibleMentionedSpeakers.slice(0, responderCap);
    }

    return [
      ...eligibleMentionedSpeakers,
      new SelectedSpeaker({
        bot: nudgedMentionedSpeaker,
        reason: "director",
      }),
    ].slice(0, responderCap);
  }

  const nonMentionedBots = enabledBots.filter(
    (bot) => !mentionedBots.some((mentionedBot) => mentionedBot.id === bot.id),
  );
  const directorBots = nonMentionedBots.filter(
    (bot) => matchesDirectorNudge(bot, directorDirective) && isEligibleByState(bot, stateMap, now),
  );
  const threadedBots = nonMentionedBots.filter(
    (bot) =>
      !directorBots.some((directorBot) => directorBot.id === bot.id) &&
      hasBotSpokenRecently(bot, recentMessages) &&
      threadRoll(bot) < threadContinuationThreshold,
  );
  const talkativeBots = nonMentionedBots.filter(
    (bot) =>
      !directorBots.some((directorBot) => directorBot.id === bot.id) &&
      !threadedBots.some((threadedBot) => threadedBot.id === bot.id) &&
      talkativenessRoll(bot) <
        Math.min(bot.talkativeness + (directorDirective?.talkativenessBoostPercent ?? 0), 100) /
          100,
  );

  const mergedSpeakers: SelectedSpeaker[] = [];

  for (const bot of directorBots) {
    if (mergedSpeakers.some((speaker) => speaker.bot.id === bot.id)) {
      continue;
    }

    mergedSpeakers.push(
      new SelectedSpeaker({
        bot,
        reason: "director",
      }),
    );
  }

  for (const bot of threadedBots) {
    if (mergedSpeakers.some((speaker) => speaker.bot.id === bot.id)) {
      continue;
    }

    mergedSpeakers.push(
      new SelectedSpeaker({
        bot,
        reason: "thread",
      }),
    );
  }

  for (const bot of talkativeBots) {
    if (mergedSpeakers.some((speaker) => speaker.bot.id === bot.id)) {
      continue;
    }

    mergedSpeakers.push(
      new SelectedSpeaker({
        bot,
        reason: "talkativeness",
      }),
    );
  }

  return mergedSpeakers
    .filter((speaker) => isEligibleByState(speaker.bot, stateMap, now))
    .map((speaker, index) => ({
      index,
      speaker,
    }))
    .toSorted(
      (left, right) =>
        selectionPriority(left.speaker.reason) - selectionPriority(right.speaker.reason) ||
        left.index - right.index,
    )
    .slice(0, responderCap)
    .map(({ speaker }) => speaker);
};

export const advanceSpeakerState = (
  botStates: readonly BotSpeakerState[],
  botId: BotSpeakerState["botId"],
  now: number,
): readonly BotSpeakerState[] => {
  const currentState = botStates.find((botState) => botState.botId === botId) ?? null;
  const nextConsecutiveCount = (currentState?.consecutiveCount ?? 0) + 1;
  const nextBotState = new BotSpeakerState({
    botId,
    consecutiveCount: nextConsecutiveCount,
    cooldownUntil: now + baseCooldownMs + consecutiveCooldownMs * nextConsecutiveCount,
    lastSpokeAt: now,
  });

  const otherBotStates = botStates
    .filter((botState) => botState.botId !== botId)
    .map(
      (botState) =>
        new BotSpeakerState({
          botId: botState.botId,
          consecutiveCount: 0,
          cooldownUntil: botState.cooldownUntil,
          lastSpokeAt: botState.lastSpokeAt,
        }),
    );

  return [...otherBotStates, nextBotState];
};

export const makeMentionResponseRequest = (
  bot: BotRecord,
  platform: PlatformName,
  recentMessages: readonly SessionMessageRecord[],
  botMemories: readonly BotMemoryRecord[] = [],
  directorHint: string | null = null,
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: buildBotPromptMessages(bot, platform, {
    botMemories,
    finalSystemPrompt: directorHint,
    recentMessages,
  }),
  model: AiModelName.makeUnsafe(bot.model),
  settings: buildGenerationSettings(bot),
});

export const makeSilenceBreakerRequest = (
  bot: BotRecord,
  platform: PlatformName,
  recentMessages: readonly SessionMessageRecord[],
  botMemories: readonly BotMemoryRecord[] = [],
  directorHint: string | null = null,
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: buildBotPromptMessages(bot, platform, {
    botMemories,
    finalSystemPrompt: directorHint,
    finalUserPrompt: "Start a new conversation topic naturally.",
    recentMessages,
  }),
  model: AiModelName.makeUnsafe(bot.model),
  settings: buildGenerationSettings(bot),
});

export const makeScenarioResponseRequest = (
  bot: BotRecord,
  platform: PlatformName,
  recentMessages: readonly SessionMessageRecord[],
  topic: string,
  hint: string | null,
  botMemories: readonly BotMemoryRecord[] = [],
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: buildBotPromptMessages(bot, platform, {
    botMemories,
    finalUserPrompt: [`Scenario topic: ${topic}`, hint === null ? null : `Step hint: ${hint}`]
      .filter((line): line is string => line !== null)
      .join("\n"),
    recentMessages,
  }),
  model: AiModelName.makeUnsafe(bot.model),
  settings: buildGenerationSettings(bot),
});
