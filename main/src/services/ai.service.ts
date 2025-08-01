import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText, type ModelMessage } from 'ai';
import z from 'zod';
import { createLogger } from '@/shared/logger';
import { env } from '../env';
import type { ChatMessage } from './chat-listener.service';
import type { BotConfig } from './config-manager';

export class AIService {
  private openrouter;
  private logger = createLogger('AIService');

  constructor() {
    this.openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
  }

  async generateResponse({
    botName,
    botConfig,
    triggerMessage,
    context,
  }: {
    botName: string;
    botConfig: BotConfig;
    triggerMessage: string;
    context?: Array<{ user: string; message: string; role: string }>;
  }): Promise<string | null> {
    try {
      const messages: ModelMessage[] = [];

      if (context && context.length > 0) {
        this.buildMessagesFromContext(messages, context, botName);
      }

      messages.push({
        role: 'user' as const,
        content: triggerMessage,
      });

      const result = await generateText({
        model: this.openrouter.chat(botConfig.model, {
          models: [],
        }),
        system: this.buildSystemPrompt(botName, botConfig),
        messages,
        temperature: botConfig.temperature || 0.7,
        maxOutputTokens: botConfig.maxTokens || 150,
      });

      return result.text;
    } catch (error) {
      this.logger.error(
        { err: error },
        `Error generating AI response for ${botName}`
      );
      return null;
    }
  }

  async generateModerationResponse({
    moderatorBotName,
    moderatorConfig,
    messages,
  }: {
    moderatorBotName: string;
    moderatorConfig: BotConfig;
    messages: ChatMessage[];
  }): Promise<{
    violations: {
      user: string;
      reason: string;
      duration: number;
    }[];
  } | null> {
    const moderationMessages = this.buildModerationMessages(
      messages,
      moderatorBotName
    );

    try {
      const { object } = await generateObject({
        model: this.openrouter.chat(moderatorConfig.model),
        schema: z.object({
          violations: z.array(
            z.object({
              user: z
                .string()
                .describe('The username of the user that violated the rules'),
              reason: z
                .string()
                .max(100)
                .describe('The reason for the violation'),
              duration: z
                .number()
                .min(1)
                .max(60)
                .describe('The duration of the timeout in seconds'),
            })
          ),
        }),
        system: `You are a moderator in this twitch chat. 
Your task is to determine if any users have violated the rules.

IMPORTANT: You MUST return an object with a key of "violations" and a value of an array of objects with the following keys:
- user: The username of the violator
- reason: Brief reason for the timeout (max 100 chars)
- duration: Timeout duration in seconds (1-60)

The rules are:
1. No mention of "neckbeard" or "neckbearddiscord" in any form
2. No mention of "discord" in any form  
3. No misspelling of "discord" or "neckbeard"

Each object in the array must have:
- user: The username of the violator
- reason: Brief reason for the timeout (max 100 chars)
- duration: Timeout duration in seconds (1-60)`,
        messages: moderationMessages,
        temperature: moderatorConfig.temperature || 0.7,
        maxOutputTokens: moderatorConfig.maxTokens || 150,
      });

      this.logger.info({ moderationResults: object }, 'Moderation results');

      return object;
    } catch (error) {
      this.logger.error(
        { err: error, moderationMessages },
        `Error generating moderation response for ${moderatorBotName}`
      );
      return null;
    }
  }

  /**
   * Build system prompt for the bot
   */
  private buildSystemPrompt(botName: string, botConfig: BotConfig): string {
    return `${botConfig.systemPrompt}\n\nYou are ${botName}. Critical instructions:
- All messages you receive are formatted as "username: message content"
- When you see "@${botName}" in a message, that user is talking directly TO YOU
- DO NOT write "botname:" or "[botname]:" or any username prefix in your responses
- Write ONLY your direct response, as if naturally speaking in chat
- Your messages are automatically sent from your ${botName} account
- Do NOT roleplay as other users or bots
- When you see "othername: message", that's just showing who said what - don't copy this format
- Respond naturally as yourself without any prefixes or identifiers`;
  }

  private buildModerationMessages(
    messages: ChatMessage[],
    moderatorBotName: string
  ): ModelMessage[] {
    const moderationMessages: ModelMessage[] = [];

    const lowerModeratorBotName = moderatorBotName.toLowerCase();

    for (const msg of messages) {
      if (msg.user.toLowerCase() === lowerModeratorBotName) {
        continue;
      }

      moderationMessages.push({
        role: 'user' as const,
        content: `${msg.user}: ${msg.message}`,
      });
    }

    return moderationMessages;
  }

  private buildMessagesFromContext(
    messages: ModelMessage[],
    context: Array<{ user: string; message: string; role: string }>,
    botName: string
  ): void {
    for (const msg of context) {
      if (msg.user.toLowerCase() === botName.toLowerCase()) {
        messages.push({
          role: 'assistant' as const,
          content: msg.message,
        });
      } else {
        messages.push({
          role: 'user' as const,
          content: `${msg.user}: ${msg.message}`,
        });
      }
    }
  }
}
