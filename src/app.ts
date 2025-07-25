import type { BotName } from '@/config/bot.schema';
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

export class App {
  private chatListener!: ChatListenerService;
  private messageWindow!: ChatMessageWindow;
  private bots: Map<BotName, ChatbotService> = new Map();
  private moderatorBot!: ModeratorBotService;
  private queue!: ChatbotQueue;
  private ai!: AIService;
  private stream!: StreamService;
  private tokenManager!: TokenManager;

  async start() {
    console.log('🚀 Starting Twitch Bot App...');

    // Initialize core services
    this.tokenManager = new TokenManager();
    this.ai = new AIService();
    this.messageWindow = new ChatMessageWindow();
    this.queue = new ChatbotQueue();

    // Create regular bots (but don't connect yet)
    console.log('🤖 Creating bots...');
    try {
      this.bots.set(
        'stickyman1776',
        await ChatbotService.create(this.tokenManager, 'stickyman1776')
      );
      console.log('✅ Created bot: stickyman1776');

      this.bots.set(
        'geneJacqueman',
        await ChatbotService.create(this.tokenManager, 'geneJacqueman')
      );
      console.log('✅ Created bot: geneJacqueman');
    } catch (error) {
      console.error('❌ Failed to create bots:', error);
      throw error;
    }

    // Create moderator bot (but don't connect yet)
    console.log('👮 Creating moderator bot...');
    try {
      this.moderatorBot = await ModeratorBotService.create(
        this.tokenManager,
        'neckbearddiscordmod'
      );
      console.log('✅ Created moderator bot: neckbearddiscordmod');
    } catch (error) {
      console.error('❌ Failed to create moderator bot:', error);
      throw error;
    }

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
    console.log('📡 Setting up stream monitoring...');
    this.stream = await StreamService.create({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      channelUserId: env.TWITCH_CHANNEL_ID,
      tokenManager: this.tokenManager,
      channelToken,
      onStreamOnline: () => {
        console.log('🟢 Stream is online! Connecting bots...');
        this.connectAll();
      },
      onStreamOffline: () => {
        console.log('🔴 Stream is offline! Disconnecting bots...');
        this.disconnectAll();
      },
    });

    // Check if stream is already online
    const isOnline = await this.stream.isStreamOnline();
    if (isOnline) {
      console.log('🟢 Stream is already online, connecting bots...');
      this.connectAll();
    } else {
      console.log('⏸️  Stream is offline, waiting for stream to go online...');
    }

    console.log('✅ App started successfully!');
  }

  private async handleIncomingMessage(msg: ChatMessage) {
    // Add to context window
    this.messageWindow.addMessage(msg);

    // Don't process messages from our own bots
    const botNames = ['stickyman1776', 'geneJacqueman', 'neckbearddiscordmod'];
    if (botNames.includes(msg.user.toLowerCase())) {
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
        console.error(`Bot ${botName} not found`);
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
          console.error(`Error generating response for ${botName}:`, error);
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
          console.error('Error checking moderation:', error);
          resolve(false); // Don't moderate on error
        });
    });
  }

  private connectAll() {
    // Wire up message handler
    this.chatListener.on('message', (msg) => this.handleIncomingMessage(msg));

    // Start listening to chat
    this.chatListener.start();
    console.log('👂 Chat listener started');

    // Connect all bots
    this.moderatorBot.joinChannel();
    console.log('👮 Moderator bot connected');

    for (const [name, bot] of this.bots) {
      bot.joinChannel();
      console.log(`🤖 Bot ${name} connected`);
    }
  }

  private disconnectAll() {
    // Stop listening to chat
    this.chatListener.stop();
    console.log('🔇 Chat listener stopped');

    // Disconnect all bots
    this.moderatorBot.leaveChannel();
    console.log('👮 Moderator bot disconnected');

    for (const [name, bot] of this.bots) {
      bot.leaveChannel();
      console.log(`🤖 Bot ${name} disconnected`);
    }

    // Clear any pending messages
    this.queue.stop();
    console.log('🧹 Message queue cleared');
  }
}
