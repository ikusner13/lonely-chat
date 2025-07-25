import type { BotConfig, BotName, BotPersonality } from '@/config/bot.schema';
import { BOTS } from '@/config/bot.schema';
import type { ChatMessage } from './chat-listener.service';

export class RouterService {
  private readonly botConfig: BotConfig;

  constructor(botConfig: BotConfig) {
    this.botConfig = botConfig;
  }

  determineSender(message: ChatMessage): BotPersonality | null {
    const user = message.user;

    if (BOTS.includes(user as BotName)) {
      return this.botConfig[user as BotName];
    }

    return null;
  }
}
