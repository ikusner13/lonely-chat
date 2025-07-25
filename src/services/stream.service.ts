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

  private constructor(
    apiClient: ApiClient,
    channelUserId: string,
    eventSubListener: EventSubWsListener
  ) {
    this.apiClient = apiClient;
    this.channelUserId = channelUserId;
    this.eventSubListener = eventSubListener;
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
    // Setup auth provider
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

    await authProvider.addUserForToken({
      accessToken: channelToken.accessToken,
      refreshToken: channelToken.refreshToken,
      expiresIn: channelToken.expiresIn || null,
      obtainmentTimestamp: channelToken.obtainmentTimestamp || Date.now(),
    });

    // Create API client
    const apiClient = new ApiClient({ authProvider });

    // Setup EventSub listener
    const eventSubListener = new EventSubWsListener({
      apiClient,
    });

    eventSubListener.onStreamOnline(channelUserId, onStreamOnline);
    eventSubListener.onStreamOffline(channelUserId, onStreamOffline);
    eventSubListener.start();

    // Create service instance
    return new StreamService(
      apiClient,
      channelUserId,
      eventSubListener
    );
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
