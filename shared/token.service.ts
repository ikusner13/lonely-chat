import { type AccessToken, RefreshingAuthProvider } from '@twurple/auth';
import { createLogger } from './logger';
import { SQLiteTokenStore } from './sqlite-token-store';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string | null;
  channelName?: string;
}

export interface TokenStorage {
  channel?: TokenData;
  bots: Record<string, TokenData>;
}

export interface TokenManagerConfig {
  clientId: string;
  clientSecret: string;
  dbPath?: string;
}

export class TokenManager {
  private tokenStore: SQLiteTokenStore;
  private authProviders = new Map<string, RefreshingAuthProvider>();
  private userIds = new Map<string, string>();
  private logger = createLogger('TokenManager');
  private clientId: string;
  private clientSecret: string;

  constructor(config: TokenManagerConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenStore = new SQLiteTokenStore(config.dbPath);
    this.logger.info(
      `Token database initialized at: ${config.dbPath || './data/tokens.db'}`
    );
  }

  async getAuthProvider(name: string): Promise<RefreshingAuthProvider> {
    // Check cache first
    const cachedProvider = this.authProviders.get(name);
    if (cachedProvider) {
      return cachedProvider;
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
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    // Set up auto-save on refresh
    authProvider.onRefresh(async (refreshUserId, newTokenData) => {
      // Use atomic refresh for consistency
      await this.tokenStore.refreshTokenAtomic(
        name,
        newTokenData,
        refreshUserId
      );
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
    const cachedUserId = this.userIds.get(name);
    if (cachedUserId) {
      return cachedUserId;
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

  deleteToken(name: string): void {
    this.tokenStore.deleteToken(name);
    this.userIds.delete(name);
    this.authProviders.delete(name);
  }

  async refreshToken(type: 'channel' | 'bot', name: string): Promise<void> {
    const tokenName = type === 'channel' ? 'channel' : name;
    const authProvider = await this.getAuthProvider(tokenName);
    // Force a token refresh by getting current user
    await authProvider.getCurrentUserId();
  }

  close(): void {
    this.tokenStore.close();
  }

  // Compatibility methods for auth server
  loadTokens(): TokenStorage {
    const allTokens = this.getAllTokens();
    const storage: TokenStorage = {
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
        userId: this.getUserId(name),
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

  saveTokens(tokens: TokenStorage): void {
    // Save channel token
    if (tokens.channel) {
      this.saveToken(
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
      this.saveToken(
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
