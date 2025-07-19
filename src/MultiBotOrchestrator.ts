import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { TwitchChatBot } from "./services/chatbot.service";
import { EventSubService } from "./services/eventsub.service";
import { StreamService } from "./services/stream.service";
import {
  AIService,
  BOT_PERSONALITIES,
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
  bots: Record<string, TokenData>;
}

interface BotInstance {
  name: string;
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
    minTimeBetweenBotMessages: 2000, // 2 seconds (faster for single bot)
    maxTimeBetweenBotMessages: 10000, // 10 seconds
    chanceToStartConversation: 0.05, // 5% chance (only for multi-bot)
    chanceToJoinConversation: 0.4, // 40% chance (higher for engagement)
    maxBotsPerConversation: 3,
    conversationTimeoutMs: 30000, // 30 seconds
  };

  // Conversation starters for autonomous discussions
  private readonly conversationTopics = [
    "What's everyone's favorite game genre?",
    "Anyone excited about any upcoming game releases?",
    "What do you think about the current meta?",
    "Remember when games didn't have patches? Wild times!",
    "What's the best gaming snack?",
    "Controller or keyboard and mouse?",
    "What game has the best soundtrack?",
    "Favorite gaming memory?",
    "Most underrated game you've played?",
    "What makes a game truly great?",
  ];

  constructor() {
    // Get channel info from environment variables
    this.channelUserId = process.env.TWITCH_CHANNEL_ID!;
    this.channelName = process.env.TWITCH_CHANNEL_NAME!;
    const openRouterKey = process.env.OPENROUTER_KEY!;

    if (!this.channelUserId || !this.channelName) {
      throw new Error(
        "TWITCH_CHANNEL_ID and TWITCH_CHANNEL_NAME must be set in .env"
      );
    }

    if (!openRouterKey) {
      throw new Error("OPENROUTER_KEY must be set in .env");
    }

    // Initialize AI service
    this.aiService = new AIService(openRouterKey);

    console.log(
      `🤖 MultiBotOrchestrator initialized for channel: ${this.channelName}`
    );
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

    // Start conversation monitoring
    this.startConversationMonitoring();

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

  private async initializeBots(botsTokens: Record<string, TokenData>) {
    const botCount = Object.keys(botsTokens).length;
    console.log(`🤖 Initializing ${botCount} bot(s)...`);

    // Get available personalities
    const personalities = Object.values(BOT_PERSONALITIES);
    let personalityIndex = 0;

    // For single bot, use a more versatile personality
    const singleBotPersonality = BOT_PERSONALITIES["stickyman1776"];

    // Initialize each bot with a different personality
    for (const [botName, tokenData] of Object.entries(botsTokens)) {
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
        const botNames = Array.from(this.bots.keys());
        const analysis = this.aiService.analyzeMessageTriggers(
          message,
          user,
          botNames
        );

        // Determine which bot(s) should respond
        const respondingBots = await this.determineRespondingBots(
          analysis,
          user,
          message
        );

        // Schedule bot responses with natural delays
        for (const botName of respondingBots) {
          const delay = this.calculateResponseDelay(
            respondingBots.indexOf(botName)
          );
          setTimeout(() => {
            this.generateAndSendBotResponse(botName, message, user);
          }, delay);
        }
      }
    );
  }

  private async determineRespondingBots(
    analysis: ReturnType<AIService["analyzeMessageTriggers"]>,
    user: string,
    message: string
  ): Promise<string[]> {
    const respondingBots: string[] = [];

    // If specific bots are mentioned, they should respond
    if (analysis.mentionedBots.length > 0) {
      respondingBots.push(...analysis.mentionedBots);
    } else if (analysis.shouldRespond) {
      // Select bot(s) based on personality and context
      const availableBots = Array.from(this.bots.entries())
        .filter(([_, bot]) => {
          // Check if bot hasn't spoken too recently
          const timeSinceLastMessage =
            Date.now() - bot.lastMessageTime.getTime();
          return timeSinceLastMessage > this.config.minTimeBetweenBotMessages;
        })
        .sort((a, b) => {
          // Prioritize bots that haven't spoken in a while
          return (
            a[1].lastMessageTime.getTime() - b[1].lastMessageTime.getTime()
          );
        });

      if (availableBots.length > 0) {
        // Calculate how many bots should respond
        const numBots = analysis.isQuestion
          ? Math.min(2, availableBots.length)
          : 1;

        // Select bots based on their interests and response frequency
        for (let i = 0; i < Math.min(numBots, availableBots.length); i++) {
          const [botName, bot] = availableBots[i];

          // Check if bot is interested in responding
          const responseChance = bot.personality.responseFrequency || 0.5;
          if (Math.random() < responseChance) {
            respondingBots.push(botName);
          }
        }
      }
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
    botName: string,
    triggerMessage: string,
    triggerUser: string
  ) {
    const bot = this.bots.get(botName);
    if (!bot || !this.isStreamOnline) return;

    try {
      // Get list of other bots for context
      const otherBots = Array.from(this.bots.keys()).filter(
        (name) => name !== botName
      );

      // Generate AI response
      const response = await this.aiService.generateResponse(
        this.channelName,
        botName,
        triggerMessage,
        triggerUser,
        bot.personality,
        otherBots
      );

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

  private startConversationMonitoring() {
    // Check periodically if bots should start an autonomous conversation
    setInterval(() => {
      if (!this.isStreamOnline) return;

      const timeSinceLastMessage =
        Date.now() - this.conversationState.lastMessageTime.getTime();

      // If chat has been quiet for a while, maybe start a conversation
      if (
        timeSinceLastMessage > 60000 && // 1 minute of silence
        Math.random() < this.config.chanceToStartConversation
      ) {
        this.startAutonomousConversation();
      }
    }, 30000); // Check every 30 seconds
  }

  private async startAutonomousConversation() {
    // Only start autonomous conversations if we have multiple bots
    const botEntries = Array.from(this.bots.entries());
    if (botEntries.length <= 1) return; // Skip if only one bot

    const [starterBotName, starterBot] =
      botEntries[Math.floor(Math.random() * botEntries.length)];

    // Pick a random topic
    const topic =
      this.conversationTopics[
        Math.floor(Math.random() * this.conversationTopics.length)
      ];

    // Set the topic in AI service
    this.aiService.setTopic(this.channelName, topic);

    // Generate the conversation starter
    const response = await this.aiService.generateResponse(
      this.channelName,
      starterBotName,
      null, // No trigger message
      null, // No trigger user
      starterBot.personality,
      Array.from(this.bots.keys()).filter((name) => name !== starterBotName)
    );

    if (response) {
      await starterBot.client.sendMessage(this.channelName, response);
      starterBot.lastMessageTime = new Date();

      console.log(`🎭 ${starterBotName} started a conversation: ${response}`);

      // Schedule another bot to respond
      setTimeout(() => {
        this.continueAutonomousConversation(starterBotName);
      }, 5000 + Math.random() * 5000); // 5-10 seconds
    }
  }

  private async continueAutonomousConversation(previousSpeaker: string) {
    // Pick a different bot to respond
    const otherBots = Array.from(this.bots.entries()).filter(
      ([name, _]) => name !== previousSpeaker
    );

    if (otherBots.length === 0) return;

    const [responderName, responderBot] =
      otherBots[Math.floor(Math.random() * otherBots.length)];

    // Check if conversation should continue
    if (Math.random() > 0.7) {
      // 70% chance to continue
      return;
    }

    // Generate response
    const response = await this.aiService.generateResponse(
      this.channelName,
      responderName,
      null,
      null,
      responderBot.personality,
      Array.from(this.bots.keys()).filter((name) => name !== responderName)
    );

    if (response) {
      await responderBot.client.sendMessage(this.channelName, response);
      responderBot.lastMessageTime = new Date();

      console.log(`🎭 ${responderName}: ${response}`);

      // Maybe continue the conversation
      if (Math.random() < 0.5) {
        // 50% chance
        setTimeout(() => {
          this.continueAutonomousConversation(responderName);
        }, 5000 + Math.random() * 5000);
      }
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
