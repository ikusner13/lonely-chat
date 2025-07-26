import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createLogger } from '@/utils/logger';

interface TokenRecord {
  botName: string;
  accessToken: string;
  refreshToken: string;
  tokenType: 'bot' | 'channel' | 'moderator';
  userId: string;
  channelName: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export class TokenJsonStoreService {
  private logger = createLogger('TokenJsonStoreService');
  private tokens: Map<string, TokenRecord> = new Map();
  private filePath: string;

  constructor(filePath = process.env.TOKEN_JSON_PATH || '/data/tokens.json') {
    this.filePath = filePath;
    this.logger.info({ filePath }, 'Initializing TokenJsonStoreService');
    this.loadTokens();
  }

  private loadTokens(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as TokenRecord[];
        this.tokens = new Map(parsed.map((token) => [token.botName, token]));
        this.logger.info(
          { count: this.tokens.size },
          'Loaded tokens from file'
        );
      } else {
        this.logger.info('No existing token file found, starting fresh');
      }
    } catch (error) {
      this.logger.warn(
        { error },
        'Failed to load tokens from file, starting fresh'
      );
    }
  }

  private saveTokens(): void {
    try {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = Array.from(this.tokens.values());
      writeFileSync(this.filePath, JSON.stringify(data, null, 2));
      this.logger.debug('Tokens saved to file');
    } catch (error) {
      // Log the error but don't throw - we can continue operating from memory
      this.logger.error(
        { error },
        'Failed to save tokens to file, continuing with in-memory storage'
      );
    }
  }

  saveToken(
    botName: string,
    accessToken: string,
    refreshToken: string,
    tokenType: 'bot' | 'channel' | 'moderator',
    expiresAt: Date,
    userId: string,
    channelName: string
  ): void {
    const now = new Date().toISOString();
    const token: TokenRecord = {
      botName,
      accessToken,
      refreshToken,
      tokenType,
      userId,
      channelName,
      createdAt: this.tokens.get(botName)?.createdAt || now,
      updatedAt: now,
      expiresAt: expiresAt.toISOString(),
    };

    this.tokens.set(botName, token);
    this.saveTokens();
  }

  getToken(botName: string): {
    accessToken: string;
    refreshToken: string;
    userId: string;
    channelName: string;
  } | null {
    const token = this.tokens.get(botName);
    if (!token) {
      return null;
    }

    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      userId: token.userId,
      channelName: token.channelName,
    };
  }

  getAllTokens(): Map<
    string,
    {
      accessToken: string;
      refreshToken: string;
      userId: string;
      channelName: string;
    }
  > {
    const result = new Map<
      string,
      {
        accessToken: string;
        refreshToken: string;
        userId: string;
        channelName: string;
      }
    >();

    for (const [botName, token] of this.tokens) {
      result.set(botName, {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        userId: token.userId,
        channelName: token.channelName,
      });
    }

    return result;
  }

  getChannelToken(): {
    accessToken: string;
    refreshToken: string;
    userId: string;
    channelName: string;
  } | null {
    for (const token of this.tokens.values()) {
      if (token.tokenType === 'channel') {
        return {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          userId: token.userId,
          channelName: token.channelName,
        };
      }
    }
    return null;
  }

  deleteToken(botName: string): void {
    this.tokens.delete(botName);
    this.saveTokens();
  }

  close(): void {
    // No-op for JSON store
  }
}
