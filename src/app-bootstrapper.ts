import { getBotConfig } from './config/bot.schema';
import { env } from './env';
import { MultiBotOrchestratorV2 } from './multi-bot-orchestrator-v2';
import { AIService } from './services/ai.service';
import { BotManager } from './services/bot-manager.service';
import { ConversationManager } from './services/conversation.service';
import { MessageRouter } from './services/message-router.service';
import { StreamService } from './services/stream.service';
import { StreamLifecycleManager } from './services/stream-lifecycle-manager.service';
import { TokenManager } from './services/token.service';

export interface ServiceContainer {
  tokenManager: TokenManager;
  conversationManager: ConversationManager;
  aiService: AIService;
  botManager: BotManager;
  streamService: StreamService;
  streamLifecycleManager: StreamLifecycleManager;
  messageRouter: MessageRouter;
  orchestrator: MultiBotOrchestratorV2;
}

export class Application {
  private services: ServiceContainer;

  constructor(services: ServiceContainer) {
    this.services = services;
  }

  async start(): Promise<void> {
    console.log('🎮 Starting application...');

    // Set up message handlers
    this.services.messageRouter.setupMessageHandlers(env.TWITCH_CHANNEL_NAME);

    // Start stream lifecycle management
    const tokens = await this.services.tokenManager.loadTokens();
    if (tokens.channel) {
      await this.services.streamLifecycleManager.start(tokens.channel);
    }

    console.log('✅ Application started successfully');
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down application...');

    // Stop services in reverse order
    this.services.messageRouter.stop();
    await this.services.streamLifecycleManager.stop();
    this.services.conversationManager.stop();
    await this.services.botManager.cleanup();

    console.log('✅ Application shut down gracefully');
  }

  getServices(): ServiceContainer {
    return this.services;
  }
}

export class AppBootstrapper {
  async bootstrap(): Promise<Application> {
    console.log('🚀 Bootstrapping application...');

    try {
      // Initialize services
      const services = await this.initializeServices();

      // Wire up event handlers
      this.wireEventHandlers(services);

      // Create application instance
      const app = new Application(services);

      return app;
    } catch (error) {
      console.error('❌ Failed to bootstrap application:', error);
      throw error;
    }
  }

  private async initializeServices(): Promise<ServiceContainer> {
    console.log('📦 Initializing services...');

    // Initialize token manager
    const tokenManager = new TokenManager();
    const tokens = await tokenManager.loadTokens();

    if (!tokens.channel) {
      throw new Error(
        'No channel tokens found. Run: bun run generate-channel-token'
      );
    }

    // Initialize core services
    const conversationManager = new ConversationManager();
    const aiService = new AIService(conversationManager);

    // Initialize bot manager
    const botManager = new BotManager({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      tokenManager,
    });

    // Initialize all bot clients with configuration
    await botManager.initializeAllBots(getBotConfig());

    // Initialize stream service
    const streamService = new StreamService(
      env.TWITCH_CLIENT_ID,
      env.TWITCH_CLIENT_SECRET,
      env.TWITCH_CHANNEL_NAME
    );
    await streamService.initialize(tokens.channel);

    // Initialize stream lifecycle manager
    const streamLifecycleManager = new StreamLifecycleManager(
      streamService,
      botManager,
      tokenManager
    );

    // Create orchestrator with pure coordination logic
    const orchestrator = new MultiBotOrchestratorV2(botManager);

    // Initialize message router
    const messageRouter = new MessageRouter(
      botManager,
      aiService,
      orchestrator
    );

    return {
      tokenManager,
      conversationManager,
      aiService,
      botManager,
      streamService,
      streamLifecycleManager,
      messageRouter,
      orchestrator,
    };
  }

  private wireEventHandlers(services: ServiceContainer): void {
    console.log('🔌 Wiring event handlers...');

    // Listen to stream lifecycle events
    services.streamLifecycleManager.on('stream:online', (broadcasterName) => {
      console.log(`📡 Stream online event received for ${broadcasterName}`);
    });

    services.streamLifecycleManager.on('stream:offline', (broadcasterName) => {
      console.log(`📡 Stream offline event received for ${broadcasterName}`);
    });

    services.streamLifecycleManager.on('bots:connected', () => {
      console.log('🤖 All bots connected to chat');
    });

    services.streamLifecycleManager.on('bots:disconnected', () => {
      console.log('🤖 All bots disconnected from chat');
    });

    services.streamLifecycleManager.on(
      'token:refreshed',
      (userId, _newToken) => {
        console.log(`🔑 Token refreshed for user ${userId}`);
      }
    );
  }
}
