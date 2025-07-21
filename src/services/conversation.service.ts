import type { ModelMessage } from 'ai';

// Message type for conversation history
export type ChatMessage = ModelMessage & {
  timestamp: Date;
  sender: string; // For identifying who said what
};

// Shared conversation context for a channel
export interface ConversationContext {
  channelName: string;
  messages: ChatMessage[];
  lastActivity: Date;
  currentTopic?: string;
  participants: Set<string>; // Track who's in the conversation
}

export interface ConversationConfig {
  maxContextMessages?: number;
  contextTimeoutMs?: number;
  cleanupIntervalMs?: number;
}

export class ConversationManager {
  private conversations: Map<string, ConversationContext> = new Map();
  private maxContextMessages: number;
  private contextTimeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ConversationConfig = {}) {
    this.maxContextMessages = config.maxContextMessages || 50;
    this.contextTimeoutMs = config.contextTimeoutMs || 60 * 60 * 1000; // 1 hour

    // Start cleanup interval
    const cleanupIntervalMs = config.cleanupIntervalMs || 10 * 60 * 1000; // 10 minutes
    this.cleanupInterval = setInterval(
      () => this.cleanupOldConversations(),
      cleanupIntervalMs
    );
  }

  /**
   * Get or create conversation context for a channel
   */
  getOrCreateContext(channelName: string): ConversationContext {
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
   * Add a user message to the conversation
   */
  addUserMessage(channelName: string, user: string, message: string): void {
    const context = this.getOrCreateContext(channelName);

    const userMessage: ChatMessage = {
      role: 'user',
      content: `${user}: ${message}`,
      timestamp: new Date(),
      sender: user,
    };

    context.messages.push(userMessage);
    context.participants.add(user);
    context.lastActivity = new Date();

    this.trimContext(context);
  }

  /**
   * Add a bot response to the conversation
   */
  addBotResponse(channelName: string, botName: string, response: string): void {
    const context = this.getOrCreateContext(channelName);

    const botMessage: ChatMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      sender: botName,
    };

    context.messages.push(botMessage);
    context.participants.add(botName);
    context.lastActivity = new Date();

    this.trimContext(context);
  }

  /**
   * Get messages formatted for a specific bot's perspective
   */
  getMessagesForBot(channelName: string, botName: string): ChatMessage[] {
    const context = this.getOrCreateContext(channelName);

    // Convert shared context to bot's perspective
    return context.messages.map((msg) => {
      // If this is an assistant message from another bot, convert to user message
      if (msg.sender && msg.sender !== botName) {
        return {
          ...msg,
          role: 'user',
          content: `[${msg.sender}]: ${msg.content}`,
        };
      }
      return msg;
    });
  }

  /**
   * Get raw conversation context
   */
  getContext(channelName: string): ConversationContext | undefined {
    return this.conversations.get(channelName);
  }

  /**
   * Clear conversation context for a channel
   */
  clearContext(channelName: string): void {
    this.conversations.delete(channelName);
  }

  /**
   * Update conversation participants
   */
  addParticipant(channelName: string, participant: string): void {
    const context = this.getOrCreateContext(channelName);
    context.participants.add(participant);
  }

  /**
   * Check if conversation is active based on last activity
   */
  isConversationActive(channelName: string): boolean {
    const context = this.conversations.get(channelName);
    if (!context) {
      return false;
    }

    const timeSinceLastActivity = Date.now() - context.lastActivity.getTime();
    return timeSinceLastActivity < this.contextTimeoutMs;
  }

  /**
   * Trim conversation context to prevent token overflow
   */
  private trimContext(context: ConversationContext): void {
    if (context.messages.length > this.maxContextMessages) {
      // Keep system messages and recent messages
      const systemMessages = context.messages.filter(
        (m) => m.role === 'system'
      );
      const otherMessages = context.messages.filter((m) => m.role !== 'system');

      // Keep more recent messages
      const recentMessages = otherMessages.slice(-this.maxContextMessages);
      context.messages = [...systemMessages.slice(-5), ...recentMessages];
    }
  }

  /**
   * Clean up old conversations to prevent memory leaks
   */
  private cleanupOldConversations(): void {
    const now = Date.now();

    for (const [channelName, context] of this.conversations.entries()) {
      const timeSinceLastActivity = now - context.lastActivity.getTime();

      if (timeSinceLastActivity > this.contextTimeoutMs) {
        console.log(
          `🧹 Cleaning up old conversation for channel: ${channelName}`
        );
        this.conversations.delete(channelName);
      }
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): string[] {
    return Array.from(this.conversations.keys()).filter((channelName) =>
      this.isConversationActive(channelName)
    );
  }

  /**
   * Get conversation statistics
   */
  getStats(channelName: string): {
    messageCount: number;
    participantCount: number;
    duration: number;
  } | null {
    const context = this.conversations.get(channelName);
    if (!context) {
      return null;
    }

    const firstMessage = context.messages[0];
    const duration = firstMessage
      ? Date.now() - firstMessage.timestamp.getTime()
      : 0;

    return {
      messageCount: context.messages.length,
      participantCount: context.participants.size,
      duration,
    };
  }
}
