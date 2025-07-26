import { createLogger } from '@/utils/logger';
import type { AIService } from './ai.service';
import { createAllBots } from './bot-factory';
import type { ChatMessage } from './chat-listener.service';
import type { ChatbotService } from './chatbot.service';
import type { BotConfig, ConfigManager } from './config-manager';
import type { ModeratorBotService } from './moderatorbot.service';
import type { TokenManager } from './token.service';

export class BotManager {
  private bots: Map<string, ChatbotService> = new Map();
  private moderatorBot!: ModeratorBotService;
  private logger = createLogger('BotManager');

  async initialize(
    tokenManager: TokenManager,
    configManager: ConfigManager
  ): Promise<void> {
    const { bots, moderatorBot } = await createAllBots(
      tokenManager,
      configManager
    );
    this.bots = bots;
    this.moderatorBot = moderatorBot;
  }

  async connectAll(ai: AIService): Promise<void> {
    // Connect moderator bot
    await this.moderatorBot.setupAndConnect(ai);

    // Connect regular bots
    for (const [name, bot] of this.bots) {
      bot.connectAndIntroduce();
      this.logger.info(`🤖 Bot ${name} connected`);
    }
  }

  disconnectAll(): void {
    // Disconnect moderator bot
    this.moderatorBot.leaveChannel();
    this.logger.info('👮 Moderator bot disconnected');

    // Disconnect regular bots
    for (const [name, bot] of this.bots) {
      bot.leaveChannel();
      this.logger.info(`🤖 Bot ${name} disconnected`);
    }
  }

  handleMessage(msg: ChatMessage): void {
    this.moderatorBot.handleMessage(msg);
  }

  getBots(): Map<string, ChatbotService> {
    return this.bots;
  }

  updateModeratorConfig(config: BotConfig): void {
    if (this.moderatorBot) {
      this.moderatorBot.updateConfig(config);
    }
  }
}
