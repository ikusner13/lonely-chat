import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  obtainmentTimestamp?: number;
}

export class StreamService {
  private apiClient!: ApiClient;
  private authProvider: RefreshingAuthProvider;
  private channelUserId: string;
  private channelName: string;

  constructor(
    clientId: string,
    clientSecret: string,
    channelUserId: string,
    channelName: string
  ) {
    this.channelUserId = channelUserId;
    this.channelName = channelName;

    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId,
      clientSecret,
    });
  }

  async initialize(channelToken: TokenData) {
    // Add the channel token
    await this.authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: channelToken.expiresIn || null,
      obtainmentTimestamp: channelToken.obtainmentTimestamp || Date.now(),
    });

    // Create API client
    this.apiClient = new ApiClient({ authProvider: this.authProvider });
  }

  async isStreamOnline(): Promise<boolean> {
    try {
      console.log(
        `🔍 Checking if ${this.channelName} is currently streaming...`
      );

      const stream = await this.apiClient.streams.getStreamByUserName(
        this.channelName
      );

      if (stream) {
        console.log(`🟢 Stream is ONLINE! Title: "${stream.title}"`);
        console.log(`   Game: ${stream.gameName}`);
        console.log(`   Viewers: ${stream.viewers}`);
        return true;
      } else {
        console.log(`🔴 Stream is OFFLINE`);
        return false;
      }
    } catch (error) {
      console.error("❌ Error checking stream status:", error);
      return false;
    }
  }

  async getStreamInfo() {
    try {
      const stream = await this.apiClient.streams.getStreamByUserName(
        this.channelName
      );
      return stream;
    } catch (error) {
      console.error("❌ Error getting stream info:", error);
      return null;
    }
  }
}
