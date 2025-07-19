import { RefreshingAuthProvider, AccessToken } from "@twurple/auth";
import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { promises as fs } from "fs";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  obtainmentTimestamp?: number;
}

interface StreamCallbacks {
  onStreamOnline?: (event: any) => Promise<void>;
  onStreamOffline?: (event: any) => Promise<void>;
}

export class EventSubService {
  private authProvider!: RefreshingAuthProvider;
  private apiClient!: ApiClient;
  private eventSubListener!: EventSubWsListener;
  private clientId: string;
  private clientSecret: string;
  private channelUserId: string;
  private tokenFilePath?: string;

  constructor(
    clientId: string,
    clientSecret: string,
    channelUserId: string,
    tokenFilePath?: string
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.channelUserId = channelUserId;
    this.tokenFilePath = tokenFilePath;
  }

  async initialize(channelToken: TokenData, callbacks: StreamCallbacks): Promise<void> {
    console.log("📡 Initializing EventSub service...");

    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret
    });

    // Set up token refresh callback
    this.authProvider.onRefresh(async (userId: string, newTokenData: AccessToken) => {
      console.log(`🔄 Channel token refreshed for user ${userId}`);
      
      if (this.tokenFilePath) {
        await this.saveRefreshedToken(newTokenData);
      }
    });

    // Add the channel token
    await this.authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: channelToken.expiresIn || null,
      obtainmentTimestamp: channelToken.obtainmentTimestamp || Date.now()
    });

    // Create API client
    this.apiClient = new ApiClient({ authProvider: this.authProvider });

    // Create EventSub listener
    this.eventSubListener = new EventSubWsListener({ apiClient: this.apiClient });

    // Subscribe to stream events
    await this.subscribeToStreamEvents(callbacks);

    // Start the listener
    await this.eventSubListener.start();
    console.log("✅ EventSub service initialized and listening");
  }

  private async subscribeToStreamEvents(callbacks: StreamCallbacks): Promise<void> {
    // Subscribe to stream online event
    if (callbacks.onStreamOnline) {
      await this.eventSubListener.onStreamOnline(this.channelUserId, callbacks.onStreamOnline);
      console.log("✅ Subscribed to stream.online events");
    }

    // Subscribe to stream offline event
    if (callbacks.onStreamOffline) {
      await this.eventSubListener.onStreamOffline(this.channelUserId, callbacks.onStreamOffline);
      console.log("✅ Subscribed to stream.offline events");
    }
  }

  async stop(): Promise<void> {
    console.log("🛑 Stopping EventSub service...");
    
    if (this.eventSubListener) {
      this.eventSubListener.stop();
    }
    
    console.log("✅ EventSub service stopped");
  }

  private async saveRefreshedToken(tokenData: AccessToken): Promise<void> {
    if (!this.tokenFilePath) return;

    try {
      // Read existing tokens
      const existingData = await fs.readFile(this.tokenFilePath, "utf-8");
      const tokens = JSON.parse(existingData);

      // Update channel token
      if (tokens.channel) {
        tokens.channel.accessToken = tokenData.accessToken;
        tokens.channel.refreshToken = tokenData.refreshToken!;
        tokens.channel.savedAt = new Date().toISOString();
      }

      // Save updated tokens
      await fs.writeFile(this.tokenFilePath, JSON.stringify(tokens, null, 2));
      console.log("✅ Refreshed channel token saved");
    } catch (error) {
      console.error("Failed to save refreshed token:", error);
    }
  }

  isListening(): boolean {
    return this.eventSubListener !== undefined;
  }
}