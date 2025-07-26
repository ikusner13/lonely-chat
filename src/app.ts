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

    this.logger.info('🤖 Creating bots from configuration...');
    const config = getBotConfig();

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
          this.logger.error(
            { err: error },
            `❌ Failed to create bot: ${botName}`
          );
          throw error;
        }
      })
    );

    this.chatListener = new ChatListenerService();

    const channelToken = await this.tokenManager.getChannelToken();
    if (!channelToken) {
      throw new Error(
        'Channel token not found. Run: bun run generate-channel-token'
      );
    }

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

    const isOnline = await this.stream.isStreamOnline();
    if (isOnline) {
      this.logger.info('🟢 Stream is already online, connecting bots...');
      this.connectAll();
    } else {
      this.logger.info(
        '⏸️  Stream is offline, waiting for stream to go online...'
      );
    }

    this.logger.info('✅ App started successfully!');
  }

  private handleIncomingMessage(msg: ChatMessage) {
    this.logger.debug({ chatMessage: msg }, 'Received message');
    this.messageWindow.addMessage(msg);

    const botsToRespond = this.determineRespondingBots(msg);

    this.queueBotResponses(botsToRespond, msg);
  }

  private determineRespondingBots(msg: ChatMessage): BotName[] {
    const botsToRespond: BotName[] = [];

    for (const [botName] of this.bots) {
      if (this.isBotOwnMessage(msg, botName)) {
        continue;
      }

      if (this.isBotMentioned(msg, botName)) {
        botsToRespond.push(botName);
      } else if (this.shouldBotRandomlyRespond(botsToRespond)) {
        botsToRespond.push(botName);
      }
    }

    return botsToRespond;
  }

  private isBotOwnMessage(msg: ChatMessage, botName: BotName): boolean {
    return msg.user.toLowerCase() === botName.toLowerCase();
  }

  private isBotMentioned(msg: ChatMessage, botName: BotName): boolean {
    return msg.message.toLowerCase().includes(`@${botName.toLowerCase()}`);
  }

  private shouldBotRandomlyRespond(botsAlreadyResponding: BotName[]): boolean {
    const RANDOM_RESPONSE_CHANCE = 0.25;
    return (
      botsAlreadyResponding.length === 0 &&
      Math.random() < RANDOM_RESPONSE_CHANCE
    );
  }

  private queueBotResponses(botsToRespond: BotName[], msg: ChatMessage): void {
    for (const botName of botsToRespond) {
      const bot = this.bots.get(botName);

      if (!bot) {
        this.logger.error(`Bot ${botName} not found`);
        continue;
      }

      this.queue.addMessage(botName, async () => {
        try {
          const response = await this.ai.generateResponse({
            botName,
            triggerMessage: `${msg.user}: ${msg.message}`,
            context: this.messageWindow.messages,
          });
          this.logger.debug({ response }, 'Generated response');
          if (response) {
            bot.say(response);
          }
        } catch (error) {
          this.logger.error(
            { err: error },
            `Error generating response for ${botName}`
          );
        }
      });
    }
  }

  private async connectAll() {
    // Wire up message handler
    this.chatListener.on('message', (msg) => {
      this.logger.info({ chatMessage: msg }, 'Received message');

      if (this.moderatorBot.canTimeoutUser(msg.role)) {
        this.moderatorBot.addToQueue(msg);
      }

      this.handleIncomingMessage(msg);
    });

    // Start listening to chat
    this.chatListener.start();
    this.logger.info('👂 Chat listener started');

    // Connect all bots
    await this.moderatorBot.joinChannel();
    const botConfig = getBotConfig();

    this.logger.info('👮 Moderator bot connected');
    // Send intro message for moderator bot
    setTimeout(() => {
      const moderatorBot = botConfig.neckbearddiscordmod;
      this.moderatorBot.say(moderatorBot.introMessage ?? '👋');
    }, 1000);

    for (const [name, bot] of this.bots) {
      bot.joinChannel();
      this.logger.info(`🤖 Bot ${name} connected`);

      const botPersonality = botConfig[name];

      bot.say(botPersonality.introMessage ?? '👋');
    }

    // this.moderatorBot.on('moderate', async (messages) => {
    //   this.logger.info({ messages }, 'Moderation queue received');

    //   const moderationResults = await this.ai.generateModerationResponse({
    //     moderatorBotName: 'neckbearddiscordmod',
    //     messages,
    //   });

    //   this.logger.info({ moderationResults }, 'Moderation results');

    //   if (!moderationResults) {
    //     return;
    //   }

    //   if (moderationResults.violations.length === 0) {
    //     this.logger.info('No violations found');
    //     return;
    //   }

    //   await Promise.all(
    //     moderationResults.violations.map((result) => {
    //       const chatMessage = messages.find((m) => m.user === result.user);

    //       if (!chatMessage) {
    //         return Promise.resolve();
    //       }

    //       return this.moderatorBot.timeout({
    //         user: result.user,
    //         duration: result.duration,
    //         reason: result.reason,
    //       });
    //     })
    //   );
    // });
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

    this.moderatorBot.stopQueueCheckInterval();
    this.logger.info('👮 Moderator bot moderation queue stopped');
  }
}
