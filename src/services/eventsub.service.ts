import { RefreshingAuthProvider, AccessToken } from "@twurple/auth";
import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";

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

export type TokenRefreshCallback = (
  userId: string,
  newTokenData: AccessToken
) => Promise<void>;

export class EventSubService {
  private authProvider!: RefreshingAuthProvider;
  private apiClient!: ApiClient;
  private eventSubListener!: EventSubWsListener;
  private clientId: string;
  private clientSecret: string;
  private channelUserId: string;
  private onTokenRefresh?: TokenRefreshCallback;

  constructor(clientId: string, clientSecret: string, channelUserId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.channelUserId = channelUserId;
  }

  async initialize(
    channelToken: TokenData,
    callbacks: StreamCallbacks
  ): Promise<void> {
    console.log("📡 Initializing EventSub service...");

    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    // Set up token refresh callback
    this.authProvider.onRefresh(
      async (userId: string, newTokenData: AccessToken) => {
        console.log(`🔄 Channel token refreshed for user ${userId}`);

        if (this.onTokenRefresh) {
          await this.onTokenRefresh(userId, newTokenData);
        }
      }
    );

    // Add the channel token
    await this.authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: channelToken.expiresIn || null,
      obtainmentTimestamp: channelToken.obtainmentTimestamp || Date.now(),
    });

    // Create API client
    this.apiClient = new ApiClient({ authProvider: this.authProvider });

    // Create EventSub listener
    this.eventSubListener = new EventSubWsListener({
      apiClient: this.apiClient,
    });

    // Subscribe to stream events
    await this.subscribeToStreamEvents(callbacks);

    // Start the listener
    await this.eventSubListener.start();
    console.log("✅ EventSub service initialized and listening");
  }

  private async subscribeToStreamEvents(
    callbacks: StreamCallbacks
  ): Promise<void> {
    // Subscribe to stream online event
    if (callbacks.onStreamOnline) {
      await this.eventSubListener.onStreamOnline(
        this.channelUserId,
        callbacks.onStreamOnline
      );
      console.log("✅ Subscribed to stream.online events");
    }

    // Subscribe to stream offline event
    if (callbacks.onStreamOffline) {
      await this.eventSubListener.onStreamOffline(
        this.channelUserId,
        callbacks.onStreamOffline
      );
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

  setTokenRefreshCallback(callback: TokenRefreshCallback): void {
    this.onTokenRefresh = callback;
  }

  isListening(): boolean {
    return this.eventSubListener !== undefined;
  }
}
