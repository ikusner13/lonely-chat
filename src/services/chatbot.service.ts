import { ApiClient } from '@twurple/api';
import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient, type ChatMessage } from '@twurple/chat';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
  scope?: string[];
  userId?: string;
}

export type TokenRefreshCallback = (
  userId: string,
  newTokenData: AccessToken
) => Promise<void>;

export class TwitchChatBot {
  private authProvider!: RefreshingAuthProvider;
  private chatClient!: ChatClient;
  private apiClient!: ApiClient;
  private clientId: string;
  private clientSecret: string;
  private tokenData: TokenData;
  private onTokenRefresh?: TokenRefreshCallback;

  constructor(clientId: string, clientSecret: string, tokenData: TokenData) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tokenData = tokenData;
  }

  setTokenRefreshCallback(callback: TokenRefreshCallback): void {
    this.onTokenRefresh = callback;
  }

  async initialize(): Promise<void> {
    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    // Set up token refresh callback
    this.authProvider.onRefresh(
      async (userId: string, newTokenData: AccessToken) => {
        // Update internal token data - PRESERVE the original bot's userId and scope
        // Update token data while preserving bot-specific fields
        this.tokenData = {
          ...this.tokenData, // Keep all existing fields
          accessToken: newTokenData.accessToken,
          // biome-ignore lint/style/noNonNullAssertion: refresh token is there
          refreshToken: newTokenData.refreshToken!,
          expiresIn: newTokenData.expiresIn ?? 0,
          obtainmentTimestamp: newTokenData.obtainmentTimestamp,
        };

        // Call external callback if provided
        if (this.onTokenRefresh) {
          await this.onTokenRefresh(
            this.tokenData.userId || userId,
            newTokenData
          );
        }
      }
    );

    // Add the stored tokens with appropriate intents
    const intents = ['chat'];

    // Check if this bot has moderator permissions
    const hasModeratorScopes = this.tokenData.scope?.some((scope) =>
      scope.startsWith('moderator:')
    );

    if (hasModeratorScopes) {
      intents.push('moderator');
    }

    // Add the bot's token to the auth provider
    // The userId should already be in the tokenData from token generation
    console.log(`🔍 Bot token data userId: ${this.tokenData.userId}`);
    console.log(`🔍 Bot token scopes: ${this.tokenData.scope?.join(', ')}`);

    await this.authProvider.addUserForToken(this.tokenData, intents);

    // Create chat client
    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [], // Channels will be joined explicitly
    });

    // Re-create API client with proper auth
    this.apiClient = new ApiClient({
      authProvider: this.authProvider,
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle successful connection
    this.chatClient.onConnect(() => {
      console.log('Connected to Twitch chat');
    });

    // Handle disconnection
    this.chatClient.onDisconnect((manually: boolean) => {
      console.log(
        `Disconnected from Twitch chat ${
          manually ? 'manually' : 'unexpectedly'
        }`
      );
    });

    // Handle incoming messages
    this.chatClient.onMessage(
      (channel: string, user: string, message: string, _msg: ChatMessage) => {
        console.log(`[${channel}] ${user}: ${message}`);

        // Example: Respond to !hello command
        if (message === '!hello') {
          this.chatClient.say(channel, `Hello ${user}!`);
        }
      }
    );
  }

  connect(): void {
    this.chatClient.connect();
  }

  disconnect(): void {
    this.chatClient.quit();
  }

  async joinChannel(channel: string): Promise<void> {
    await this.chatClient.join(channel);
  }

  leaveChannel(channel: string): void {
    this.chatClient.part(channel);
  }

  async sendMessage(channel: string, message: string): Promise<void> {
    await this.chatClient.say(channel, message);
  }

  getCurrentTokenData(): TokenData {
    return { ...this.tokenData };
  }

  onMessage(
    handler: (
      channel: string,
      user: string,
      message: string,
      msg: ChatMessage
    ) => void
  ): void {
    this.chatClient.onMessage(handler);
  }

  getApiClient(): ApiClient {
    return this.apiClient;
  }

  getUserId(): string | undefined {
    return this.tokenData.userId;
  }

  getCurrentUser() {
    // Return cached user info if we have the userId
    if (this.tokenData.userId) {
      return {
        id: this.tokenData.userId,
        name: 'bot', // We don't have the name cached
      };
    }
    return null;
  }

  getChatClient(): ChatClient {
    return this.chatClient;
  }
}
