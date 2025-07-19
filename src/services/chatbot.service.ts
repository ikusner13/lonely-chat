import { RefreshingAuthProvider, AccessToken } from "@twurple/auth";
import { ChatClient, ChatMessage } from "@twurple/chat";
import { promises as fs } from "fs";

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
}

export class TwitchChatBot {
  private authProvider!: RefreshingAuthProvider;
  private chatClient!: ChatClient;
  private clientId: string;
  private clientSecret: string;
  private tokenFilePath: string;

  constructor(
    clientId: string,
    clientSecret: string,
    tokenFilePath: string = "./tokens.json"
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tokenFilePath = tokenFilePath;
  }

  async initialize(): Promise<void> {
    // Load token data
    const tokenData = await this.loadTokenData();

    // Create auth provider
    this.authProvider = new RefreshingAuthProvider({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    // Set up token refresh callback
    this.authProvider.onRefresh(
      async (_userId: string, newTokenData: AccessToken) => {
        await this.saveTokenData({
          accessToken: newTokenData.accessToken,
          refreshToken: newTokenData.refreshToken!,
          expiresIn: newTokenData.expiresIn ?? 0,
          obtainmentTimestamp: newTokenData.obtainmentTimestamp,
        });
      }
    );

    // Add the stored tokens
    await this.authProvider.addUserForToken(tokenData, ["chat"]);

    // Create chat client
    this.chatClient = new ChatClient({
      authProvider: this.authProvider,
      channels: [], // Will be set when connecting to channels
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle successful connection
    this.chatClient.onConnect(() => {
      console.log("Connected to Twitch chat");
    });

    // Handle disconnection
    this.chatClient.onDisconnect((manually: boolean) => {
      console.log(
        `Disconnected from Twitch chat ${
          manually ? "manually" : "unexpectedly"
        }`
      );
    });

    // Handle incoming messages
    this.chatClient.onMessage(
      (channel: string, user: string, message: string, _msg: ChatMessage) => {
        console.log(`[${channel}] ${user}: ${message}`);

        // Example: Respond to !hello command
        if (message === "!hello") {
          this.chatClient.say(channel, `Hello ${user}!`);
        }
      }
    );
  }

  async connect(): Promise<void> {
    this.chatClient.connect();
  }

  async disconnect(): Promise<void> {
    this.chatClient.quit();
  }

  async joinChannel(channel: string): Promise<void> {
    await this.chatClient.join(channel);
  }

  async leaveChannel(channel: string): Promise<void> {
    this.chatClient.part(channel);
  }

  async sendMessage(channel: string, message: string): Promise<void> {
    await this.chatClient.say(channel, message);
  }

  private async loadTokenData(): Promise<TokenData> {
    try {
      const tokenFileContent = await fs.readFile(this.tokenFilePath, "utf-8");
      return JSON.parse(tokenFileContent);
    } catch (error) {
      throw new Error(`Failed to load token data: ${error}`);
    }
  }

  private async saveTokenData(tokenData: TokenData): Promise<void> {
    try {
      await fs.writeFile(
        this.tokenFilePath,
        JSON.stringify(tokenData, null, 2)
      );
    } catch (error) {
      console.error("Failed to save token data:", error);
    }
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
