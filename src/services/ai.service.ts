import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText } from 'ai';
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

      const messages: Array<{
        role: 'user' | 'assistant';
        content: string;
      }> = [];

      // Add context messages if provided
      if (context && context.length > 0) {
        // Add context messages with proper roles
        for (const msg of context) {
          // Check if this message is from the current bot
          if (msg.user.toLowerCase() === botName.toLowerCase()) {
            // Bot's own messages are marked as assistant
            messages.push({
              role: 'assistant' as const,
              content: msg.message,
            });
          } else {
            // Other messages (users and other bots) are marked as user
            messages.push({
              role: 'user' as const,
              content: `${msg.user}: ${msg.message}`,
            });
          }
        }
      }

      // Add the current trigger message with the user who sent it
      messages.push({
        role: 'user' as const,
        content: triggerMessage,
      });

      // Generate response using the AI model
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
      this.logger.error({ err: error }, `Error generating AI response for ${botName}`);
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
