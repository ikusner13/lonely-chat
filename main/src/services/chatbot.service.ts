import type { RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import { createLogger } from '@/shared/logger';
import type { TokenManager } from '@/shared/token.service';
import { env } from '../env';
import type { BotConfig } from './config-manager';

export class ChatbotService {
  private readonly bot: ChatClient;
  private readonly authProvider_: RefreshingAuthProvider;
  private readonly twitchChannel = env.TWITCH_CHANNEL_NAME;
  private readonly botName_: string;
  private config: BotConfig;
  private logger = createLogger('ChatbotService');

  private constructor(
    authProvider: RefreshingAuthProvider,
    bot: ChatClient,
    botName: string,
    config: BotConfig
  ) {
    this.authProvider_ = authProvider;
    this.bot = bot;
    this.botName_ = botName;
    this.config = config;
  }

  static async create(
    tokenManager: TokenManager,
    botName: string,
    config: BotConfig
  ): Promise<ChatbotService> {
    try {
      const authProvider = await tokenManager.getAuthProvider(botName);

      const bot = new ChatClient({
        authProvider,
        channels: [env.TWITCH_CHANNEL_NAME],
      });

      return new ChatbotService(authProvider, bot, botName, config);
    } catch (error) {
      throw new Error(
        `Failed to create ChatbotService: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  get authProvider(): RefreshingAuthProvider {
    return this.authProvider_;
  }

  get botName(): string {
    return this.botName_;
  }

  getName(): string {
    return this.botName_;
  }

  say(message: string): void {
    this.bot.say(this.twitchChannel, message);
  }

  joinChannel(): void {
    this.bot.connect();
  }

  leaveChannel(): void {
    this.bot.quit();
  }

  connectAndIntroduce(): void {
    this.joinChannel();
    this.say(this.config.introMessage ?? '👋');
  }

  updateConfig(newConfig: BotConfig): void {
    this.config = newConfig;
    this.logger.info(`Updated config for ${this.botName_}`);
  }

  getConfig(): BotConfig {
    return this.config;
  }
}
