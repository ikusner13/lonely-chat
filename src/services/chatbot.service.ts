import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import { ChatClient, type ChatMessage } from '@twurple/chat';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
}

export type TokenRefreshCallback = (
  userId: string,
  newTokenData: AccessToken
) => Promise<void>;

export class TwitchChatBot {
  private authProvider!: RefreshingAuthProvider;
  private chatClient!: ChatClient;
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
        // Update internal token data
        this.tokenData = {
          accessToken: newTokenData.accessToken,
          // biome-ignore lint/style/noNonNullAssertion: refresh token is there
          refreshToken: newTokenData.refreshToken!,
          expiresIn: newTokenData.expiresIn ?? 0,
          obtainmentTimestamp: newTokenData.obtainmentTimestamp,
        };

        // Call external callback if provided
        if (this.onTokenRefresh) {
          await this.onTokenRefresh(userId, newTokenData);
        }
      }
    );

    // Add the stored tokens
    await this.authProvider.addUserForToken(this.tokenData, ['chat']);

    // Create chat client
    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [], // Channels will be joined explicitly
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
}
