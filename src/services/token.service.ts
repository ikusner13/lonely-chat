import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import { env } from '@/env';
import { createLogger } from '@/utils/logger';
import { SQLiteTokenStore } from './sqlite-token-store';

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

export class TokenManager {
  private tokenStore: SQLiteTokenStore;
  private authProviders = new Map<string, RefreshingAuthProvider>();
  private userIds = new Map<string, string>();
  private logger = createLogger('TokenManager');

  constructor(dbPath?: string) {
    this.tokenStore = new SQLiteTokenStore(dbPath);
    this.logger.info(
      `Token database initialized at: ${dbPath || './data/tokens.db'}`
    );
  }

  async getAuthProvider(name: string): Promise<RefreshingAuthProvider> {
    // Check cache first
    if (this.authProviders.has(name)) {
      return this.authProviders.get(name)!;
    }

    // Load from database - sync operation with Bun
    const tokenData = this.tokenStore.getToken(name);
    if (!tokenData) {
      throw new Error(
        `No token found for ${name}. Please run the auth server.`
      );
    }

    // Create auth provider
    const authProvider = new RefreshingAuthProvider({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
    });

    // Set up auto-save on refresh
    authProvider.onRefresh(async (refreshUserId, newTokenData) => {
      // Use atomic refresh for consistency
      await this.tokenStore.refreshTokenAtomic(name, newTokenData, refreshUserId);
      this.logger.info(`Token refreshed and saved for ${name}`);
    });

    // Add user with token and get user ID
    const userId = await authProvider.addUserForToken(tokenData);

    // Store user ID
    this.userIds.set(name, userId);

    // Cache for reuse
    this.authProviders.set(name, authProvider);
    this.logger.info(
      `Auth provider created for ${name} with user ID ${userId}`
    );

    return authProvider;
  }

  saveToken(name: string, token: AccessToken, userId?: string): void {
    this.tokenStore.saveToken(name, token, userId);
    this.logger.info(`Token saved for ${name}`);
  }

  getUserId(name: string): string | null {
    // Check cache first
    if (this.userIds.has(name)) {
      return this.userIds.get(name)!;
    }

    // Check database
    const userId = this.tokenStore.getUserId(name);
    if (userId) {
      this.userIds.set(name, userId);
    }
    return userId;
  }

  hasTokens(): boolean {
    return this.tokenStore.hasTokens();
  }

  getAllTokens() {
    return this.tokenStore.getAllTokens();
  }

  close(): void {
    this.tokenStore.close();
  }

  // Compatibility methods for auth server
  loadTokens(): TokenStorage {
    const allTokens = this.getAllTokens();
    const storage: TokenStorage = {
      channel: undefined,
      bots: {},
    };

    for (const { name, token } of allTokens) {
      const tokenData: TokenData = {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken || '',
        accessTokenExpiresAt: new Date(
          Date.now() + (token.expiresIn || 3600) * 1000
        ).toISOString(),
        savedAt: new Date().toISOString(),
        scope: token.scope || [],
        userId: this.getUserId(name) || undefined,
        channelName: name,
      };

      if (name === 'channel') {
        storage.channel = tokenData;
      } else {
        storage.bots[name] = tokenData;
      }
    }

    return storage;
  }

  async saveTokens(tokens: TokenStorage): Promise<void> {
    // Save channel token
    if (tokens.channel) {
      await this.saveToken(
        'channel',
        {
          accessToken: tokens.channel.accessToken,
          refreshToken: tokens.channel.refreshToken,
          expiresIn: 0,
          obtainmentTimestamp: Date.now(),
          scope: tokens.channel.scope,
        },
        tokens.channel.userId
      );
    }

    // Save bot tokens
    for (const [name, tokenData] of Object.entries(tokens.bots)) {
      await this.saveToken(
        name,
        {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresIn: 0,
          obtainmentTimestamp: Date.now(),
          scope: tokenData.scope,
        },
        tokenData.userId
      );
    }
  }
}
