import { env } from '@/env';
import { AIService } from './services/ai.service';
import { BotManager } from './services/bot-manager';
import { BotResponseCoordinator } from './services/bot-response-coordinator';
import { ChatListenerService } from './services/chat-listener.service';
import { ChatMessageWindow } from './services/chat-message-window';
import { ChatbotQueue } from './services/chatbot-queue';
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
  private logger = createLogger('App');

  async start() {
    this.logger.info('🚀 Starting Twitch Bot App...');

    // Initialize core services
    this.tokenManager = new TokenManager(
      process.env.TOKEN_DB_PATH || './tokens.db'
    );
    this.ai = new AIService();
    this.messageWindow = new ChatMessageWindow();
    const queue = new ChatbotQueue();

    // Initialize bot manager
    this.botManager = new BotManager();
    await this.botManager.initialize(this.tokenManager);

    // Initialize response coordinator after bots are created
    this.responseCoordinator = new BotResponseCoordinator(
      this.ai,
      queue,
      this.messageWindow,
      this.botManager.getBots()
    );

    this.chatListener = new ChatListenerService();

    await this.connectStream();

    this.logger.info('✅ App started successfully!');
  }

  private async connectStream() {
    this.logger.info('📡 Setting up stream monitoring...');
    const streamService = await StreamService.createAndMonitor({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      channelUserId: env.TWITCH_CHANNEL_ID,
      tokenManager: this.tokenManager,
    });

    streamService.on('stream:online', () => this.connectAll());
    streamService.on('stream:offline', () => this.disconnectAll());
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
}
