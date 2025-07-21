import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ModelMessage } from 'ai';
import { type BotName, getBotPersonality } from '@/config/bot.schema';
import { env } from '@/env';
import type { ChatMessage, ConversationManager } from './conversation.service';
import '@/config/bots';

export class AIService {
  private openrouter;
  private conversationManager: ConversationManager;

  constructor(conversationManager: ConversationManager) {
    this.openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
    this.conversationManager = conversationManager;
  }

  /**
   * Generate a response for a bot in a channel
   */
  async generateResponse({
    channelName,
    botName,
    triggerMessage,
    triggerUser,
  }: {
    channelName: string;
    botName: BotName;
    triggerMessage: string | null;
    triggerUser: string | null;
  }): Promise<string | null> {
    try {
      // If there's a trigger message, add it to context first
      if (triggerMessage && triggerUser) {
        this.conversationManager.addUserMessage(
          channelName,
          triggerUser,
          triggerMessage
        );
      }

      // Get messages formatted for this specific bot
      const messages = this.conversationManager.getMessagesForBot(
        channelName,
        botName
      );

      // Convert messages to AI SDK format
      const aiMessages = this.convertToAIMessages(messages);

      const personality = getBotPersonality(botName);

      // Debug logging
      console.log('Personality:', personality);
      console.log('Model:', personality.model);

      // Generate response using the AI model
      const result = await generateText({
        model: this.openrouter.chat(personality.model),
        system: this.buildSystemPrompt(botName),
        messages: aiMessages,
        temperature: personality.temperature,
        maxOutputTokens: personality.maxTokens,
      });

      // Add the bot's response to conversation
      this.conversationManager.addBotResponse(
        channelName,
        botName,
        result.text
      );

      return result.text;
    } catch (error) {
      console.error(`Error generating AI response for ${botName}:`, error);
      return null;
    }
  }

  /**
   * Build system prompt for the bot
   */
  private buildSystemPrompt(botName: BotName): string {
    const personality = getBotPersonality(botName);
    return `${personality.systemPrompt}\n\nYou are ${botName}.`;
  }

  /**
   * Convert ChatMessage to AI SDK format
   */
  private convertToAIMessages(messages: ChatMessage[]): ModelMessage[] {
    return messages.map((msg) => {
      return {
        content: msg.content,
        role: msg.role,
      } as ModelMessage;
    });
  }
}
