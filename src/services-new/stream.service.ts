import { ApiClient } from '@twurple/api';
import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import type {
  EventSubStreamOfflineEvent,
  EventSubStreamOnlineEvent,
} from '@twurple/eventsub-base';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import type { TokenManager } from './token.service';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  obtainmentTimestamp?: number;
}

export class StreamService {
  private readonly apiClient: ApiClient;
  private readonly channelUserId: string;
  private readonly eventSubListener: EventSubWsListener;
  private readonly authProvider: RefreshingAuthProvider;

  private constructor(
    clientId: string,
    clientSecret: string,
    channelUserId: string,
    tokenManager: TokenManager,
    onStreamOnline: (event: EventSubStreamOnlineEvent) => void,
    onStreamOffline: (event: EventSubStreamOfflineEvent) => void
  ) {
    this.channelUserId = channelUserId;
    
    this.authProvider = this.setupAuthProvider(
      clientId,
      clientSecret,
      tokenManager
    );
    
    this.apiClient = new ApiClient({ authProvider: this.authProvider });
    
    this.eventSubListener = this.setupEventSub(
      onStreamOnline,
      onStreamOffline
    );
  }

  private setupAuthProvider(
    clientId: string,
    clientSecret: string,
    tokenManager: TokenManager
  ): RefreshingAuthProvider {
    const authProvider = new RefreshingAuthProvider({
      clientId,
      clientSecret,
    });

    authProvider.onRefresh(
      async (userId: string, newTokenData: AccessToken) => {
        const updatedToken = tokenManager.convertAccessToken(
          newTokenData,
          userId
        );
        await tokenManager.updateChannelToken(updatedToken);
      }
    );

    return authProvider;
  }

  private setupEventSub(
    onStreamOnline: (event: EventSubStreamOnlineEvent) => void,
    onStreamOffline: (event: EventSubStreamOfflineEvent) => void
  ): EventSubWsListener {
    const eventSubListener = new EventSubWsListener({
      apiClient: this.apiClient,
    });

    eventSubListener.onStreamOnline(this.channelUserId, onStreamOnline);
    eventSubListener.onStreamOffline(this.channelUserId, onStreamOffline);

    return eventSubListener;
  }

  static async create({
    clientId,
    clientSecret,
    channelUserId,
    tokenManager,
    channelToken,
    onStreamOnline,
    onStreamOffline,
  }: {
    clientId: string;
    clientSecret: string;
    channelUserId: string;
    tokenManager: TokenManager;
    channelToken: TokenData;
    onStreamOnline: (event: EventSubStreamOnlineEvent) => void;
    onStreamOffline: (event: EventSubStreamOfflineEvent) => void;
  }): Promise<StreamService> {
    const service = new StreamService(
      clientId,
      clientSecret,
      channelUserId,
      tokenManager,
      onStreamOnline,
      onStreamOffline
    );

    // Initialize auth provider with token
    await service.initializeAuth(channelToken);
    
    // Start EventSub listener
    service.eventSubListener.start();

    return service;
  }

  private async initializeAuth(channelToken: TokenData): Promise<void> {
    await this.authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: channelToken.expiresIn || null,
      obtainmentTimestamp: channelToken.obtainmentTimestamp || Date.now(),
    });
  }

  async isStreamOnline(): Promise<boolean> {
    try {
      const stream = await this.apiClient.streams.getStreamByUserId(
        this.channelUserId
      );

      if (stream) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Error checking stream status:', error);
      return false;
    }
  }

  stop(): void {
    this.eventSubListener.stop();
  }
}
