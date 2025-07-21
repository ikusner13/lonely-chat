import type { BotName } from './config/bot.schema';
import type {
  BotResponse,
  MessageContext,
} from './services/message-router.service';

interface ConversationState {
  isActive: boolean;
  lastSpeaker?: string;
  lastMessageTime: Date;
  messagesSinceLastBot: number;
}

export interface OrchestratorConfig {
  minResponseDelay: number;
  maxResponseDelay: number;
  maxBotsPerConversation: number;
  conversationTimeoutMs: number;
  greetingResponseChance: number;
}

export class MultiBotOrchestratorV2 {
  private conversationState: ConversationState;
  private config: OrchestratorConfig;

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = {
      minResponseDelay: 1000, // 1 second
      maxResponseDelay: 5000, // 5 seconds
      maxBotsPerConversation: 3,
      conversationTimeoutMs: 30_000, // 30 seconds
      greetingResponseChance: 0.2, // 20% chance
      ...config,
    };

    this.conversationState = {
      isActive: false,
      lastMessageTime: new Date(),
      messagesSinceLastBot: 0,
    };
  }

  determineResponses(context: MessageContext): BotResponse[] {
    const responses: BotResponse[] = [];

    // Update conversation state
    this.updateConversationState();

    // Direct mentions have highest priority
    if (context.mentionedBots.length > 0) {
      context.mentionedBots.forEach((botName, index) => {
        responses.push({
          botName,
          delay: this.calculateDelay(index, 'high'),
          priority: 'high',
        });
      });
    }

    // If no direct mentions, check other triggers
    // Greetings have low priority
    if (
      responses.length === 0 &&
      this.isGreeting(context.message) &&
      Math.random() < this.config.greetingResponseChance
    ) {
      const randomBot = this.selectRandomBot(context);
      if (randomBot) {
        responses.push({
          botName: randomBot,
          delay: this.calculateDelay(0, 'low'),
          priority: 'low',
        });
      }
    }

    // Limit responses per turn
    return responses.slice(0, this.config.maxBotsPerConversation);
  }

  private updateConversationState(): void {
    const now = new Date();
    const timeSinceLastMessage =
      now.getTime() - this.conversationState.lastMessageTime.getTime();

    // Check if conversation has timed out
    if (timeSinceLastMessage > this.config.conversationTimeoutMs) {
      this.conversationState.isActive = false;
      this.conversationState.messagesSinceLastBot = 0;
      this.conversationState.lastSpeaker = undefined;
    } else {
      this.conversationState.isActive = true;
      this.conversationState.messagesSinceLastBot++;
    }

    this.conversationState.lastMessageTime = now;
  }

  private calculateDelay(
    index: number,
    priority: 'high' | 'normal' | 'low'
  ): number {
    let baseDelay: number;

    switch (priority) {
      case 'high':
        baseDelay = this.config.minResponseDelay;
        break;
      case 'normal':
        baseDelay =
          (this.config.minResponseDelay + this.config.maxResponseDelay) / 2;
        break;
      case 'low':
        baseDelay = this.config.maxResponseDelay * 0.8;
        break;
      default:
        baseDelay = this.config.minResponseDelay;
        break;
    }

    // Add stagger delay for multiple bots
    const staggerDelay = index * 2000; // 2 seconds between bots

    // Add some randomness (0-1 second)
    const randomDelay = Math.random() * 1000;

    return baseDelay + staggerDelay + randomDelay;
  }

  private isGreeting(message: string): boolean {
    const greetings = [
      'hey',
      'hi',
      'hello',
      'sup',
      'yo',
      'whats up',
      "what's up",
    ];
    const lowerMessage = message.toLowerCase();
    return greetings.some((greeting) => lowerMessage.includes(greeting));
  }

  private selectRandomBot(_context: MessageContext): BotName | null {
    // This is a simplified version - in a real implementation,
    // you might want to select based on bot personality fit
    // For now, just return null and let the MessageRouter handle bot selection
    return null;
  }

  getConversationState(): ConversationState {
    return { ...this.conversationState };
  }
}
