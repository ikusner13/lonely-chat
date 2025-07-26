#!/usr/bin/env bun
import { Database } from 'bun:sqlite';
import { writeFileSync } from 'node:fs';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MigrateToJson');

// Try to read from old SQLite database
const dbPath = process.env.TOKEN_DB_PATH || './tokens.db';
const jsonPath = process.env.TOKEN_JSON_PATH || './tokens.json';

try {
  logger.info({ dbPath, jsonPath }, 'Starting migration from SQLite to JSON');

  const db = new Database(dbPath, { readonly: true });

  const query = db.prepare('SELECT * FROM tokens');
  const rows = query.all() as Array<{
    bot_name: string;
    access_token: string;
    refresh_token: string;
    token_type: 'bot' | 'channel' | 'moderator';
    user_id: string;
    channel_name: string;
    created_at: string;
    updated_at: string;
    expires_at: string;
  }>;

  // Convert to JSON format
  const tokens = rows.map((row) => ({
    botName: row.bot_name,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenType: row.token_type,
    userId: row.user_id,
    channelName: row.channel_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  }));

  // Write to JSON file
  writeFileSync(jsonPath, JSON.stringify(tokens, null, 2));

  logger.info({ count: tokens.length }, 'Migration completed successfully');

  db.close();
} catch (error) {
  logger.error(
    { error },
    'Migration failed - this is OK if you have no existing SQLite database'
  );
}
