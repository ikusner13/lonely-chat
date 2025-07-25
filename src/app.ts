import type { BotName } from '@/config/bot.schema';
import { BOTS, getBotConfig } from '@/config/bot.schema';
import { env } from '@/env';
import { AIService } from './services/ai.service';
import {
  ChatListenerService,
  type ChatMessage,
} from './services/chat-listener.service';
import { ChatMessageWindow } from './services/chat-message-window';
import { ChatbotService } from './services/chatbot.service';
import { ChatbotQueue } from './services/chatbot-queue';
import { ModeratorBotService } from './services/moderatorbot.service';
import { StreamService } from './services/stream.service';
import { TokenManager } from './services/token.service';
import { createLogger } from './utils/logger';

export class App {
  private chatListener!: ChatListenerService;
  private messageWindow!: ChatMessageWindow;
  private bots: Map<BotName, ChatbotService> = new Map();
  private moderatorBot!: ModeratorBotService;
  private queue!: ChatbotQueue;
  private ai!: AIService;
  private stream!: StreamService;
  private tokenManager!: TokenManager;
  private logger = createLogger('App');

  async start() {
    this.logger.info('🚀 Starting Twitch Bot App...');

    // Initialize core services
    this.tokenManager = new TokenManager();
    this.ai = new AIService();
    this.messageWindow = new ChatMessageWindow();
    this.queue = new ChatbotQueue();

    // Create bots based on configuration
    this.logger.info('🤖 Creating bots from configuration...');
    const config = getBotConfig();
    
    // Create all bots concurrently
    await Promise.all(
      BOTS.map(async (botName) => {
        try {
          const botPersonality = config[botName];
          if (botPersonality.isModerator) {
            // Create moderator bot
            this.logger.info(`👮 Creating moderator bot: ${botName}...`);
            this.moderatorBot = await ModeratorBotService.create(
              this.tokenManager,
              botName
            );
            this.logger.info(`✅ Created moderator bot: ${botName}`);
          } else {
            // Create regular bot
            const bot = await ChatbotService.create(this.tokenManager, botName);
            this.bots.set(botName, bot);
            this.logger.info(`✅ Created bot: ${botName}`);
          }
        } catch (error) {
          this.logger.error({ err: error }, `❌ Failed to create bot: ${botName}`);
          throw error;
        }
      })
    );

    // Create chat listener (but don't start yet)
    this.chatListener = new ChatListenerService();

    // Get channel token for stream service
    const channelToken = await this.tokenManager.getChannelToken();
    if (!channelToken) {
      throw new Error(
        'Channel token not found. Run: bun run generate-channel-token'
      );
    }

    // Stream lifecycle - this is what controls everything
    this.logger.info('📡 Setting up stream monitoring...');
    this.stream = await StreamService.create({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      channelUserId: env.TWITCH_CHANNEL_ID,
      tokenManager: this.tokenManager,
      channelToken,
      onStreamOnline: () => {
        this.logger.info('🟢 Stream is online! Connecting bots...');
        this.connectAll();
      },
      onStreamOffline: () => {
        this.logger.info('🔴 Stream is offline! Disconnecting bots...');
        this.disconnectAll();
      },
    });

    // Check if stream is already online
    const isOnline = await this.stream.isStreamOnline();
    if (isOnline) {
      this.logger.info('🟢 Stream is already online, connecting bots...');
      this.connectAll();
    } else {
      this.logger.info('⏸️  Stream is offline, waiting for stream to go online...');
    }

    this.logger.info('✅ App started successfully!');
  }

  private async handleIncomingMessage(msg: ChatMessage) {
    // Add to context window
    this.messageWindow.addMessage(msg);

    // Don't process messages from our own bots
    if (BOTS.includes(msg.user.toLowerCase() as BotName)) {
      return;
    }

    // Check moderation first
    const shouldModerate = await this.checkModeration(msg);
    if (shouldModerate) {
      this.queue.addMessage('neckbearddiscordmod', async () => {
        await this.moderatorBot.timeout({
          chatMessage: msg,
          duration: 60,
          reason: 'Violated community guidelines',
        });
        this.moderatorBot.say(
          `${msg.user} has been timed out for inappropriate behavior`
        );
      });
      return;
    }

    // Check which bots should respond
    const botsToRespond: BotName[] = [];

    for (const [botName] of this.bots) {
      // Check if bot is mentioned
      if (msg.message.toLowerCase().includes(`@${botName.toLowerCase()}`)) {
        botsToRespond.push(botName);
      }
      // Or if bot should randomly respond (only if no mentions)
      else if (botsToRespond.length === 0 && Math.random() < 0.25) {
        botsToRespond.push(botName);
      }
    }

    // Queue responses for all bots that should respond
    for (const botName of botsToRespond) {
      const bot = this.bots.get(botName);

      if (!bot) {
        this.logger.error(`Bot ${botName} not found`);
        continue;
      }

      // Queue AI generation + response
      this.queue.addMessage(botName, async () => {
        try {
          const response = await this.ai.generateResponse({
            botName,
            triggerMessage: `${msg.user}: ${msg.message}`,
            context: this.messageWindow.messages,
          });
          if (response) {
            bot.say(response);
          }
        } catch (error) {
          this.logger.error({ err: error }, `Error generating response for ${botName}`);
        }
      });
    }
  }

  private checkModeration(msg: ChatMessage): Promise<boolean> {
    return new Promise((resolve) => {
      this.ai
        .generateModerationResponse({
          botName: 'neckbearddiscordmod',
          triggerMessage: msg.message,
          triggerUser: msg.user,
          onModAction: () => resolve(true),
        })
        .then(() => resolve(false))
        .catch((error) => {
          this.logger.error({ err: error }, 'Error checking moderation');
          resolve(false); // Don't moderate on error
        });
    });
  }

  private connectAll() {
    // Wire up message handler
    this.chatListener.on('message', (msg) => this.handleIncomingMessage(msg));

    // Start listening to chat
    this.chatListener.start();
    this.logger.info('👂 Chat listener started');

    // Connect all bots
    this.moderatorBot.joinChannel();
    this.logger.info('👮 Moderator bot connected');

    for (const [name, bot] of this.bots) {
      bot.joinChannel();
      this.logger.info(`🤖 Bot ${name} connected`);
    }
  }

  private disconnectAll() {
    // Stop listening to chat
    this.chatListener.stop();
    this.logger.info('🔇 Chat listener stopped');

    // Disconnect all bots
    this.moderatorBot.leaveChannel();
    this.logger.info('👮 Moderator bot disconnected');

    for (const [name, bot] of this.bots) {
      bot.leaveChannel();
      this.logger.info(`🤖 Bot ${name} disconnected`);
    }

    // Clear any pending messages
    this.queue.stop();
    this.logger.info('🧹 Message queue cleared');
  }
}
