import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AccessToken } from '@twurple/auth';
import { env } from '@/env';
import { createLogger } from '@/utils/logger';

export class SQLiteTokenStore {
  private db: Database;
  private logger = createLogger('SQLiteTokenStore');

  constructor(dbPath: string = env.TOKEN_DB_PATH) {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Open/create database with Bun's SQLite
    this.db = new Database(dbPath, { create: true });

    // Enable WAL mode for better concurrency
    this.db.exec('PRAGMA journal_mode = WAL');

    // Initialize schema
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        name TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_in INTEGER,
        obtainment_timestamp INTEGER,
        scopes TEXT,
        user_id TEXT,
        updated_at INTEGER DEFAULT (unixepoch())
      );
      
      CREATE INDEX IF NOT EXISTS idx_tokens_updated ON tokens(updated_at);
    `);
  }

  getToken(name: string): AccessToken | null {
    const query = this.db.query('SELECT * FROM tokens WHERE name = ?');
    const row = query.get(name) as any;

    if (!row) {
      return null;
    }

    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresIn: row.expires_in || 0,
      obtainmentTimestamp: row.obtainment_timestamp || 0,
      scope: row.scopes ? row.scopes.split(',') : [],
    };
  }

  saveToken(name: string, token: AccessToken, userId?: string): void {
    const query = this.db.prepare(`
      INSERT INTO tokens (name, access_token, refresh_token, expires_in, obtainment_timestamp, scopes, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_in = excluded.expires_in,
        obtainment_timestamp = excluded.obtainment_timestamp,
        scopes = excluded.scopes,
        user_id = excluded.user_id,
        updated_at = unixepoch()
    `);

    query.run(
      name,
      token.accessToken,
      token.refreshToken,
      token.expiresIn || 0,
      token.obtainmentTimestamp || Date.now(),
      token.scope?.join(',') || '',
      userId || null
    );
  }

  getAllTokens(): Array<{ name: string; token: AccessToken }> {
    const query = this.db.query('SELECT * FROM tokens ORDER BY name');
    const rows = query.all() as any[];

    return rows.map((row) => ({
      name: row.name,
      token: {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresIn: row.expires_in || 0,
        obtainmentTimestamp: row.obtainment_timestamp || 0,
        scope: row.scopes ? row.scopes.split(',') : [],
      },
    }));
  }

  deleteToken(name: string): void {
    const query = this.db.prepare('DELETE FROM tokens WHERE name = ?');
    query.run(name);
  }

  hasTokens(): boolean {
    const query = this.db.query('SELECT COUNT(*) as count FROM tokens');
    const result = query.get() as any;
    return result.count > 0;
  }

  getUserId(name: string): string | null {
    const query = this.db.query('SELECT user_id FROM tokens WHERE name = ?');
    const row = query.get(name) as any;
    return row?.user_id || null;
  }

  // Bun SQLite transactions for atomic operations
  refreshTokenAtomic(name: string, token: AccessToken, userId?: string): void {
    this.db.transaction(() => {
      // Log the old token for audit
      const oldToken = this.getToken(name);
      if (oldToken) {
        this.logger.info({ name }, 'Refreshing token');
      }

      // Save new token
      this.saveToken(name, token, userId);
    })();
  }

  close(): void {
    this.db.close();
  }
}
