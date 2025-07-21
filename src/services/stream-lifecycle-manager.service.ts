import { EventEmitter } from 'node:events';
import { env } from '@/env';
import type { BotManager } from './bot-manager.service';
import { EventSubService } from './eventsub.service';
import type { StreamService } from './stream.service';
import type { TokenData, TokenManager } from './token.service';

export interface StreamLifecycleEvents {
  'stream:online': (broadcasterName: string) => void;
  'stream:offline': (broadcasterName: string) => void;
  'bots:connected': () => void;
  'bots:disconnected': () => void;
  'token:refreshed': (userId: string, newToken: TokenData) => void;
}

export class StreamLifecycleManager extends EventEmitter {
  private eventSubService?: EventSubService;
  private streamService: StreamService;
  private botManager: BotManager;
  private tokenManager: TokenManager;
  private channelUserId: string;
  private channelName: string;
  private isStreamOnline = false;

  constructor(
    streamService: StreamService,
    botManager: BotManager,
    tokenManager: TokenManager
  ) {
    super();
    this.streamService = streamService;
    this.botManager = botManager;
    this.tokenManager = tokenManager;
    this.channelUserId = env.TWITCH_CHANNEL_ID;
    this.channelName = env.TWITCH_CHANNEL_NAME;
  }

  async start(channelToken: TokenData): Promise<void> {
    console.log('🚀 Starting StreamLifecycleManager...');

    // Initialize EventSub if not disabled
    if (env.DISABLE_EVENTSUB) {
      console.log(
        '⚠️ EventSub is disabled via DISABLE_EVENTSUB environment variable'
      );
    } else {
      await this.initializeEventSub(channelToken);
    }

    // Check initial stream status
    await this.checkInitialStreamState();
  }

  private async initializeEventSub(channelToken: TokenData): Promise<void> {
    console.log('📡 Initializing EventSub service...');

    // Create EventSub service
    this.eventSubService = new EventSubService(
      env.TWITCH_CLIENT_ID,
      env.TWITCH_CLIENT_SECRET,
      this.channelUserId
    );

    // Set up token refresh callback
    this.eventSubService.setTokenRefreshCallback(
      async (userId, newTokenData) => {
        const updatedToken = this.tokenManager.convertAccessToken(
          newTokenData,
          userId
        );
        await this.tokenManager.updateChannelToken(updatedToken);
        this.emit('token:refreshed', userId, updatedToken);
      }
    );

    // Initialize with callbacks
    await this.eventSubService.initialize(channelToken, {
      onStreamOnline: async (event) => {
        console.log(
          `🟢 Stream went online! ${event.broadcasterDisplayName} is now live!`
        );
        await this.handleStreamOnline(event.broadcasterDisplayName);
      },
      onStreamOffline: async (event) => {
        console.log(
          `🔴 Stream went offline! ${event.broadcasterDisplayName} has ended the stream.`
        );
        await this.handleStreamOffline(event.broadcasterDisplayName);
      },
    });
  }

  async checkInitialStreamState(): Promise<void> {
    const isOnline =
      env.NODE_ENV === 'development'
        ? true
        : await this.streamService.isStreamOnline();

    if (isOnline) {
      console.log('🎮 Stream is already online! Connecting bots...');
      await this.handleStreamOnline(this.channelName);
    } else {
      console.log(
        '⏳ Stream is offline. Bots will connect when stream goes online.'
      );
    }
  }

  private async handleStreamOnline(broadcasterName: string): Promise<void> {
    this.isStreamOnline = true;
    this.emit('stream:online', broadcasterName);

    await this.botManager.connectAllBots(this.channelName, true);
    this.emit('bots:connected');
  }

  private async handleStreamOffline(broadcasterName: string): Promise<void> {
    this.isStreamOnline = false;
    this.emit('stream:offline', broadcasterName);

    await this.botManager.disconnectAllBots(this.channelName);
    this.emit('bots:disconnected');
  }

  getStreamStatus(): boolean {
    return this.isStreamOnline;
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping StreamLifecycleManager...');

    // Disconnect all bots if online
    if (this.isStreamOnline) {
      await this.botManager.disconnectAllBots(this.channelName);
    }

    // Stop EventSub service
    if (this.eventSubService) {
      await this.eventSubService.stop();
    }

    // Remove all listeners
    this.removeAllListeners();
  }
}
