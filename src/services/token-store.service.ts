import { Database } from 'bun:sqlite';

interface TokenRecord {
  bot_name: string;
  access_token: string;
  refresh_token: string;
  token_type: 'bot' | 'channel' | 'moderator';
  user_id: string;
  channel_name: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export class TokenStoreService {
  private db: Database;

  constructor(dbPath = './tokens.db') {
    this.db = new Database(dbPath, { create: true });
    this.initDatabase();
  }

  private initDatabase() {
    // First, check if we need to migrate the schema
    const tableInfo = this.db.prepare("PRAGMA table_info(tokens)").all();
    const hasTable = tableInfo.length > 0;
    
    if (hasTable) {
      // Backup existing data before migration
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tokens_backup AS SELECT * FROM tokens;
      `);
    }
    
    // Drop and recreate with proper schema
    this.db.exec(`
      DROP TABLE IF EXISTS tokens;
      
      CREATE TABLE tokens (
        bot_name TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        token_type TEXT NOT NULL CHECK(token_type IN ('bot', 'channel', 'moderator')),
        user_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX idx_token_type ON tokens(token_type);
      CREATE INDEX idx_user_id ON tokens(user_id);
      CREATE INDEX idx_channel_name ON tokens(channel_name);
    `);
    
    if (hasTable) {
      // Restore data from backup, setting defaults for new NOT NULL columns
      this.db.exec(`
        INSERT INTO tokens (bot_name, access_token, refresh_token, token_type, user_id, channel_name, created_at, updated_at, expires_at)
        SELECT 
          bot_name,
          access_token,
          refresh_token,
          token_type,
          COALESCE(user_id, 'unknown'),
          bot_name as channel_name,  -- Use bot_name as fallback for channel_name
          created_at,
          updated_at,
          COALESCE(expires_at, datetime('now', '+1 hour'))
        FROM tokens_backup;
        
        DROP TABLE tokens_backup;
      `);
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
    const query = this.db.prepare(`
      INSERT INTO tokens (bot_name, access_token, refresh_token, token_type, expires_at, user_id, channel_name, updated_at)
      VALUES ($botName, $accessToken, $refreshToken, $tokenType, $expiresAt, $userId, $channelName, CURRENT_TIMESTAMP)
      ON CONFLICT(bot_name) DO UPDATE SET
        access_token = $accessToken,
        refresh_token = $refreshToken,
        token_type = $tokenType,
        expires_at = $expiresAt,
        user_id = $userId,
        channel_name = $channelName,
        updated_at = CURRENT_TIMESTAMP
    `);

    query.run({
      $botName: botName,
      $accessToken: accessToken,
      $refreshToken: refreshToken,
      $tokenType: tokenType,
      $expiresAt: expiresAt.toISOString(),
      $userId: userId,
      $channelName: channelName,
    });
  }

  getToken(
    botName: string
  ): { accessToken: string; refreshToken: string; userId: string; channelName: string } | null {
    const query = this.db.prepare(
      'SELECT access_token, refresh_token, user_id, channel_name FROM tokens WHERE bot_name = $botName'
    );

    const result = query.get({ $botName: botName }) as TokenRecord | undefined;

    if (!result) {
      return null;
    }

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id,
      channelName: result.channel_name,
    };
  }

  getAllTokens(): Map<string, { accessToken: string; refreshToken: string; userId: string; channelName: string }> {
    const query = this.db.prepare(
      'SELECT bot_name, access_token, refresh_token, user_id, channel_name FROM tokens'
    );
    const results = query.all() as TokenRecord[];

    const tokens = new Map<string, { accessToken: string; refreshToken: string; userId: string; channelName: string }>();
    for (const row of results) {
      tokens.set(row.bot_name, {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        userId: row.user_id,
        channelName: row.channel_name,
      });
    }

    return tokens;
  }

  getChannelToken(): { accessToken: string; refreshToken: string; userId: string; channelName: string } | null {
    const query = this.db.prepare(
      "SELECT access_token, refresh_token, user_id, channel_name FROM tokens WHERE token_type = 'channel' LIMIT 1"
    );

    const result = query.get() as TokenRecord | undefined;

    if (!result) {
      return null;
    }

    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      userId: result.user_id,
      channelName: result.channel_name,
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
