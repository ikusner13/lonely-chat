import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, ModelMessage, streamText, UIMessage } from "ai";

// Bot personality configuration
export interface BotPersonality {
  name: string;
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

// Message type for conversation history
export type ChatMessage = ModelMessage & {
  timestamp: Date;
  author?: string; // For identifying who said what
};

// Shared conversation context for a channel
export interface ConversationContext {
  channelName: string;
  messages: ChatMessage[];
  lastActivity: Date;
  currentTopic?: string;
  participants: Set<string>; // Track who's in the conversation
}

export class AIService {
  private openrouter;
  private conversations: Map<string, ConversationContext> = new Map();
  private maxContextMessages = 50; // Higher limit for multi-bot conversations
  private contextTimeoutMs = 60 * 60 * 1000; // 1 hour for multi-bot convos

  constructor() {
    this.openrouter = createOpenRouter();

    // Start cleanup interval for old conversations
    setInterval(() => this.cleanupOldConversations(), 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Generate a response for a bot in a channel
   */
  async generateResponse({
    channelName,
    botName,
    triggerMessage,
    triggerUser,
    otherBots = [],
  }: {
    channelName: string;
    botName: BotName;
    triggerMessage: string | null;
    triggerUser: string | null;
    otherBots: BotName[];
  }): Promise<string | null> {
    try {
      // Get or create conversation context
      const context = this.getOrCreateContext(channelName);

      // If there's a trigger message, add it to context first
      if (triggerMessage && triggerUser) {
        const userMessage: ChatMessage = {
          role: "user",
          content: `${triggerUser}: ${triggerMessage}`,
          timestamp: new Date(),
          author: triggerUser,
        };

        // Add to shared context
        context.messages.push(userMessage);
      }

      // Build the messages for this specific bot
      const messages = this.buildMessagesForBot(context, botName);

      // Convert messages to AI SDK format
      const aiMessages = this.convertToAIMessages(messages);

      const personality = BOT_PERSONALITIES[botName];

      // Debug logging
      console.log("Personality:", personality);
      console.log("Model:", personality.model);

      // Generate response using the AI model
      const result = await generateText({
        model: this.openrouter.chat(personality.model),
        system: this.buildSystemPrompt(botName, otherBots),
        messages: aiMessages,
        temperature: personality.temperature || 0.7,
        maxOutputTokens: personality.maxTokens || 150,
      });

      // Add the bot's response to shared context
      const botMessage: ChatMessage = {
        role: "assistant",
        content: result.text,
        timestamp: new Date(),
        author: botName,
      };
      context.messages.push(botMessage);

      // Track participant
      context.participants.add(botName);
      if (triggerUser) {
        context.participants.add(triggerUser);
      }

      // Update last activity
      context.lastActivity = new Date();

      // Trim context if needed
      this.trimContext(context);

      return result.text;
    } catch (error) {
      console.error(`Error generating AI response for ${botName}:`, error);
      return null;
    }
  }

  /**
   * Clear conversation context for a channel
   */
  clearContext(channelName: string): void {
    this.conversations.delete(channelName);
  }

  /**
   * Analyze if a message should trigger bot responses
   */
  analyzeMessageTriggers(
    message: string,
    botNames: BotName[]
  ): {
    shouldRespond: boolean;
    mentionedBots: BotName[];
  } {
    const lowerMessage = message.toLowerCase();

    // Check for bot mentions
    const mentionedBots = botNames.filter(
      (botName) =>
        lowerMessage.includes(botName.toLowerCase()) ||
        lowerMessage.includes(`@${botName.toLowerCase()}`)
    );

    // Determine if bots should respond
    const shouldRespond = mentionedBots.length > 0;

    return {
      shouldRespond,
      mentionedBots,
    };
  }

  /**
   * Build system prompt that includes awareness of other bots
   */
  private buildSystemPrompt(botName: BotName, otherBots: BotName[]): string {
    let prompt = BOT_PERSONALITIES[botName].systemPrompt;

    if (otherBots.length > 0) {
      prompt += `\n\nYou are ${botName}. You're chatting alongside these other bots: ${otherBots.join(
        ", "
      )}. `;
      prompt += `You can interact with them naturally, respond to their messages, and have conversations with them. `;
      prompt += `Remember each bot has their own personality - engage with them as you would with real people in chat.`;
    } else {
      prompt += `\n\nYou are ${botName}.`;
    }

    return prompt;
  }

  /**
   * Build messages array from bot's perspective
   */
  private buildMessagesForBot(
    context: ConversationContext,
    botName: BotName
  ): ChatMessage[] {
    // Convert shared context to bot's perspective
    return context.messages.map((msg) => {
      // If this is an assistant message from another bot, convert to user message
      if (msg.role === "assistant" && msg.author && msg.author !== botName) {
        return {
          ...msg,
          role: "user",
          content: `${msg.author}: ${msg.content}`,
        };
      }
      return msg;
    });
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

  /**
   * Get or create conversation context
   */
  private getOrCreateContext(channelName: string): ConversationContext {
    let context = this.conversations.get(channelName);

    if (!context) {
      context = {
        channelName,
        messages: [],
        lastActivity: new Date(),
        participants: new Set(),
      };
      this.conversations.set(channelName, context);
    }

    return context;
  }

  /**
   * Trim conversation context to prevent token overflow
   */
  private trimContext(context: ConversationContext): void {
    if (context.messages.length > this.maxContextMessages) {
      // Keep system messages and recent messages
      const systemMessages = context.messages.filter(
        (m) => m.role === "system"
      );
      const otherMessages = context.messages.filter((m) => m.role !== "system");

      // Keep more recent messages for multi-bot conversations
      const recentMessages = otherMessages.slice(-this.maxContextMessages);
      context.messages = [...systemMessages.slice(-5), ...recentMessages];
    }
  }

  /**
   * Clean up old conversations to prevent memory leaks
   */
  private cleanupOldConversations(): void {
    const now = new Date();
    const cutoffTime = now.getTime() - this.contextTimeoutMs;

    for (const [channelName, context] of this.conversations.entries()) {
      if (context.lastActivity.getTime() < cutoffTime) {
        this.conversations.delete(channelName);
        console.log(`Cleaned up old conversation context for ${channelName}`);
      }
    }
  }
}

export type BotName = "stickyman1776";

export const BOT_PERSONALITIES: Record<BotName, BotPersonality> = {
  stickyman1776: {
    name: "Stickyman1776",
    model: "moonshotai/kimi-k2:free",
    systemPrompt: `You are the ultimate positive supporter in chat! You're always encouraging, celebrating wins, and keeping morale high. You use lots of hype emotes and positive language. You're genuinely enthusiastic about everything and love to cheer for both the streamer and other chatters.`,
    temperature: 0.8,
    maxTokens: 100,
  },
};
