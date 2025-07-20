import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { TwitchChatBot } from "./services/chatbot.service";
import { EventSubService } from "./services/eventsub.service";
import { StreamService } from "./services/stream.service";
import {
  AIService,
  BOT_PERSONALITIES,
  BotName,
  BotPersonality,
} from "./services/ai.service";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string;
  channelName?: string;
}

interface TokenStorage {
  channel?: TokenData;
  bots: Record<BotName, TokenData>;
}

interface BotInstance {
  name: BotName;
  client: TwitchChatBot;
  personality: BotPersonality;
  lastMessageTime: Date;
  messageCount: number;
}

interface ConversationState {
  isActive: boolean;
  lastMessageTime: Date;
  messagesSinceLastBotResponse: number;
  currentSpeaker?: string;
}

export class MultiBotOrchestrator {
  private bots: Map<string, BotInstance> = new Map();
  private eventSubService?: EventSubService;
  private streamService?: StreamService;
  private aiService: AIService;
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
    conversationTimeoutMs: 30000, // 30 seconds
  };

  constructor() {
    // Get channel info from environment variables
    this.channelUserId = process.env.TWITCH_CHANNEL_ID!;
    this.channelName = process.env.TWITCH_CHANNEL_NAME!;

    this.aiService = new AIService();
  }

  async start() {
    console.log("🚀 Starting MultiBotOrchestrator...");

    // Load tokens
    const tokens = await this.loadTokens();

    if (!tokens.channel) {
      console.error(
        "❌ No channel tokens found. Run: bun run generate-channel-token"
      );
      return;
    }

    // Initialize stream service
    this.streamService = new StreamService(
      process.env.TWITCH_CLIENT_ID!,
      process.env.TWITCH_CLIENT_SECRET!,
      this.channelUserId,
      this.channelName
    );

    await this.streamService.initialize(tokens.channel);

    // Initialize EventSub with user token for channel monitoring
    await this.initializeEventSub(tokens.channel);

    // Initialize all bot clients
    await this.initializeBots(tokens.bots);

    // Check if stream is currently online
    await this.checkStreamStatus();

    console.log("✅ MultiBotOrchestrator started successfully");
  }

  private async loadTokens(): Promise<TokenStorage> {
    const TOKEN_FILE = "./tokens.json";

    if (!existsSync(TOKEN_FILE)) {
      throw new Error("tokens.json not found");
    }

    const data = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data);
  }

  private async initializeEventSub(channelToken: TokenData) {
    console.log("📡 Initializing EventSub service...");

    // Create EventSub service
    this.eventSubService = new EventSubService(
      process.env.TWITCH_CLIENT_ID!,
      process.env.TWITCH_CLIENT_SECRET!,
      this.channelUserId,
      "./tokens.json"
    );

    // Initialize with callbacks
    await this.eventSubService.initialize(channelToken, {
      onStreamOnline: async (event) => {
        console.log(
          `🟢 Stream went online! ${event.broadcasterDisplayName} is now live!`
        );
        this.isStreamOnline = true;
        await this.connectAllBots();
      },
      onStreamOffline: async (event) => {
        console.log(
          `🔴 Stream went offline! ${event.broadcasterDisplayName} has ended the stream.`
        );
        this.isStreamOnline = false;
        await this.disconnectAllBots();
      },
    });
  }

  private async checkStreamStatus() {
    if (!this.streamService) {
      console.warn("⚠️ Stream service not initialized");
      return;
    }

    const isOnline = await this.streamService.isStreamOnline();

    if (isOnline) {
      this.isStreamOnline = true;
      console.log("🎮 Stream is already online! Connecting bots...");
      await this.connectAllBots();
    } else {
      console.log(
        "⏳ Stream is offline. Bots will connect when stream goes online."
      );
    }
  }

  private async initializeBots(botsTokens: Record<BotName, TokenData>) {
    const botCount = Object.keys(botsTokens).length;
    console.log(`🤖 Initializing ${botCount} bot(s)...`);

    // Get available personalities
    const personalities = Object.values(BOT_PERSONALITIES);
    let personalityIndex = 0;

    // For single bot, use a more versatile personality
    const singleBotPersonality = BOT_PERSONALITIES["stickyman1776"];

    // Initialize each bot with a different personality
    for (const [botName, tokenData] of Object.entries(botsTokens) as [
      BotName,
      TokenData
    ][]) {
      // Create a temporary token file for the bot
      const botTokenPath = `./bot-${botName}-token.json`;
      await this.saveBotToken(botTokenPath, tokenData);

      // Initialize the TwitchChatBot
      const chatClient = new TwitchChatBot(
        process.env.TWITCH_CLIENT_ID!,
        process.env.TWITCH_CLIENT_SECRET!,
        botTokenPath
      );

      await chatClient.initialize();

      // Assign personality based on bot count
      const personality =
        botCount === 1
          ? singleBotPersonality
          : personalities[personalityIndex % personalities.length];

      if (botCount > 1) {
        personalityIndex++;
      }

      // Create bot instance
      const botInstance: BotInstance = {
        name: botName,
        client: chatClient,
        personality,
        lastMessageTime: new Date(0), // Initialize to epoch
        messageCount: 0,
      };

      this.bots.set(botName, botInstance);

      // Set up message handler for this bot
      this.setupBotMessageHandler(botInstance);

      console.log(
        `✅ Bot '${botName}' initialized with personality: ${personality.name}`
      );
    }
  }

  private async saveBotToken(path: string, tokenData: TokenData) {
    const botTokenFormat = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: 0, // Will be refreshed
      obtainmentTimestamp: Date.now(),
    };

    await writeFile(path, JSON.stringify(botTokenFormat, null, 2));
  }

  private setupBotMessageHandler(bot: BotInstance) {
    bot.client.onMessage(
      async (channel: string, user: string, message: string, msg: any) => {
        // Don't process messages from bots themselves
        if (this.isBotUsername(user)) {
          return;
        }

        console.log(`[${channel}] ${user}: ${message}`);

        // Update conversation state
        this.conversationState.lastMessageTime = new Date();
        this.conversationState.messagesSinceLastBotResponse++;

        // Analyze the message for triggers
        const botNames = Array.from(this.bots.keys()) as BotName[];
        const analysis = this.aiService.analyzeMessageTriggers(
          message,
          botNames
        );

        // Determine which bot(s) should respond
        const respondingBots = await this.determineRespondingBots(analysis);

        // Schedule bot responses with natural delays
        for (const botName of respondingBots) {
          const delay = this.calculateResponseDelay(
            respondingBots.indexOf(botName)
          );
          setTimeout(() => {
            this.generateAndSendBotResponse(botName as BotName, message, user);
          }, delay);
        }
      }
    );
  }

  private async determineRespondingBots(
    analysis: ReturnType<AIService["analyzeMessageTriggers"]>
  ): Promise<string[]> {
    const respondingBots: string[] = [];

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
    const bot = this.bots.get(botName);

    if (!bot || !this.isStreamOnline) return;

    try {
      // Get list of other bots for context
      const otherBots = Array.from(this.bots.keys()).filter(
        (name) => name !== botName
      ) as BotName[];

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
        bot.lastMessageTime = new Date();
        bot.messageCount++;
        this.conversationState.messagesSinceLastBotResponse = 0;
        this.conversationState.currentSpeaker = botName;

        console.log(`🤖 ${botName}: ${response}`);
      }
    } catch (error) {
      console.error(`❌ Error generating response for ${botName}:`, error);
    }
  }

  private isBotUsername(username: string): boolean {
    return Array.from(this.bots.keys()).some(
      (botName) => botName.toLowerCase() === username.toLowerCase()
    );
  }

  private async connectAllBots() {
    const botCount = this.bots.size;
    console.log(
      `🔌 Connecting ${botCount === 1 ? "bot" : "all bots"} to chat...`
    );

    let botIndex = 0;
    for (const [botName, bot] of this.bots.entries()) {
      try {
        await bot.client.connect();
        await bot.client.joinChannel(this.channelName);
        console.log(`✅ ${botName} connected to channel #${this.channelName}`);

        // Stagger greeting messages (only if stream is online)
        if (this.isStreamOnline) {
          setTimeout(async () => {
            const greetings = [
              "Hey chat! Ready for some fun? 👋",
              "What's up everyone! Let's goooo! 🎮",
              "Hello friends! Excited to be here! ✨",
              "Yo chat! How's everyone doing? 😄",
              "Greetings! Let's make this stream awesome! 🚀",
            ];

            const greeting =
              greetings[Math.floor(Math.random() * greetings.length)];
            await bot.client.sendMessage(this.channelName, greeting);
          }, 2000 + botIndex * 3000); // Stagger by 3 seconds per bot
        }

        botIndex++;
      } catch (error) {
        console.error(`❌ Failed to connect ${botName}:`, error);
      }
    }
  }

  private async disconnectAllBots() {
    console.log("🔌 Disconnecting all bots from chat...");

    for (const [botName, bot] of this.bots.entries()) {
      try {
        await bot.client.leaveChannel(this.channelName);
        await bot.client.disconnect();
        console.log(`✅ ${botName} disconnected from chat`);
      } catch (error) {
        console.error(`❌ Failed to disconnect ${botName}:`, error);
      }
    }
  }

  async stop() {
    console.log("🛑 Stopping MultiBotOrchestrator...");

    // Disconnect all bots
    await this.disconnectAllBots();

    // Stop EventSub service
    if (this.eventSubService) {
      await this.eventSubService.stop();
    }

    // Clear AI service context
    this.aiService.clearContext(this.channelName);

    console.log("✅ MultiBotOrchestrator stopped");
  }
}
