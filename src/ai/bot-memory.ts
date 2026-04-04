import type { BotRecord } from "../bots/bot-record";
import type { PlatformName } from "../platforms/Services/platform-adapter";
import { BotId } from "../platforms/Services/platform-adapter";
import type { SessionMessageRecord } from "../sessions/session-message-record";
import { AiModelName, BotName } from "./Services/ai-client";
import type { AiGenerateRequest, AiPromptMessage } from "./Services/ai-client";

const formatSessionMemoryLine = (message: SessionMessageRecord): string =>
  `${message.isBot ? "" : "[external] "}${message.username}: ${message.content}`;

export const getBotMemorySourceMessages = (
  bot: BotRecord,
  sessionMessages: readonly SessionMessageRecord[],
): readonly SessionMessageRecord[] =>
  sessionMessages.filter((message) => message.isBot && message.botId === BotId.makeUnsafe(bot.id));

export const buildBotMemoryPromptMessages = (
  bot: BotRecord,
  platform: PlatformName,
  sessionMessages: readonly SessionMessageRecord[],
): readonly AiPromptMessage[] => [
  {
    content: [
      "Summarize this bot's conversational style during this session.",
      "Focus on catchphrases, running jokes, notable interactions, and personality quirks.",
      "Keep it under 100 words.",
      `Bot: ${bot.name}`,
      `Platform: ${platform}`,
    ].join("\n"),
    role: "system",
  },
  {
    content: [
      "Full session history for this bot:",
      ...sessionMessages.map(formatSessionMemoryLine),
    ].join("\n"),
    role: "user",
  },
];

export const makeBotMemoryRequest = (
  bot: BotRecord,
  platform: PlatformName,
  sessionMessages: readonly SessionMessageRecord[],
): AiGenerateRequest => ({
  botName: BotName.makeUnsafe(bot.displayName),
  messages: buildBotMemoryPromptMessages(bot, platform, sessionMessages),
  model: AiModelName.makeUnsafe(bot.model),
});
