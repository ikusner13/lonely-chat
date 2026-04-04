import type { BotRecord } from "../bots/bot-record";
import type { BotMemoryRecord } from "../bots/bot-memory-record";
import type { PlatformName } from "../platforms/Services/platform-adapter";
import type { SessionMessageRecord } from "../sessions/session-message-record";
import { AiGenerationSettings, AiModelName } from "./Services/ai-client";
import type { AiPromptMessage } from "./Services/ai-client";

const chatHistoryWindowLimit = 20;
const chatHistoryWindowMaxAgeMs = 10 * 60 * 1000;
const memoryEntryLimit = 3;

interface BuildBotPromptMessageOptions {
  readonly botMemories?: readonly BotMemoryRecord[];
  readonly finalSystemPrompt?: string | null;
  readonly finalUserPrompt?: string | null;
  readonly recentMessages?: readonly SessionMessageRecord[];
}

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

const parseSentAt = (sentAt: string): number | null => {
  const parsed = Date.parse(sentAt);

  return Number.isFinite(parsed) ? parsed : null;
};

const formatChatHistoryMessage = (message: SessionMessageRecord): AiPromptMessage => ({
  content: `${message.isBot ? "" : "[external] "}${message.username}: ${message.content}`,
  role: "user",
});

export const buildSystemPrompt = (bot: BotRecord, platform: PlatformName): string =>
  bot.systemPrompt ?? buildStructuredSystemPrompt(bot, platform);

export const buildExampleMessages = (bot: BotRecord): readonly AiPromptMessage[] =>
  bot.exampleMessages.map((message) => ({
    content: `[example] ${bot.name}: ${message}`,
    role: "assistant",
  }));

export const buildMemoryMessages = (
  botMemories: readonly BotMemoryRecord[],
): readonly AiPromptMessage[] => {
  const recentMemories = [...botMemories]
    .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, memoryEntryLimit);

  if (recentMemories.length === 0) {
    return [];
  }

  return [
    {
      content: [
        "THINGS YOU REMEMBER FROM PAST SESSIONS:",
        ...recentMemories.map((memory) => `- ${memory.summary}`),
      ].join("\n"),
      role: "system",
    },
  ];
};

export const buildGenerationSettings = (bot: BotRecord): AiGenerationSettings =>
  new AiGenerationSettings({
    fallbackModels: bot.fallbackModels.map((model) => AiModelName.makeUnsafe(model)),
    maxOutputTokens: bot.maxTokens,
    stopSequences: ["\n"],
    temperature: bot.temperature,
  });

export const buildChatHistoryMessages = (
  recentMessages: readonly SessionMessageRecord[],
): readonly AiPromptMessage[] => {
  let latestSentAt: number | null = null;

  for (const message of recentMessages) {
    const parsedSentAt = parseSentAt(message.sentAt);

    if (parsedSentAt === null) {
      continue;
    }

    latestSentAt = latestSentAt === null ? parsedSentAt : Math.max(latestSentAt, parsedSentAt);
  }

  if (latestSentAt === null) {
    return [];
  }

  return recentMessages
    .filter((message) => {
      const parsedSentAt = parseSentAt(message.sentAt);

      return parsedSentAt !== null && latestSentAt - parsedSentAt <= chatHistoryWindowMaxAgeMs;
    })
    .slice(-chatHistoryWindowLimit)
    .map(formatChatHistoryMessage);
};

export const buildBotPromptMessages = (
  bot: BotRecord,
  platform: PlatformName,
  options: BuildBotPromptMessageOptions = {},
): readonly AiPromptMessage[] => [
  {
    content: buildSystemPrompt(bot, platform),
    role: "system",
  },
  ...buildMemoryMessages(options.botMemories ?? []),
  ...buildExampleMessages(bot),
  ...buildChatHistoryMessages(options.recentMessages ?? []),
  ...(options.finalSystemPrompt === null || options.finalSystemPrompt === undefined
    ? []
    : [
        {
          content: options.finalSystemPrompt,
          role: "system" as const,
        },
      ]),
  ...(options.finalUserPrompt === null || options.finalUserPrompt === undefined
    ? []
    : [
        {
          content: options.finalUserPrompt,
          role: "user" as const,
        },
      ]),
];
