import type { AccessToken } from '@twurple/auth';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string;
  channelName?: string;
}

export interface TokenStorage {
  channel?: TokenData;
  bots: Record<string, TokenData>;
}

export interface BotTokenFormat {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
}

export class TokenManager {
  private readonly mainTokenPath: string;
  private tokenCache: TokenStorage | null = null;
  private botTokenPaths: Map<string, string> = new Map();

  constructor(mainTokenPath = './tokens.json') {
    this.mainTokenPath = mainTokenPath;
  }

  async loadTokens(): Promise<TokenStorage> {
    const file = Bun.file(this.mainTokenPath);
    if (!(await file.exists())) {
      throw new Error(`Token file not found: ${this.mainTokenPath}`);
    }

    const data = await file.text();
    this.tokenCache = JSON.parse(data) as TokenStorage;
    return this.tokenCache;
  }

  async saveTokens(tokens: TokenStorage): Promise<void> {
    this.tokenCache = tokens;
    await Bun.write(this.mainTokenPath, JSON.stringify(tokens, null, 2));
  }

  async getChannelToken(): Promise<TokenData | undefined> {
    if (!this.tokenCache) {
      await this.loadTokens();
    }
    return this.tokenCache?.channel;
  }

  async getBotTokens(): Promise<Record<string, TokenData>> {
    if (!this.tokenCache) {
      await this.loadTokens();
    }
    return this.tokenCache?.bots || {};
  }

  async getBotToken(botName: string): Promise<TokenData | undefined> {
    const tokens = await this.getBotTokens();
    return tokens[botName];
  }

  async createBotTokenFile(botName: string): Promise<string> {
    const tokenData = await this.getBotToken(botName);
    if (!tokenData) {
      throw new Error(`No token found for bot: ${botName}`);
    }

    const botTokenPath = `./bot-${botName}-token.json`;
    const botTokenFormat: BotTokenFormat = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: 0, // Will be refreshed
      obtainmentTimestamp: Date.now(),
    };

    await Bun.write(botTokenPath, JSON.stringify(botTokenFormat, null, 2));
    this.botTokenPaths.set(botName, botTokenPath);

    return botTokenPath;
  }

  async updateChannelToken(updatedToken: Partial<TokenData>): Promise<void> {
    if (!this.tokenCache) {
      await this.loadTokens();
    }

    if (this.tokenCache?.channel) {
      this.tokenCache.channel = {
        ...this.tokenCache.channel,
        ...updatedToken,
        savedAt: new Date().toISOString(),
      };
      await this.saveTokens(this.tokenCache);
    }
  }

  async updateBotToken(
    botName: string,
    updatedToken: Partial<TokenData>
  ): Promise<void> {
    if (!this.tokenCache) {
      await this.loadTokens();
    }

    if (this.tokenCache?.bots[botName]) {
      this.tokenCache.bots[botName] = {
        ...this.tokenCache.bots[botName],
        ...updatedToken,
        savedAt: new Date().toISOString(),
      };
      await this.saveTokens(this.tokenCache);
    }
  }

  // Helper to convert Twurple AccessToken to our TokenData format
  convertAccessToken(token: AccessToken, userId?: string): Partial<TokenData> {
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken || '',
      accessTokenExpiresAt: token.expiresIn
        ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      scope: token.scope || [],
      userId,
    };
  }

  // Get all bot token file paths
  getBotTokenPaths(): Map<string, string> {
    return new Map(this.botTokenPaths);
  }

  // Clean up bot token files
  async cleanupBotTokenFiles(): Promise<void> {
    for (const [botName, path] of this.botTokenPaths) {
      try {
        const file = Bun.file(path);
        // biome-ignore lint/nursery/noAwaitInLoop: fine
        if (await file.exists()) {
          await file.delete();
          console.log(`🗑️ Cleaned up token file for ${botName}`);
        }
      } catch (error) {
        console.error(`Failed to clean up token file for ${botName}:`, error);
      }
    }

    this.botTokenPaths.clear();
  }
}
