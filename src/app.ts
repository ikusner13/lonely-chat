import { env } from '@/env';
import { AIService } from './services/ai.service';
import { BotManager } from './services/bot-manager';
import { BotResponseCoordinator } from './services/bot-response-coordinator';
import { ChatListenerService } from './services/chat-listener.service';
import { ChatMessageWindow } from './services/chat-message-window';
import { ChatbotQueue } from './services/chatbot-queue';
import { ConfigManager } from './services/config-manager';
import { StreamService } from './services/stream.service';
import { TokenManager } from './services/token.service';
import { createLogger } from './utils/logger';

export class App {
  private chatListener!: ChatListenerService;
  private messageWindow!: ChatMessageWindow;
  private botManager!: BotManager;
  private ai!: AIService;
  private tokenManager!: TokenManager;
  private responseCoordinator!: BotResponseCoordinator;
  private configManager!: ConfigManager;
  private streamService?: StreamService;
  private logger = createLogger('App');

  async start() {
    this.logger.info('🚀 Starting Twitch Bot App...');

    await this.initializeServices();
    await this.connectStream();

    this.logger.info('✅ App started successfully!');
  }

  private async initializeServices() {
    // Initialize config first
    this.configManager = new ConfigManager();
    await this.configManager.initialize();

    // Set up config update handler
    this.configManager.on('config:updated', () => {
      this.updateAllBotConfigs();
    });

    // Core services
    this.tokenManager = new TokenManager({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      dbPath: process.env.TOKEN_DB_PATH || './tokens.db'
    });
    this.ai = new AIService();
    this.messageWindow = new ChatMessageWindow();
    const queue = new ChatbotQueue();

    // Bot management
    this.botManager = new BotManager();
    await this.botManager.initialize(this.tokenManager, this.configManager);

    // Response coordination
    this.responseCoordinator = new BotResponseCoordinator(
      this.ai,
      queue,
      this.messageWindow,
      this.botManager.getBots(),
      this.configManager
    );

    // Chat listener
    this.chatListener = new ChatListenerService();
  }

  private async connectStream() {
    this.logger.info('📡 Setting up stream monitoring...');
    this.streamService = await StreamService.createAndMonitor({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      channelUserId: env.TWITCH_CHANNEL_ID,
      tokenManager: this.tokenManager,
    });

    this.streamService.on('stream:online', async () => this.connectAll());
    this.streamService.on('stream:offline', () => this.disconnectAll());
  }

  private async connectAll() {
    // Set up message listeners
    this.chatListener.on('message', (msg) => {
      this.botManager.handleMessage(msg);
      this.responseCoordinator.handleIncomingMessage(msg);
    });

    this.chatListener.start();
    await this.botManager.connectAll(this.ai);
  }

  private disconnectAll() {
    this.chatListener.stop();
    this.responseCoordinator.stop();
    this.botManager.disconnectAll();
  }

  private updateAllBotConfigs() {
    this.logger.info('Updating all bot configs...');

    // Get fresh config
    const bots = this.configManager.getBots();

    // Update each bot's config
    const botServices = this.botManager.getBots();
    for (const botConfig of bots) {
      if (botConfig.role === 'moderator') {
        // Update moderator bot config
        this.botManager.updateModeratorConfig(botConfig);
      } else {
        // Update regular bot config
        const bot = botServices.get(botConfig.name);
        if (bot) {
          bot.updateConfig(botConfig);
        }
      }
    }

    // Let response coordinator refresh its view
    this.responseCoordinator.refreshBotConfigs(this.configManager);
  }

  // Getter for signal handler access
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  async destroy(): Promise<void> {
    this.logger.info('Destroying app services...');

    // Stop stream service first
    if (this.streamService) {
      await this.streamService.stop();
    }

    // Stop bot manager
    if (this.botManager) {
      this.botManager.destroy();
    }

    // Stop response coordinator
    if (this.responseCoordinator) {
      this.responseCoordinator.destroy();
    }

    // Stop config manager
    if (this.configManager) {
      this.configManager.destroy();
    }

    this.logger.info('App destroyed successfully');
  }
}
