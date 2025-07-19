import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { RefreshingAuthProvider, AppTokenAuthProvider, AccessToken } from "@twurple/auth";
import { ApiClient } from "@twurple/api";
import { ChatClient } from "@twurple/chat";
import { EventSubWsListener } from "@twurple/eventsub-ws";

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
  private bots: Map<string, ChatClient> = new Map();
  private eventSubListener?: EventSubWsListener;
  private channelUserId: string;
  private channelName: string;
  private isStreamOnline = false;

  constructor() {
    // Get channel info from environment variables
    this.channelUserId = process.env.TWITCH_CHANNEL_ID!;
    this.channelName = process.env.TWITCH_CHANNEL_NAME!;
    
    if (!this.channelUserId || !this.channelName) {
      throw new Error("TWITCH_CHANNEL_ID and TWITCH_CHANNEL_NAME must be set in .env");
    }
    
    console.log(`🤖 BotOrchestrator initialized for channel: ${this.channelName}`);
  }

  async start() {
    console.log("🚀 Starting BotOrchestrator...");
    
    // Load tokens
    const tokens = await this.loadTokens();
    
    if (!tokens.channel) {
      console.error("❌ No channel tokens found. Run: bun run generate-channel-token");
      return;
    }
    
    // Initialize EventSub with user token for channel monitoring
    await this.initializeEventSub(tokens.channel);
    
    // Initialize all bot clients (but don't connect yet)
    await this.initializeBots(tokens.bots);
    
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
    console.log("📡 Initializing EventSub listener with user token...");
    
    // Use user token for EventSub WebSocket
    const authProvider = new RefreshingAuthProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!
    });

    authProvider.onRefresh(async (userId: string, newTokenData: AccessToken) => {
      console.log(`🔄 Channel token refreshed`);
      // TODO: Save refreshed token back to tokens.json
    });

    await authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: null,
      obtainmentTimestamp: Date.now()
    });

    const apiClient = new ApiClient({ authProvider });
    this.eventSubListener = new EventSubWsListener({ apiClient });

    // Subscribe to stream online event
    await this.eventSubListener.onStreamOnline(this.channelUserId!, async (event) => {
      console.log(`🟢 Stream went online! ${event.broadcasterDisplayName} is now live!`);
      this.isStreamOnline = true;
      await this.connectAllBots();
    });

    // Subscribe to stream offline event
    await this.eventSubListener.onStreamOffline(this.channelUserId!, async (event) => {
      console.log(`🔴 Stream went offline! ${event.broadcasterDisplayName} has ended the stream.`);
      this.isStreamOnline = false;
      await this.disconnectAllBots();
    });

    await this.eventSubListener.start();
    console.log("✅ EventSub listener started");
  }

  private async initializeBots(botsTokens: Record<string, TokenData>) {
    console.log(`🤖 Initializing ${Object.keys(botsTokens).length} bot(s)...`);
    
    for (const [botName, tokenData] of Object.entries(botsTokens)) {
      const authProvider = new RefreshingAuthProvider({
        clientId: process.env.TWITCH_CLIENT_ID!,
        clientSecret: process.env.TWITCH_CLIENT_SECRET!
      });

      authProvider.onRefresh(async (userId: string, newTokenData: AccessToken) => {
        console.log(`🔄 Bot '${botName}' token refreshed`);
        // TODO: Save refreshed token back to tokens.json
      });

      await authProvider.addUserForToken({
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: null,
        obtainmentTimestamp: Date.now()
      });

      const chatClient = new ChatClient({
        authProvider,
        channels: [] // Will add channel when connecting
      });

      this.bots.set(botName, chatClient);
      console.log(`✅ Bot '${botName}' initialized`);
    }
  }

  private async connectAllBots() {
    console.log("🔌 Connecting all bots to chat...");
    
    for (const [botName, chatClient] of Array.from(this.bots.entries())) {
      try {
        await chatClient.connect();
        
        // Join the channel
        await chatClient.join(this.channelName!);
        
        console.log(`✅ Bot '${botName}' connected to channel #${this.channelName}`);
        
        // Set up message handlers
        chatClient.onMessage((channel: string, user: string, text: string, msg: any) => {
          console.log(`[${botName}] ${user}: ${text}`);
          // Add your bot logic here
        });
      } catch (error) {
        console.error(`❌ Failed to connect bot '${botName}':`, error);
      }
    }
  }

  private async disconnectAllBots() {
    console.log("🔌 Disconnecting all bots from chat...");
    
    for (const [botName, chatClient] of Array.from(this.bots.entries())) {
      try {
        await chatClient.quit();
        console.log(`✅ Bot '${botName}' disconnected from chat`);
      } catch (error) {
        console.error(`❌ Failed to disconnect bot '${botName}':`, error);
      }
    }
  }

  async stop() {
    console.log("🛑 Stopping BotOrchestrator...");
    
    // Disconnect all bots
    await this.disconnectAllBots();
    
    // Stop EventSub listener
    if (this.eventSubListener) {
      this.eventSubListener.stop();
    }
    
    console.log("✅ BotOrchestrator stopped");
  }
}