import PQueue from 'p-queue';
import { createLogger } from '@/utils/logger';

export class ChatbotQueue {
  private readonly mainQueue: PQueue;
  private readonly botQueues: Map<string, PQueue>;
  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly logger = createLogger('ChatbotQueue');

  constructor(minDelay = 1000, maxDelay = 3000) {
    this.mainQueue = new PQueue({ concurrency: 5 });
    this.botQueues = new Map();
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
  }

  addMessage(botName: string, messageAction: () => Promise<void>): void {
    this.mainQueue.add(() => {
      let botQueue = this.botQueues.get(botName);
      if (!botQueue) {
        botQueue = new PQueue({ concurrency: 1 });
        this.botQueues.set(botName, botQueue);
      }

      botQueue.add(async () => {
        await this.randomDelay(this.minDelay, this.maxDelay);
        return messageAction();
      });
    });
  }

  stop(): void {
    this.logger.info('🧹 Clearing message queue');
    this.mainQueue.clear();
    for (const botQueue of this.botQueues.values()) {
      botQueue.clear();
    }
  }

  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
