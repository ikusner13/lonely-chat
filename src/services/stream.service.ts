import { ApiClient } from '@twurple/api';
import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { createLogger } from '@/utils/logger';
import type { TokenManager } from './token.service';

export class StreamService {
  private readonly apiClient: ApiClient;
  private readonly channelUserId: string;
  private readonly eventSubListener: EventSubWsListener;
  private logger = createLogger('StreamService');

  private constructor(
    apiClient: ApiClient,
    channelUserId: string,
    eventSubListener: EventSubWsListener
  ) {
    this.apiClient = apiClient;
    this.channelUserId = channelUserId;
    this.eventSubListener = eventSubListener;
  }

  static async createAndMonitor({
    clientId,
    clientSecret,
    channelUserId,
    tokenManager,
    onConnect,
    onDisconnect,
  }: {
    clientId: string;
    clientSecret: string;
    channelUserId: string;
    tokenManager: TokenManager;
    onConnect: () => void | Promise<void>;
    onDisconnect: () => void;
  }): Promise<StreamService> {
    const channelToken = tokenManager.getChannelToken();
    if (!channelToken) {
      throw new Error(
        'Channel token not found. Run: bun run generate-channel-token'
      );
    }
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
      expiresIn: null,
      obtainmentTimestamp: Date.now(),
    });

    const apiClient = new ApiClient({ authProvider });

    const eventSubListener = new EventSubWsListener({
      apiClient,
    });

    const logger = createLogger('StreamService');

    eventSubListener.onStreamOnline(channelUserId, async () => {
      logger.info('🟢 Stream is online! Connecting bots...');
      await onConnect();
    });

    eventSubListener.onStreamOffline(channelUserId, () => {
      logger.info('🔴 Stream is offline! Disconnecting bots...');
      onDisconnect();
    });

    eventSubListener.start();

    const service = new StreamService(
      apiClient,
      channelUserId,
      eventSubListener
    );

    // Check if stream is already online
    const isOnline = await service.isStreamOnline();
    if (isOnline) {
      logger.info('🟢 Stream is already online, connecting bots...');
      await onConnect();
    } else {
      logger.info('⏸️  Stream is offline, waiting for stream to go online...');
    }

    return service;
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
      this.logger.error({ err: error }, '❌ Error checking stream status');
      return false;
    }
  }

  stop(): void {
    this.eventSubListener.stop();
  }
}
