import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText, type ModelMessage } from 'ai';
import { type BotName, getBotPersonality } from '@/config/bot.schema';
import { env } from '@/env';
import '@/config/bots';
import z from 'zod';
import { createLogger } from '@/utils/logger';

export class AIService {
  private openrouter;
  private logger = createLogger('AIService');

  constructor() {
    this.openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
  }

  async generateResponse({
    botName,
    triggerMessage,
    context,
  }: {
    botName: BotName;
    triggerMessage: string;
    context?: Array<{ user: string; message: string; role: string }>;
  }): Promise<string | null> {
    try {
      const personality = getBotPersonality(botName);

      const messages: ModelMessage[] = [];

      if (context && context.length > 0) {
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

      messages.push({
        role: 'user' as const,
        content: triggerMessage,
      });

      const result = await generateText({
        model: this.openrouter.chat(personality.model, {
          models: [],
        }),
        system: this.buildSystemPrompt(botName),
        messages,
        temperature: personality.temperature,
        maxOutputTokens: personality.maxTokens,
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
    botName,
    triggerMessage,
    onModAction,
    triggerUser,
  }: {
    botName: BotName;
    triggerMessage: string;
    onModAction: (username: string) => void;
    triggerUser: string;
  }) {
    const personality = getBotPersonality(botName);

    const { object } = await generateObject({
      model: this.openrouter.chat(personality.model),
      schema: z.object({
        violation: z.enum(['YES', 'NO']),
      }),
      system: this.buildClassificationSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: triggerMessage,
        },
      ],
      temperature: personality.temperature,
      maxOutputTokens: personality.maxTokens,
    });

    if (object.violation === 'YES') {
      onModAction(triggerUser);
    }

    return {
      text: `NO, ${triggerUser} has not been timed out for violating the rules.`,
    };
  }

  private buildClassificationSystemPrompt(): string {
    return `
    You are a moderator in this twitch chat. 
    Your task is to give a 'YES' or 'NO' to the users message on whether it is a violation of the rules or not. 
    If it is a violation, you must say 'YES'
    If it is not a violation, you must say 'NO'. 

    YOU MUST ONLY RETURN THE OBJECT {
      violation: 'YES' | 'NO'
    }
    `;
  }

  /**
   * Build system prompt for the bot
   */
  private buildSystemPrompt(botName: BotName): string {
    const personality = getBotPersonality(botName);
    return `${personality.systemPrompt}\n\nYou are ${botName}. Critical instructions:
- All messages you receive are formatted as "username: message content"
- When you see "@${botName}" in a message, that user is talking directly TO YOU
- DO NOT write "botname:" or "[botname]:" or any username prefix in your responses
- Write ONLY your direct response, as if naturally speaking in chat
- Your messages are automatically sent from your ${botName} account
- Do NOT roleplay as other users or bots
- When you see "othername: message", that's just showing who said what - don't copy this format
- Respond naturally as yourself without any prefixes or identifiers`;
  }
}
