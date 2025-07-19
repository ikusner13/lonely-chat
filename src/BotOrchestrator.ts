import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { TwitchChatBot } from "./services/chatbot.service";
import { EventSubService } from "./services/eventsub.service";
import { StreamService } from "./services/stream.service";

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

export class BotOrchestrator {
  private bot?: TwitchChatBot;
  private eventSubService?: EventSubService;
  private streamService?: StreamService;
  private channelUserId: string;
  private channelName: string;
  private isStreamOnline = false;

  constructor() {
    // Get channel info from environment variables
    this.channelUserId = process.env.TWITCH_CHANNEL_ID!;
    this.channelName = process.env.TWITCH_CHANNEL_NAME!;

    if (!this.channelUserId || !this.channelName) {
      throw new Error(
        "TWITCH_CHANNEL_ID and TWITCH_CHANNEL_NAME must be set in .env"
      );
    }

    console.log(
      `🤖 BotOrchestrator initialized for channel: ${this.channelName}`
    );
  }

  async start() {
    console.log("🚀 Starting BotOrchestrator...");

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

    // Initialize all bot clients (but don't connect yet)
    await this.initializeBots(tokens.bots);

    // Check if stream is currently online
    await this.checkStreamStatus();

    console.log("✅ BotOrchestrator started successfully");
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
      console.log("⏳ Stream is offline. Bots will connect when stream goes online.");
    }
  }

  private async initializeBots(botsTokens: Record<string, TokenData>) {
    console.log(`🤖 Initializing ${Object.keys(botsTokens).length} bot(s)...`);

    // For now, we'll use the first bot token
    const botEntries = Object.entries(botsTokens);
    if (botEntries.length === 0) {
      console.warn("⚠️ No bot tokens found");
      return;
    }

    const [botName, tokenData] = botEntries[0];

    // Create a temporary token file for the bot
    const botTokenPath = `./bot-${botName}-token.json`;
    await this.saveBotToken(botTokenPath, tokenData);

    // Initialize the TwitchChatBot
    this.bot = new TwitchChatBot(
      process.env.TWITCH_CLIENT_ID!,
      process.env.TWITCH_CLIENT_SECRET!,
      botTokenPath
    );

    await this.bot.initialize();

    // Set up message handlers
    this.setupBotMessageHandlers();

    console.log(`✅ Bot '${botName}' initialized with chatbot service`);
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

  private setupBotMessageHandlers() {
    if (!this.bot) {
      console.warn("⚠️ No bot initialized");
      return;
    }

    // Set up message handler
    this.bot.onMessage(
      (channel: string, user: string, message: string, msg: any) => {
        console.log(`[Bot] ${user}: ${message}`);

        // Respond to some basic commands
        if (message.toLowerCase() === "!hello") {
          this.bot!.sendMessage(
            channel,
            `Hello ${user}! I'm a friendly bot 🤖`
          );
        } else if (message.toLowerCase() === "!time") {
          const time = new Date().toLocaleTimeString();
          this.bot!.sendMessage(channel, `The current time is ${time}`);
        } else if (message.toLowerCase().includes("how are you")) {
          this.bot!.sendMessage(
            channel,
            `I'm doing great, ${user}! Thanks for asking! How are you?`
          );
        }
      }
    );
  }

  private async connectAllBots() {
    console.log("🔌 Connecting bot to chat...");

    if (!this.bot) {
      console.warn("⚠️ No bot initialized");
      return;
    }

    try {
      await this.bot.connect();

      // Join the channel
      await this.bot.joinChannel(this.channelName);

      console.log(`✅ Bot connected to channel #${this.channelName}`);

      // Send a greeting message
      await this.bot.sendMessage(
        this.channelName,
        "Hello chat! I'm here to keep you company! 👋"
      );
    } catch (error) {
      console.error(`❌ Failed to connect bot:`, error);
    }
  }

  private async disconnectAllBots() {
    console.log("🔌 Disconnecting bot from chat...");

    if (!this.bot) {
      return;
    }

    try {
      await this.bot.leaveChannel(this.channelName);
      await this.bot.disconnect();
      console.log(`✅ Bot disconnected from chat`);
    } catch (error) {
      console.error(`❌ Failed to disconnect bot:`, error);
    }
  }

  async stop() {
    console.log("🛑 Stopping BotOrchestrator...");

    // Disconnect all bots
    await this.disconnectAllBots();

    // Stop EventSub service
    if (this.eventSubService) {
      await this.eventSubService.stop();
    }

    console.log("✅ BotOrchestrator stopped");
  }
}
