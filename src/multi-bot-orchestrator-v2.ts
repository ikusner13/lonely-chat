import type { BotName } from './config/bot.schema';
import type { BotManager } from './services/bot-manager.service';
import type { ScheduledResponse } from './services/message-router.service';

export interface OrchestratorConfig {
  minResponseDelay: number;
  maxResponseDelay: number;
  conversationTimeoutMs: number;
  greetingResponseChance: number;
}

export class MultiBotOrchestratorV2 {
  private config: OrchestratorConfig;
  private botManager: BotManager;

  constructor(botManager: BotManager, config?: Partial<OrchestratorConfig>) {
    this.config = {
      minResponseDelay: 1000, // 1 second
      maxResponseDelay: 5000, // 5 seconds
      conversationTimeoutMs: 30_000, // 30 seconds
      greetingResponseChance: 0.2, // 20% chance
      ...config,
    };

    this.botManager = botManager;
  }

  determineResponses(
    mentions: BotName[],
    shouldRespond: boolean
  ): ScheduledResponse[] {
    const responses: ScheduledResponse[] = [];

    // Direct mentions have highest priority
    if (mentions.length > 0) {
      mentions.forEach((botName, index) => {
        responses.push({
          botName,
          delay: this.calculateDelay(index, 'high'),
          priority: 'high',
        });
      });
    } else if (shouldRespond) {
      const randomBot = this.selectRandomBot();

      responses.push({
        botName: randomBot,
        delay: this.calculateDelay(0, 'high'),
        priority: 'high',
      });
    }

    return responses;
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

  private selectRandomBot(): BotName {
    const bots = this.botManager.getBotNames() as BotName[];

    return bots[Math.floor(Math.random() * bots.length)];
  }
}
