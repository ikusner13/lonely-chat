import { TwitchChatBot } from "./chatbot.service";
import { TokenManager } from "./token.service";
import type { BotPersonality } from "./ai.service";
import type { ChatMessage } from "@twurple/chat";

export interface BotInstance {
  name: string;
  client: TwitchChatBot;
  personality: BotPersonality;
  lastMessageTime: Date;
  messageCount: number;
}

export interface BotManagerConfig {
  clientId: string;
  clientSecret: string;
  tokenManager: TokenManager;
}

type MessageHandler = (
  channel: string,
  user: string,
  message: string,
  msg: ChatMessage
) => void;

export class BotManager {
  private bots: Map<string, BotInstance> = new Map();
  private clientId: string;
  private clientSecret: string;
  private tokenManager: TokenManager;
  private messageHandlers: Map<string, MessageHandler> = new Map();

  constructor(config: BotManagerConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenManager = config.tokenManager;
  }

  /**
   * Initialize all bots from token storage
   */
  async initializeAllBots(
    personalities: Record<string, BotPersonality>
  ): Promise<void> {
    const botTokens = await this.tokenManager.getBotTokens();
    const botCount = Object.keys(botTokens).length;

    console.log(`🤖 Initializing ${botCount} bot(s)...`);

    // Get available personalities
    const personalityList = Object.values(personalities);
    let personalityIndex = 0;

    // For single bot, use the first personality
    const singleBotPersonality = personalityList[0];

    for (const botName of Object.keys(botTokens)) {
      // Assign personality based on bot count
      const personality =
        botCount === 1
          ? singleBotPersonality
          : personalityList[personalityIndex % personalityList.length];

      if (botCount > 1) {
        personalityIndex++;
      }

      await this.initializeBot(botName, personality);
    }
  }

  /**
   * Initialize a single bot
   */
  async initializeBot(
    botName: string,
    personality: BotPersonality
  ): Promise<BotInstance> {
    // Get token data for this bot
    const tokenData = await this.tokenManager.getBotToken(botName);
    if (!tokenData) {
      throw new Error(`No token found for bot: ${botName}`);
    }

    // Convert to bot token format
    const botTokenFormat = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: 0, // Will be refreshed
      obtainmentTimestamp: Date.now(),
    };

    // Initialize the TwitchChatBot with token data
    const chatClient = new TwitchChatBot(
      this.clientId,
      this.clientSecret,
      botTokenFormat
    );

    // Set up token refresh callback
    chatClient.setTokenRefreshCallback(async (userId, newTokenData) => {
      const updatedToken = this.tokenManager.convertAccessToken(
        newTokenData,
        userId
      );
      await this.tokenManager.updateBotToken(botName, updatedToken);
    });

    await chatClient.initialize();

    // Create bot instance
    const botInstance: BotInstance = {
      name: botName,
      client: chatClient,
      personality,
      lastMessageTime: new Date(0), // Initialize to epoch
      messageCount: 0,
    };

    this.bots.set(botName, botInstance);

    // Set up message handler if one exists
    const handler = this.messageHandlers.get(botName);
    if (handler) {
      chatClient.onMessage(handler);
    }

    console.log(
      `✅ Bot '${botName}' initialized with personality: ${personality.name}`
    );

    return botInstance;
  }

  /**
   * Get a bot instance by name
   */
  getBot(botName: string): BotInstance | undefined {
    return this.bots.get(botName);
  }

  /**
   * Get all bot instances
   */
  getAllBots(): Map<string, BotInstance> {
    return new Map(this.bots);
  }

  /**
   * Get all bot names
   */
  getBotNames(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Check if a username is a bot
   */
  isBotUsername(username: string): boolean {
    return Array.from(this.bots.keys()).some(
      (botName) => botName.toLowerCase() === username.toLowerCase()
    );
  }

  /**
   * Set message handler for a bot
   */
  setMessageHandler(botName: string, handler: MessageHandler): void {
    this.messageHandlers.set(botName, handler);

    // If bot already exists, set the handler
    const bot = this.bots.get(botName);
    if (bot) {
      bot.client.onMessage(handler);
    }
  }

  /**
   * Connect all bots to a channel
   */
  async connectAllBots(
    channelName: string,
    isStreamOnline: boolean
  ): Promise<void> {
    const botCount = this.bots.size;
    console.log(
      `🔌 Connecting ${botCount === 1 ? "bot" : "all bots"} to chat...`
    );

    let botIndex = 0;
    for (const [botName, bot] of this.bots.entries()) {
      try {
        await bot.client.connect();
        await bot.client.joinChannel(channelName);
        console.log(`✅ ${botName} connected to channel #${channelName}`);

        // Stagger greeting messages (only if stream is online)
        if (isStreamOnline) {
          setTimeout(async () => {
            const greetings = this.getGreetings();
            const greeting =
              greetings[Math.floor(Math.random() * greetings.length)];
            await bot.client.sendMessage(channelName, greeting);
          }, 2000 + botIndex * 3000); // Stagger by 3 seconds per bot
        }

        botIndex++;
      } catch (error) {
        console.error(`❌ Failed to connect ${botName}:`, error);
      }
    }
  }

  /**
   * Disconnect all bots from a channel
   */
  async disconnectAllBots(channelName: string): Promise<void> {
    console.log("🔌 Disconnecting all bots from chat...");

    for (const [botName, bot] of this.bots.entries()) {
      try {
        await bot.client.leaveChannel(channelName);
        await bot.client.disconnect();
        console.log(`✅ ${botName} disconnected from chat`);
      } catch (error) {
        console.error(`❌ Failed to disconnect ${botName}:`, error);
      }
    }
  }

  /**
   * Update bot state after sending a message
   */
  updateBotState(botName: string): void {
    const bot = this.bots.get(botName);
    if (bot) {
      bot.lastMessageTime = new Date();
      bot.messageCount++;
    }
  }

  /**
   * Get bot statistics
   */
  getBotStats(botName: string): {
    lastMessageTime: Date;
    messageCount: number;
    personality: string;
  } | null {
    const bot = this.bots.get(botName);
    if (!bot) return null;

    return {
      lastMessageTime: bot.lastMessageTime,
      messageCount: bot.messageCount,
      personality: bot.personality.name,
    };
  }

  /**
   * Clean up all bot resources
   */
  async cleanup(): Promise<void> {
    // Disconnect all bots
    for (const bot of this.bots.values()) {
      try {
        await bot.client.disconnect();
      } catch (error) {
        console.error(`Error disconnecting bot ${bot.name}:`, error);
      }
    }

    // Clean up token files
    await this.tokenManager.cleanupBotTokenFiles();

    // Clear internal state
    this.bots.clear();
    this.messageHandlers.clear();
  }

  /**
   * Get greeting messages
   */
  private getGreetings(): string[] {
    return [
      "Hey chat! Ready for some fun? 👋",
      "What's up everyone! Let's goooo! 🎮",
      "Hello friends! Excited to be here! ✨",
      "Yo chat! How's everyone doing? 😄",
      "Greetings! Let's make this stream awesome! 🚀",
    ];
  }
}
