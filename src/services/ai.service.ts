import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText } from 'ai';
import { type BotName, getBotPersonality } from '@/config/bot.schema';
import { env } from '@/env';
import '@/config/bots';
import z from 'zod';

export class AIService {
  private openrouter;

  constructor() {
    this.openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
  }

  async generateResponse({
    botName,
    triggerMessage,
  }: {
    botName: BotName;
    triggerMessage: string;
  }): Promise<string | null> {
    try {
      const personality = getBotPersonality(botName);

      // Generate response using the AI model
      const result = await generateText({
        model: this.openrouter.chat(personality.model, {
          models: [],
        }),
        system: this.buildSystemPrompt(botName),
        messages: [
          {
            role: 'user',
            content: triggerMessage,
          },
        ],
        temperature: personality.temperature,
        maxOutputTokens: personality.maxTokens,
      });

      return result.text;
    } catch (error) {
      console.error(`Error generating AI response for ${botName}:`, error);
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
    return `${personality.systemPrompt}\n\nYou are ${botName}. Remember: 
- Write ONLY your direct response, no [name]: prefixes
- Do NOT roleplay as other bots or continue their messages
- When you see [otherbot]: message, that's just context - don't mimic that format
- When someone mentions @${botName}, they are talking TO YOU. You ARE ${botName}, so respond accordingly`;
  }
}
