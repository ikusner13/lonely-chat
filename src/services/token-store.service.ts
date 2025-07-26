import { Database } from 'bun:sqlite';

interface TokenRecord {
  bot_name: string;
  access_token: string;
  refresh_token: string;
  token_type: 'bot' | 'channel' | 'moderator';
  user_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export class TokenStoreService {
  private db: Database;

  constructor(dbPath = './tokens.db') {
    this.db = new Database(dbPath, { create: true });
    this.initDatabase();
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        bot_name TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_type TEXT NOT NULL CHECK(token_type IN ('bot', 'channel', 'moderator')),
        user_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_token_type ON tokens(token_type);
    `);
  }

  saveToken(
    botName: string,
    accessToken: string,
    refreshToken: string,
    tokenType: 'bot' | 'channel' | 'moderator',
    expiresAt?: Date,
    userId?: string
  ): void {
    const query = this.db.prepare(`
      INSERT INTO tokens (bot_name, access_token, refresh_token, token_type, expires_at, user_id, updated_at)
      VALUES ($botName, $accessToken, $refreshToken, $tokenType, $expiresAt, $userId, CURRENT_TIMESTAMP)
      ON CONFLICT(bot_name) DO UPDATE SET
        access_token = $accessToken,
        refresh_token = $refreshToken,
        token_type = $tokenType,
        expires_at = $expiresAt,
        user_id = $userId,
        updated_at = CURRENT_TIMESTAMP
    `);

    query.run({
      $botName: botName,
      $accessToken: accessToken,
      $refreshToken: refreshToken,
      $tokenType: tokenType,
      $expiresAt: expiresAt?.toISOString() || null,
      $userId: userId || null,
    });
  }

  getToken(
    botName: string
  ): { accessToken: string; refreshToken: string; userId?: string } | null {
    const query = this.db.prepare(
      'SELECT access_token, refresh_token, user_id FROM tokens WHERE bot_name = $botName'
    );

    const result = query.get({ $botName: botName }) as TokenRecord | undefined;

    if (!result) {
      return null;
    }

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id || undefined,
    };
  }

  getAllTokens(): Map<string, { accessToken: string; refreshToken: string; userId?: string }> {
    const query = this.db.prepare(
      'SELECT bot_name, access_token, refresh_token, user_id FROM tokens'
    );
    const results = query.all() as TokenRecord[];

    const tokens = new Map<string, { accessToken: string; refreshToken: string; userId?: string }>();
    for (const row of results) {
      tokens.set(row.bot_name, {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        userId: row.user_id || undefined,
      });
    }

    return tokens;
  }

  getChannelToken(): { accessToken: string; refreshToken: string; userId?: string } | null {
    const query = this.db.prepare(
      "SELECT access_token, refresh_token, user_id FROM tokens WHERE token_type = 'channel' LIMIT 1"
    );

    const result = query.get() as TokenRecord | undefined;

    if (!result) {
      return null;
    }

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id || undefined,
    };
  }

  deleteToken(botName: string): void {
    const query = this.db.prepare(
      'DELETE FROM tokens WHERE bot_name = $botName'
    );
    query.run({ $botName: botName });
  }

  close(): void {
    this.db.close();
  }
}
