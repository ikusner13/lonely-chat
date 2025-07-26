import type { AccessToken } from '@twurple/auth';
import { createLogger } from '@/utils/logger';
import { TokenStoreService } from './token-store.service';

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
  private tokenStore: TokenStoreService;
  private logger = createLogger('TokenManager');
  private botTokenPaths: Map<string, string> = new Map();

  constructor(dbPath = './tokens.db') {
    this.tokenStore = new TokenStoreService(dbPath);
  }

  loadTokens(): TokenStorage {
    const allTokens = this.tokenStore.getAllTokens();
    const channelToken = this.tokenStore.getChannelToken();

    const storage: TokenStorage = {
      bots: {},
    };

    if (channelToken) {
      storage.channel = {
        ...channelToken,
        accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        savedAt: new Date().toISOString(),
        scope: [],
      };
    }

    for (const [botName, token] of allTokens) {
      if (botName !== 'channel') {
        storage.bots[botName] = {
          ...token,
          accessTokenExpiresAt: new Date(
            Date.now() + 3600 * 1000
          ).toISOString(),
          savedAt: new Date().toISOString(),
          scope: [],
        };
      }
    }

    return storage;
  }

  saveTokens(tokens: TokenStorage): void {
    // Save channel token
    if (tokens.channel) {
      this.tokenStore.saveToken(
        'channel',
        tokens.channel.accessToken,
        tokens.channel.refreshToken,
        'channel',
        new Date(tokens.channel.accessTokenExpiresAt),
        tokens.channel.userId!,
        tokens.channel.channelName!
      );
    }

    // Save bot tokens
    for (const [botName, tokenData] of Object.entries(tokens.bots)) {
      this.tokenStore.saveToken(
        botName,
        tokenData.accessToken,
        tokenData.refreshToken,
        'bot',
        new Date(tokenData.accessTokenExpiresAt),
        tokenData.userId!,
        tokenData.channelName || botName
      );
    }
  }

  getChannelToken(): TokenData | undefined {
    const token = this.tokenStore.getChannelToken();
    if (!token) {
      return;
    }

    return {
      ...token,
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      savedAt: new Date().toISOString(),
      scope: [],
      userId: token.userId,
    };
  }

  getBotTokens(): Record<string, TokenData> {
    const allTokens = this.tokenStore.getAllTokens();
    const bots: Record<string, TokenData> = {};

    for (const [botName, token] of allTokens) {
      if (botName !== 'channel') {
        bots[botName] = {
          ...token,
          accessTokenExpiresAt: new Date(
            Date.now() + 3600 * 1000
          ).toISOString(),
          savedAt: new Date().toISOString(),
          scope: [],
          userId: token.userId,
        };
      }
    }

    return bots;
  }

  getBotToken(botName: string): TokenData | undefined {
    const token = this.tokenStore.getToken(botName);
    if (!token) {
      return;
    }

    return {
      ...token,
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      savedAt: new Date().toISOString(),
      scope: [],
      userId: token.userId,
    };
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
    const current = await this.getChannelToken();
    if (!current) {
      throw new Error('No channel token to update');
    }

    const merged = {
      ...current,
      ...updatedToken,
      savedAt: new Date().toISOString(),
    };

    this.tokenStore.saveToken(
      'channel',
      merged.accessToken,
      merged.refreshToken,
      'channel',
      new Date(merged.accessTokenExpiresAt),
      merged.userId!,
      merged.channelName!
    );
  }

  async updateBotToken(
    botName: string,
    updatedToken: Partial<TokenData>
  ): Promise<void> {
    const current = await this.getBotToken(botName);
    if (!current) {
      throw new Error(`No token found for bot: ${botName}`);
    }

    const merged = {
      ...current,
      ...updatedToken,
      savedAt: new Date().toISOString(),
    };

    this.tokenStore.saveToken(
      botName,
      merged.accessToken,
      merged.refreshToken,
      'bot',
      new Date(merged.accessTokenExpiresAt),
      merged.userId!,
      merged.channelName || botName
    );
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
          this.logger.info(`🗑️ Cleaned up token file for ${botName}`);
        }
      } catch (error) {
        this.logger.error(
          { err: error },
          `Failed to clean up token file for ${botName}`
        );
      }
    }

    this.botTokenPaths.clear();
  }

  // Close database connection
  close(): void {
    this.tokenStore.close();
  }
}
