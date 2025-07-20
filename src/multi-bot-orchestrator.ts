import { env } from '@/env';
import { type BotName, getBotConfig } from './config/bot.schema';
import { AIService } from './services/ai.service';
import { BotManager } from './services/bot-manager.service';
import { ConversationManager } from './services/conversation.service';
import { EventSubService } from './services/eventsub.service';
import { StreamService } from './services/stream.service';
import { type TokenData, TokenManager } from './services/token.service';

interface ConversationState {
  isActive: boolean;
  lastMessageTime: Date;
  messagesSinceLastBotResponse: number;
  currentSpeaker?: string;
}

export class MultiBotOrchestrator {
  private eventSubService?: EventSubService;
  private streamService?: StreamService;
  private aiService: AIService;
  private tokenManager: TokenManager;
  private conversationManager: ConversationManager;
  private botManager: BotManager;
  private channelUserId: string;
  private channelName: string;
  private isStreamOnline = false;
  private conversationState: ConversationState = {
    isActive: false,
    lastMessageTime: new Date(),
    messagesSinceLastBotResponse: 0,
  };

  // Configuration for bot behavior
  private readonly config = {
    minTimeBetweenBotMessages: 10_000, // 10 seconds (faster for single bot)
    maxTimeBetweenBotMessages: 20_000, // 20 seconds
    maxBotsPerConversation: 3,
    conversationTimeoutMs: 30_000, // 30 seconds
  };

  constructor() {
    // Get channel info from environment variables
    this.channelUserId = env.TWITCH_CHANNEL_ID;
    this.channelName = env.TWITCH_CHANNEL_NAME;

    // Initialize managers
    this.tokenManager = new TokenManager();
    this.conversationManager = new ConversationManager();
    this.aiService = new AIService(this.conversationManager);
    this.botManager = new BotManager({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
      tokenManager: this.tokenManager,
    });
  }

  async start() {
    console.log('🚀 Starting MultiBotOrchestrator...');

    // Load tokens
    const tokens = await this.tokenManager.loadTokens();

    if (!tokens.channel) {
      console.error(
        '❌ No channel tokens found. Run: bun run generate-channel-token'
      );
      return;
    }

    // Initialize stream service
    this.streamService = new StreamService(
      env.TWITCH_CLIENT_ID,
      env.TWITCH_CLIENT_SECRET,
      this.channelName
    );

    await this.streamService.initialize(tokens.channel);

    // Initialize EventSub with user token for channel monitoring
    await this.initializeEventSub(tokens.channel);

    // Initialize all bot clients
    await this.botManager.initializeAllBots(getBotConfig());

    // Set up message handlers for all bots
    this.setupBotMessageHandlers();

    // Check if stream is currently online
    await this.checkStreamStatus();

    console.log('✅ MultiBotOrchestrator started successfully');
  }

  private async initializeEventSub(channelToken: TokenData) {
    console.log('📡 Initializing EventSub service...');

    // Create EventSub service
    this.eventSubService = new EventSubService(
      env.TWITCH_CLIENT_ID,
      env.TWITCH_CLIENT_SECRET,
      this.channelUserId
    );

    // Set up token refresh callback
    this.eventSubService.setTokenRefreshCallback(
      async (userId, newTokenData) => {
        const updatedToken = this.tokenManager.convertAccessToken(
          newTokenData,
          userId
        );
        await this.tokenManager.updateChannelToken(updatedToken);
      }
    );

    // Initialize with callbacks
    await this.eventSubService.initialize(channelToken, {
      onStreamOnline: async (event) => {
        console.log(
          `🟢 Stream went online! ${event.broadcasterDisplayName} is now live!`
        );
        this.isStreamOnline = true;
        await this.botManager.connectAllBots(this.channelName, true);
      },
      onStreamOffline: async (event) => {
        console.log(
          `🔴 Stream went offline! ${event.broadcasterDisplayName} has ended the stream.`
        );
        this.isStreamOnline = false;
        await this.botManager.disconnectAllBots(this.channelName);
      },
    });
  }

  private async checkStreamStatus() {
    if (!this.streamService) {
      console.warn('⚠️ Stream service not initialized');
      return;
    }

    const isOnline = await this.streamService.isStreamOnline();

    if (isOnline) {
      this.isStreamOnline = true;
      console.log('🎮 Stream is already online! Connecting bots...');
      await this.botManager.connectAllBots(this.channelName, true);
    } else {
      console.log(
        '⏳ Stream is offline. Bots will connect when stream goes online.'
      );
    }
  }

  private setupBotMessageHandlers() {
    const botNames = this.botManager.getBotNames();

    for (const botName of botNames) {
      this.botManager.setMessageHandler(
        botName,
        async (channel: string, user: string, message: string) => {
          // Don't process messages from bots themselves
          if (this.botManager.isBotUsername(user)) {
            return;
          }

          console.log(`[${channel}] ${user}: ${message}`);

          // Update conversation state
          this.conversationState.lastMessageTime = new Date();
          this.conversationState.messagesSinceLastBotResponse++;

          // Analyze the message for triggers
          const analysis = this.aiService.analyzeMessageTriggers(
            message,
            botNames as BotName[]
          );

          // Determine which bot(s) should respond
          const respondingBots = await this.determineRespondingBots(analysis);

          // Schedule bot responses with natural delays
          for (const respondingBotName of respondingBots) {
            const delay = this.calculateResponseDelay(
              respondingBots.indexOf(respondingBotName)
            );
            setTimeout(() => {
              this.generateAndSendBotResponse(respondingBotName, message, user);
            }, delay);
          }
        }
      );
    }
  }

  private determineRespondingBots(
    analysis: ReturnType<AIService['analyzeMessageTriggers']>
  ): BotName[] {
    const respondingBots: BotName[] = [];

    // If specific bots are mentioned, they should respond
    if (analysis.mentionedBots.length > 0) {
      respondingBots.push(...analysis.mentionedBots);
    }

    return respondingBots.slice(0, this.config.maxBotsPerConversation);
  }

  private calculateResponseDelay(index: number): number {
    // First bot responds quickly, subsequent bots wait longer
    const baseDelay = this.config.minTimeBetweenBotMessages;
    const additionalDelay = index * 2000; // 2 seconds per position
    const randomness = Math.random() * 2000; // 0-2 seconds random

    return baseDelay + additionalDelay + randomness;
  }

  private async generateAndSendBotResponse(
    botName: BotName,
    triggerMessage: string,
    triggerUser: string
  ) {
    const bot = this.botManager.getBot(botName);

    if (!(bot && this.isStreamOnline)) {
      return;
    }

    try {
      // Get list of other bots for context
      const otherBots = this.botManager
        .getBotNames()
        .filter((name) => name !== botName) as BotName[];

      // Generate AI response
      const response = await this.aiService.generateResponse({
        channelName: this.channelName,
        botName,
        triggerMessage,
        triggerUser,
        otherBots,
      });

      if (response) {
        // Send the message
        await bot.client.sendMessage(this.channelName, response);

        // Update bot state
        this.botManager.updateBotState(botName);
        this.conversationState.messagesSinceLastBotResponse = 0;
        this.conversationState.currentSpeaker = botName;

        console.log(`🤖 ${botName}: ${response}`);
      }
    } catch (error) {
      console.error(`❌ Error generating response for ${botName}:`, error);
    }
  }

  async stop() {
    console.log('🛑 Stopping MultiBotOrchestrator...');

    // Disconnect all bots
    await this.botManager.disconnectAllBots(this.channelName);

    // Stop EventSub service
    if (this.eventSubService) {
      await this.eventSubService.stop();
    }

    // Clear conversation context
    this.conversationManager.clearContext(this.channelName);

    // Stop conversation manager cleanup
    this.conversationManager.stop();

    // Clean up bot resources
    await this.botManager.cleanup();

    console.log('✅ MultiBotOrchestrator stopped');
  }
}
