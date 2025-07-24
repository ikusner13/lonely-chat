import { ApiClient } from '@twurple/api';
import {
  type AccessToken,
  RefreshingAuthProvider,
} from '@twurple/auth';
import { ChatClient } from '@twurple/chat';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
  scope: string[];
}

export type TokenRefreshCallback = (
  userId: string,
  newTokenData: AccessToken
) => Promise<void>;

export class ModeratorBotService {
  private authProvider!: RefreshingAuthProvider;
  private chatClient!: ChatClient;
  private apiClient!: ApiClient;
  private clientId: string;
  private clientSecret: string;
  private channelName: string;
  private tokenData: TokenData;
  private onTokenRefresh?: TokenRefreshCallback;

  constructor(
    clientId: string,
    clientSecret: string,
    channelName: string,
    tokenData: TokenData
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.channelName = channelName;
    this.tokenData = tokenData;
  }

  setTokenRefreshCallback(callback: TokenRefreshCallback): void {
    this.onTokenRefresh = callback;
  }

  async initialize(): Promise<void> {
    // Verify we have moderation scopes
    const requiredScopes = [
      'chat:read',
      'chat:edit',
      'moderator:manage:banned_users',
      'moderator:manage:chat_messages',
    ];

    const hasModScopes = requiredScopes.some((scope) =>
      this.tokenData.scope.includes(scope)
    );

    if (!hasModScopes) {
      throw new Error(
        `Moderator bot requires moderation scopes. Current scopes: ${this.tokenData.scope.join(
          ', '
        )}`
      );
    }

    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    // Set up token refresh callback
    this.authProvider.onRefresh(
      async (userId: string, newTokenData: AccessToken) => {
        // Update internal token data
        this.tokenData = {
          accessToken: newTokenData.accessToken,
          refreshToken: newTokenData.refreshToken || '',
          expiresIn: newTokenData.expiresIn ?? 0,
          obtainmentTimestamp: newTokenData.obtainmentTimestamp,
          scope: this.tokenData.scope, // Preserve original scopes
        };

        // Call external callback if provided
        if (this.onTokenRefresh) {
          await this.onTokenRefresh(userId, newTokenData);
        }
      }
    );

    // Add the stored tokens with 'moderator' intent
    // The intent is just a label - the actual permissions come from the token's scopes
    await this.authProvider.addUserForToken(this.tokenData, ['moderator']);

    // Create chat client
    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [], // Channels will be joined explicitly
      // Use the moderator intent when connecting
      authIntents: ['moderator'],
    });

    // Create API client
    this.apiClient = new ApiClient({
      authProvider: this.authProvider,
    });

    // Set up chat event handlers for moderation
    this.setupModerationHandlers();
  }

  private setupModerationHandlers(): void {
    // Example: Auto-timeout users who post links (if enabled)
    this.chatClient.onMessage(async (_channel, user, text, msg) => {
      // Skip if it's our own message or from a mod/broadcaster
      if (msg.userInfo.isMod || msg.userInfo.isBroadcaster) {
        return;
      }

      // Example: Check for links
      const linkPattern = /https?:\/\/\S+/gi;
      if (linkPattern.test(text)) {
        console.log(`🔨 Link detected from ${user}, taking action...`);
        await this.timeout(msg.userInfo.userId, 60, 'Posting links');
      }
    });
  }

  async connect(): Promise<void> {
    await this.chatClient.connect();
  }

  async join(channel: string): Promise<void> {
    this.chatClient.join(channel);
    console.log(`🔨 Moderator bot joined #${channel}`);
  }

  async disconnect(): Promise<void> {
    if (this.chatClient) {
      this.chatClient.quit();
    }
  }

  // Moderation actions
  async timeout(
    userId: string,
    duration: number,
    reason?: string
  ): Promise<void> {
    try {
      const broadcaster = await this.apiClient.users.getUserByName(
        this.channelName
      );
      if (!broadcaster) {
        throw new Error('Broadcaster not found');
      }

      await this.apiClient.moderation.banUser(
        broadcaster.id,
        {
          userId,
          duration,
          reason: reason || undefined,
        }
      );
      console.log(`⏱️ Timed out user ${userId} for ${duration}s: ${reason}`);
    } catch (error) {
      console.error('Failed to timeout user:', error);
    }
  }

  async ban(userId: string, reason?: string): Promise<void> {
    try {
      const broadcaster = await this.apiClient.users.getUserByName(
        this.channelName
      );
      if (!broadcaster) {
        throw new Error('Broadcaster not found');
      }

      await this.apiClient.moderation.banUser(
        broadcaster.id,
        {
          userId,
          reason: reason || undefined,
        }
      );
      console.log(`🔨 Banned user ${userId}: ${reason}`);
    } catch (error) {
      console.error('Failed to ban user:', error);
    }
  }

  async unban(userId: string): Promise<void> {
    try {
      const broadcaster = await this.apiClient.users.getUserByName(
        this.channelName
      );
      if (!broadcaster) {
        throw new Error('Broadcaster not found');
      }

      await this.apiClient.moderation.unbanUser(
        broadcaster.id,
        userId
      );
      console.log(`✅ Unbanned user ${userId}`);
    } catch (error) {
      console.error('Failed to unban user:', error);
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      const broadcaster = await this.apiClient.users.getUserByName(
        this.channelName
      );
      if (!broadcaster) {
        throw new Error('Broadcaster not found');
      }

      await this.apiClient.moderation.deleteChatMessages(
        broadcaster.id,
        messageId
      );
      console.log(`🗑️ Deleted message ${messageId}`);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  }

  async say(message: string): Promise<void> {
    await this.chatClient.say(this.channelName, message);
  }

  getChatClient(): ChatClient {
    return this.chatClient;
  }

  getApiClient(): ApiClient {
    return this.apiClient;
  }
}