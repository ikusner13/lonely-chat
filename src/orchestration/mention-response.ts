import type { BotRecord } from "../bots/bot-record";
import { AiModelName, BotName } from "../ai/Services/ai-client";
import type { AiGenerateRequest, AiPromptMessage } from "../ai/Services/ai-client";
import type { ChatMessage, PlatformName } from "../platforms/Services/platform-adapter";

const escapeRegExp = (value: string): string => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const makeMentionPattern = (botName: string): RegExp =>
  new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(botName)}(?=$|[^\\p{L}\\p{N}_])`, "iu");

const buildStructuredSystemPrompt = (bot: BotRecord, platform: PlatformName): string => {
  const vocabularyRules = bot.vocabularyRules.map((rule) => `- NEVER: ${rule}`);
  const promptLines = [
    `You are ${bot.name}. You are chatting in a live stream chat on ${platform}.`,
    "",
    bot.personality,
    "",
    bot.description,
    "",
    "RULES:",
    `- Keep responses between ${bot.responseLength.min} and ${bot.responseLength.max} words`,
    "- DO NOT include your name or any prefix in messages",
    "- DO NOT use action tags like *action*",
    "- DO NOT continue or respond as other chatters",
    "- Just write your direct response",
    ...vocabularyRules,
  ];

  if (bot.postHistoryPrompt !== null) {
    promptLines.push("", bot.postHistoryPrompt);
  }

  return promptLines.join("\n");
};

const buildSystemPrompt = (bot: BotRecord, platform: PlatformName): string =>
  bot.systemPrompt ?? buildStructuredSystemPrompt(bot, platform);

const buildExampleMessages = (bot: BotRecord): readonly AiPromptMessage[] =>
  bot.exampleMessages.map((message) => ({
    content: `[example] ${bot.name}: ${message}`,
    role: "assistant",
  }));

const formatIncomingMessage = (message: ChatMessage): string =>
  `[external] ${message.username}: ${message.text}`;

export const findMentionedBots = (
  messageText: string,
  bots: readonly BotRecord[],
): readonly BotRecord[] =>
  bots.filter((bot) => bot.enabled && makeMentionPattern(bot.name).test(messageText));

export const selectSingleMentionedBot = (
  messageText: string,
  bots: readonly BotRecord[],
): BotRecord | null => {
  const mentionedBots = findMentionedBots(messageText, bots);

  if (mentionedBots.length !== 1) {
    return null;
  }

  return mentionedBots[0] ?? null;
};

export const makeMentionResponseRequest = (
  bot: BotRecord,
  message: ChatMessage,
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: [
    {
      content: buildSystemPrompt(bot, message.platform),
      role: "system",
    },
    ...buildExampleMessages(bot),
    {
      content: formatIncomingMessage(message),
      role: "user",
    },
  ],
  model: AiModelName.makeUnsafe(bot.model),
});
