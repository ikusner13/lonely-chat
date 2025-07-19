import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, streamText } from "ai";

// Bot personality configuration
export interface BotPersonality {
  name: string;
  model: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFrequency?: number; // 0-1, how often this bot responds
  interests?: string[]; // Topics this bot is interested in
}

// Message type for conversation history
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  author?: string; // For identifying who said what
}

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

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenRouter API key is required");
    }

    this.openrouter = createOpenRouter({
      apiKey,
    });

    // Start cleanup interval for old conversations
    setInterval(() => this.cleanupOldConversations(), 10 * 60 * 1000); // Every 10 minutes
  }

  /**
   * Generate a response for a bot in a channel
   */
  async generateResponse(
    channelName: string,
    botName: string,
    triggerMessage: string | null,
    triggerUser: string | null,
    personality: BotPersonality,
    otherBots: string[] = []
  ): Promise<string | null> {
    try {
      // Get or create conversation context
      const context = this.getOrCreateContext(channelName);

      // If there's a trigger message, add it to context first
      if (triggerMessage && triggerUser) {
        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          role: "user",
          content: `${triggerUser}: ${triggerMessage}`,
          timestamp: new Date(),
          author: triggerUser,
        };

        // Add to shared context
        context.messages.push(userMessage);
      }

      // Build the messages for this specific bot
      const messages = this.buildMessagesForBot(
        context,
        personality,
        botName,
        otherBots
      );

      // Convert messages to AI SDK format
      const aiMessages = this.convertToAIMessages(messages);

      // Debug logging
      console.log("Personality:", personality);
      console.log("Model:", personality?.model);

      if (!personality || !personality.model) {
        throw new Error(`Invalid personality configuration for ${botName}`);
      }

      // Generate response using the AI model
      const result = await generateText({
        model: this.openrouter.chat(personality.model),
        system: this.buildSystemPrompt(personality, botName, otherBots),
        messages: aiMessages,
        temperature: personality.temperature || 0.7,
        maxOutputTokens: personality.maxTokens || 150,
      });

      // Add the bot's response to shared context
      const botMessage: ChatMessage = {
        id: Date.now().toString(),
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
   * Build system prompt that includes awareness of other bots
   */
  private buildSystemPrompt(
    personality: BotPersonality,
    botName: string,
    otherBots: string[]
  ): string {
    let prompt = personality.systemPrompt;

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
    personality: BotPersonality,
    botName: string,
    otherBots: string[]
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
  private convertToAIMessages(
    messages: ChatMessage[]
  ): Array<{ role: "user" | "assistant" | "system"; content: string }> {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Set a conversation topic
   */
  setTopic(channelName: string, topic: string): void {
    const context = this.getOrCreateContext(channelName);
    context.currentTopic = topic;

    // Add a system message about the topic
    context.messages.push({
      id: Date.now().toString(),
      role: "system",
      content: `New conversation topic: ${topic}`,
      timestamp: new Date(),
      author: "System",
    });
  }

  /**
   * Get current conversation participants
   */
  getParticipants(channelName: string): string[] {
    const context = this.conversations.get(channelName);
    return context ? Array.from(context.participants) : [];
  }

  /**
   * Check if conversation is active
   */
  isConversationActive(channelName: string): boolean {
    const context = this.conversations.get(channelName);
    if (!context) return false;

    const timeSinceLastActivity = Date.now() - context.lastActivity.getTime();
    return timeSinceLastActivity < 5 * 60 * 1000; // Active if within 5 minutes
  }

  /**
   * Clear conversation context for a channel
   */
  clearContext(channelName: string): void {
    this.conversations.delete(channelName);
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

  /**
   * Analyze if a message should trigger bot responses
   */
  analyzeMessageTriggers(
    message: string,
    username: string,
    botNames: string[]
  ): {
    shouldRespond: boolean;
    mentionedBots: string[];
    isQuestion: boolean;
    isGreeting: boolean;
    sentiment: "positive" | "negative" | "neutral";
  } {
    const lowerMessage = message.toLowerCase();

    // Check for bot mentions
    const mentionedBots = botNames.filter(
      (botName) =>
        lowerMessage.includes(botName.toLowerCase()) ||
        lowerMessage.includes(`@${botName.toLowerCase()}`)
    );

    // Check if it's a question
    const isQuestion =
      message.includes("?") ||
      lowerMessage.match(
        /^(what|when|where|who|why|how|is|are|can|could|would|should)\b/
      ) !== null;

    // Check for greetings
    const greetings = [
      "hello",
      "hi",
      "hey",
      "sup",
      "yo",
      "howdy",
      "greetings",
      "morning",
      "evening",
    ];
    const isGreeting = greetings.some((greeting) =>
      lowerMessage.includes(greeting)
    );

    // Simple sentiment analysis
    const positiveWords = [
      "good",
      "great",
      "awesome",
      "love",
      "nice",
      "amazing",
      "lol",
      "haha",
    ];
    const negativeWords = [
      "bad",
      "hate",
      "sucks",
      "awful",
      "terrible",
      "worst",
    ];

    const positiveCount = positiveWords.filter((word) =>
      lowerMessage.includes(word)
    ).length;
    const negativeCount = negativeWords.filter((word) =>
      lowerMessage.includes(word)
    ).length;

    let sentiment: "positive" | "negative" | "neutral" = "neutral";
    if (positiveCount > negativeCount) sentiment = "positive";
    else if (negativeCount > positiveCount) sentiment = "negative";

    // Determine if bots should respond
    const shouldRespond = mentionedBots.length > 0 || isQuestion || isGreeting;

    return {
      shouldRespond,
      mentionedBots,
      isQuestion,
      isGreeting,
      sentiment,
    };
  }
}

// Example bot personalities for multi-bot conversations
export const BOT_PERSONALITIES: Record<string, BotPersonality> = {
  stickyman1776: {
    name: "Stickyman1776",
    model: "moonshotai/kimi-k2:free",
    systemPrompt: `You are the ultimate positive supporter in chat! You're always encouraging, celebrating wins, and keeping morale high. You use lots of hype emotes and positive language. You're genuinely enthusiastic about everything and love to cheer for both the streamer and other chatters.`,
    temperature: 0.8,
    maxTokens: 100,
    responseFrequency: 0.8,
    interests: ["celebrations", "achievements", "positivity", "encouragement"],
  },
};
