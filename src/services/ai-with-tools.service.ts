import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, generateText, type ModelMessage } from 'ai';
import { z } from 'zod';
import {
  type BotName,
  type BotPersonality,
  getBotPersonality,
} from '@/config/bot.schema';
import { env } from '@/env';
import type { BotManager } from './bot-manager.service';
import type { ChatMessage, ConversationManager } from './conversation.service';
import '@/config/bots';

export interface ModeratorAction {
  type: 'timeout' | 'warn' | 'none';
  username?: string;
  duration?: number;
  reason?: string;
}

export class AIServiceWithTools {
  private openrouter;
  private conversationManager: ConversationManager;
  private botManager: BotManager;
  private channelName: string;

  constructor(
    conversationManager: ConversationManager,
    botManager: BotManager,
    channelName: string
  ) {
    this.openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
    this.conversationManager = conversationManager;
    this.botManager = botManager;
    this.channelName = channelName;
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

      // Check if this is the moderator bot
      const isModeratorBot = botName === 'neckbearddiscordmod';
      console.log(`🤖 Processing message for bot: ${botName}`);
      console.log(`🛡️ Is moderator bot: ${isModeratorBot}`);
      if (triggerMessage && triggerUser) {
        console.log(`💬 Trigger: "${triggerMessage}" from @${triggerUser}`);
      }

      // Generate response with or without tools
      const result = isModeratorBot
        ? await this.generateWithModeratorTools({
            personality,
            aiMessages,
            botName,
          })
        : await this.generateNormalResponse({
            personality,
            aiMessages,
            botName,
          });

      // Add the bot's response to conversation
      if (result.text) {
        console.log(`✅ Bot response: "${result.text}"`);
        this.conversationManager.addBotResponse(
          channelName,
          botName,
          result.text
        );
      } else {
        console.log('⚠️ No text response generated');
      }

      return result.text;
    } catch (error) {
      console.error(`Error generating AI response for ${botName}:`, error);
      return null;
    }
  }

  /**
   * Generate response with moderator tools
   */
  private async generateWithModeratorTools({
    personality,
    aiMessages,
    botName,
  }: {
    personality: BotPersonality;
    aiMessages: ModelMessage[];
    botName: BotName;
  }) {
    console.log('🛡️ Moderator bot analyzing messages...');
    console.log('📝 Total messages in context:', aiMessages.length);
    let lastMsg: ModelMessage | undefined;
    if (aiMessages.length > 0) {
      lastMsg = aiMessages.at(-1);
      console.log('💬 Last message:', {
        role: lastMsg?.role,
        content:
          typeof lastMsg?.content === 'string'
            ? `${lastMsg.content.substring(0, 100)}...`
            : 'Complex content type',
      });
    }
    console.log('🔧 Model config:', {
      model: personality.model,
      temperature: personality.temperature,
      maxTokens: personality.maxTokens,
    });

    const { object } = await generateObject({
      model: this.openrouter.chat(personality.model),
      // output: 'enum',
      // enum: ['YES', 'NO'],
      schema: z.object({
        violation: z.enum(['YES', 'NO']),
      }),
      system: this.buildClassificationSystemPrompt(),
      messages: aiMessages,
      temperature: personality.temperature,
      maxOutputTokens: personality.maxTokens,
    });

    console.log('🔍 Object:', object);

    const message = lastMsg?.content as string;

    const username = message.split('[')[1].split(']')[0];

    if (object.violation === 'YES') {
      await this.executeTimeout(username, 60, 'Violation of chat rules');

      return {
        text: `YES, ${username} has been timed out for 60 seconds for violating the rules.`,
      };
    }

    return {
      text: `NO, ${username} has not been timed out for violating the rules.`,
    };
  }

  /**
   *
   * Generate normal response without tools
   */
  private async generateNormalResponse({
    personality,
    aiMessages,
    botName,
  }: {
    personality: BotPersonality;
    aiMessages: ModelMessage[];
    botName: BotName;
  }) {
    const result = await generateText({
      model: this.openrouter.chat(personality.model, {
        models: [],
      }),
      system: this.buildSystemPrompt(botName),
      messages: aiMessages,
      temperature: personality.temperature,
      maxOutputTokens: personality.maxTokens,
    });

    return result;
  }

  /**
   * Execute a timeout using the bot's API client
   */
  private async executeTimeout(
    username: string | undefined,
    duration: number | undefined,
    reason: string | undefined
  ) {
    console.log('🔧 Executing timeout...');
    console.log('🔧 Username:', username);
    console.log('🔧 Duration:', duration);
    console.log('🔧 Reason:', reason);

    if (!username) {
      console.error('❌ Cannot execute timeout: username is undefined');
      return;
    }

    const modBot = this.botManager.getBot('neckbearddiscordmod');
    if (!modBot) {
      console.error('⚠️ Moderator bot not found');
      return;
    }

    const apiClient = modBot.client.getApiClient();
    const botUserId = modBot.client.getUserId();
    console.log(`🤖 Moderator bot user ID from client: ${botUserId}`);

    if (!botUserId || botUserId === '222786447') {
      console.error(
        '❌ Bot is using wrong user ID! Expected bot ID, got channel owner ID'
      );
      return;
    }

    try {
      // Get user ID
      const user = await apiClient.users.getUserByName(username);
      console.log('🔍 User:', user);
      if (!user) {
        console.error(`❌ User ${username} not found`);
        return;
      }

      // Get broadcaster ID
      const broadcaster = await apiClient.users.getUserByName(this.channelName);
      console.log('🔍 Broadcaster:', broadcaster);
      if (!broadcaster) {
        console.error('❌ Broadcaster not found');
        return;
      }

      console.log(
        `⏱️ Attempting to timeout user ${user.name} (${user.id}) in channel ${broadcaster.name} (${broadcaster.id})`
      );

      // Execute the timeout
      // For Twurple, we need to specify which user context to use for the API call
      console.log(`🔐 Executing timeout as bot user: ${botUserId}`);

      if (!botUserId) {
        console.error('❌ Bot user ID is not available');
        return;
      }

      await apiClient.asUser(botUserId, async (userApiClient) => {
        await userApiClient.moderation.banUser(broadcaster.id, {
          user: user.id,
          duration: duration || 10,
          reason: reason || 'Violation of chat rules',
        });
      });

      console.log(`✅ Successfully timed out ${username} for ${duration}s`);
    } catch (error) {
      console.error(`❌ Failed to timeout ${username}:`, error);
    }
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
   * Build system prompt for regular bots
   */
  private buildSystemPrompt(botName: BotName): string {
    const personality = getBotPersonality(botName);
    return `${personality.systemPrompt}\n\nYou are ${botName}. Remember: 
- Write ONLY your direct response, no [name]: prefixes
- Do NOT roleplay as other bots or
    continue their
    messages - When;
    you;
    see[otherbot];
    : message, that's just context - don't mimic that format
- When someone mentions
    @$
    botName;
    , they are talking TO YOU. You ARE $
    botName
    , so respond accordingly`;
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
