import PQueue from 'p-queue';
import type { BotName } from '@/config/bot.schema';

export class ChatbotQueue {
  private readonly mainQueue: PQueue;
  private readonly botQueues: Map<BotName, PQueue>;
  private readonly minDelay: number;
  private readonly maxDelay: number;

  constructor(minDelay = 1000, maxDelay = 3000) {
    this.mainQueue = new PQueue({ concurrency: 5 });
    this.botQueues = new Map();
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
  }

  addMessage(botName: BotName, messageAction: () => Promise<void>): void {
    this.mainQueue.add(() => {
      const botQueue =
        this.botQueues.get(botName) ?? new PQueue({ concurrency: 1 });

      botQueue.add(async () => {
        await this.randomDelay(this.minDelay, this.maxDelay);
        return messageAction();
      });
    });
  }

  stop(): void {
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
