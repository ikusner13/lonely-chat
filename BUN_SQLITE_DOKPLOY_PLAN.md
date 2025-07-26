# Bun SQLite + Dokploy Implementation Plan

## Overview
Migrate from file-based token storage to SQLite database using Bun's built-in SQLite module (`bun:sqlite`) with proper Dokploy volume configuration.

## Why Bun's SQLite?
- **Zero dependencies**: Built into Bun runtime
- **35% faster** than better-sqlite3
- **Native TypeScript** support
- **Same API** as better-sqlite3
- **No compilation** needed for Docker

## Implementation Steps

### Step 1: Create SQLite Token Store (No Dependencies Needed!)

```typescript
// src/services/sqlite-token-store.ts
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AccessToken } from '@twurple/auth';

export class SQLiteTokenStore {
  private db: Database;

  constructor(dbPath: string = process.env.TOKEN_DB_PATH || './data/tokens.db') {
    // Ensure directory exists
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    // Open/create database with Bun's SQLite
    this.db = new Database(dbPath, { create: true });
    
    // Enable WAL mode for better concurrency
    this.db.exec("PRAGMA journal_mode = WAL");
    
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
        updated_at INTEGER DEFAULT (unixepoch())
      );
      
      CREATE INDEX IF NOT EXISTS idx_tokens_updated ON tokens(updated_at);
    `);
  }

  getToken(name: string): AccessToken | null {
    const query = this.db.query("SELECT * FROM tokens WHERE name = ?");
    const row = query.get(name) as any;
    
    if (!row) return null;
    
    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresIn: row.expires_in || 0,
      obtainmentTimestamp: row.obtainment_timestamp || 0,
      scope: row.scopes ? row.scopes.split(',') : []
    };
  }

  saveToken(name: string, token: AccessToken): void {
    const query = this.db.prepare(`
      INSERT INTO tokens (name, access_token, refresh_token, expires_in, obtainment_timestamp, scopes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_in = excluded.expires_in,
        obtainment_timestamp = excluded.obtainment_timestamp,
        scopes = excluded.scopes,
        updated_at = unixepoch()
    `);
    
    query.run(
      name,
      token.accessToken,
      token.refreshToken,
      token.expiresIn || 0,
      token.obtainmentTimestamp || Date.now(),
      token.scope?.join(',') || ''
    );
  }

  getAllTokens(): Array<{ name: string; token: AccessToken }> {
    const query = this.db.query("SELECT * FROM tokens ORDER BY name");
    const rows = query.all() as any[];
    
    return rows.map(row => ({
      name: row.name,
      token: {
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresIn: row.expires_in || 0,
        obtainmentTimestamp: row.obtainment_timestamp || 0,
        scope: row.scopes ? row.scopes.split(',') : []
      }
    }));
  }

  deleteToken(name: string): void {
    const query = this.db.prepare("DELETE FROM tokens WHERE name = ?");
    query.run(name);
  }

  hasTokens(): boolean {
    const query = this.db.query("SELECT COUNT(*) as count FROM tokens");
    const result = query.get() as any;
    return result.count > 0;
  }

  // Bun SQLite transactions for atomic operations
  async refreshTokenAtomic(name: string, token: AccessToken): Promise<void> {
    this.db.transaction(() => {
      // Log the old token for audit
      const oldToken = this.getToken(name);
      if (oldToken) {
        console.log(`Refreshing token for ${name}`);
      }
      
      // Save new token
      this.saveToken(name, token);
    })();
  }

  close(): void {
    this.db.close();
  }
}
```

### Step 2: Update Token Manager

```typescript
// src/services/token.service.ts
import { RefreshingAuthProvider, type AccessToken } from '@twurple/auth';
import { SQLiteTokenStore } from './sqlite-token-store';
import { createLogger } from '@/utils/logger';

export class TokenManager {
  private tokenStore: SQLiteTokenStore;
  private authProviders = new Map<string, RefreshingAuthProvider>();
  private logger = createLogger('TokenManager');

  constructor(dbPath?: string) {
    this.tokenStore = new SQLiteTokenStore(dbPath);
    this.logger.info(`Token database initialized at: ${dbPath || './data/tokens.db'}`);
  }

  async getAuthProvider(name: string): Promise<RefreshingAuthProvider> {
    // Check cache first
    if (this.authProviders.has(name)) {
      return this.authProviders.get(name)!;
    }

    // Load from database - sync operation with Bun
    const tokenData = this.tokenStore.getToken(name);
    if (!tokenData) {
      throw new Error(`No token found for ${name}. Please run the auth server.`);
    }

    // Create auth provider
    const authProvider = new RefreshingAuthProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!
    });

    // Set up auto-save on refresh
    authProvider.onRefresh(async (userId, newTokenData) => {
      // Use atomic refresh for consistency
      await this.tokenStore.refreshTokenAtomic(name, newTokenData);
      this.logger.info(`Token refreshed and saved for ${name}`);
    });

    // Add user with token
    await authProvider.addUserForToken(tokenData);
    
    // Cache for reuse
    this.authProviders.set(name, authProvider);
    this.logger.info(`Auth provider created for ${name}`);
    
    return authProvider;
  }

  saveToken(name: string, token: AccessToken): void {
    this.tokenStore.saveToken(name, token);
    this.logger.info(`Token saved for ${name}`);
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
}
```

### Step 3: Docker Configuration (Simplified for Dokploy)

```yaml
# docker-compose.dokploy.yml
services:
  auth-server:
    build: 
      context: .
      dockerfile: auth/Dockerfile
    environment:
      - TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}
      - TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET}
      - TWITCH_CHANNEL_ID=${TWITCH_CHANNEL_ID}
      - TWITCH_CHANNEL_NAME=${TWITCH_CHANNEL_NAME}
      - TOKEN_DB_PATH=/data/tokens.db
      - TWITCH_REDIRECT_URI=${TWITCH_REDIRECT_URI}
      - PORT=8080
    volumes:
      - tokens-data:/data
    ports:
      - "8080:8080"
    restart: unless-stopped
    # Dokploy handles healthchecks automatically

  twitch-bot:
    build: .
    environment:
      - TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}
      - TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET}
      - TWITCH_CHANNEL_ID=${TWITCH_CHANNEL_ID}
      - TWITCH_CHANNEL_NAME=${TWITCH_CHANNEL_NAME}
      - OPENROUTER_KEY=${OPENROUTER_KEY}
      - TOKEN_DB_PATH=/data/tokens.db
      - BOT_CONFIG_PATH=/config/bots.toml
    volumes:
      - tokens-data:/data
      # Note: /config/bots.toml will be added via Dokploy file mount
    depends_on:
      - auth-server
    restart: unless-stopped
    # Dokploy handles healthchecks automatically

volumes:
  tokens-data:
    driver: local
```

### Step 4: Migration Script with Bun

```typescript
// scripts/migrate-to-sqlite.ts
import { existsSync } from 'fs';
import { SQLiteTokenStore } from '../src/services/sqlite-token-store';

console.log('Starting token migration to SQLite...');

const tokenStore = new SQLiteTokenStore();

// Check for old tokens.json
if (existsSync('./tokens.json')) {
  console.log('Found tokens.json, migrating...');
  const oldTokens = await Bun.file('./tokens.json').json();
  
  for (const [name, token] of Object.entries(oldTokens)) {
    console.log(`Migrating token for: ${name}`);
    tokenStore.saveToken(name, token as any);
  }
  
  console.log('Migration from tokens.json complete!');
}

// Show current status
const allTokens = tokenStore.getAllTokens();
console.log(`\nCurrent tokens in database:`);
for (const { name } of allTokens) {
  console.log(`  - ${name}`);
}

tokenStore.close();
console.log('\nMigration complete!');
```

### Step 5: Add Utility Scripts

```typescript
// scripts/db-utils.ts
import { Database } from "bun:sqlite";

const dbPath = process.env.TOKEN_DB_PATH || './data/tokens.db';

// Export tokens to JSON (backup)
export async function exportTokens() {
  const db = new Database(dbPath);
  const tokens = db.query("SELECT * FROM tokens").all();
  
  await Bun.write('./tokens-backup.json', JSON.stringify(tokens, null, 2));
  console.log(`Exported ${tokens.length} tokens to tokens-backup.json`);
  
  db.close();
}

// View token status
export async function viewTokens() {
  const db = new Database(dbPath);
  const tokens = db.query("SELECT name, updated_at FROM tokens ORDER BY name").all();
  
  console.table(tokens);
  
  db.close();
}

// Run if called directly
if (import.meta.main) {
  const command = Bun.argv[2];
  
  switch (command) {
    case 'export':
      await exportTokens();
      break;
    case 'view':
      await viewTokens();
      break;
    default:
      console.log('Usage: bun run scripts/db-utils.ts [export|view]');
  }
}
```

### Step 6: Update Auth Server Health Check

```typescript
// auth/src/routes/health.ts
export const healthRoute = {
  path: '/health',
  handler: async () => {
    // Simple health check that Dokploy can use
    return new Response('OK', { status: 200 });
  }
};
```

## Deployment Process

### Local Development

1. **Run migration** (if you have existing tokens):
   ```bash
   bun run scripts/migrate-to-sqlite.ts
   ```

2. **Start development**:
   ```bash
   bun run dev
   ```

3. **Check tokens**:
   ```bash
   bun run scripts/db-utils.ts view
   ```

### Dokploy Deployment

1. **In Dokploy UI**:
   
   a. **Create Application**:
      - New Application → Docker Compose
      - Connect GitHub repository
      - Select `docker-compose.dokploy.yml`
   
   b. **Set Environment Variables**:
      ```
      TWITCH_CLIENT_ID=your_client_id
      TWITCH_CLIENT_SECRET=your_client_secret
      TWITCH_CHANNEL_ID=your_channel_id
      TWITCH_CHANNEL_NAME=your_channel_name
      OPENROUTER_KEY=your_openrouter_key
      TWITCH_REDIRECT_URI=https://your-app.dokploy.com/auth/callback
      ```
   
   c. **Add File Mount** (for bot config):
      - Go to Advanced → Mounts
      - Add File Mount
      - Mount Path: `/config/bots.toml`
      - Upload your `config/bots.toml` file

2. **Configure Health Checks** (Dokploy auto-detects):
   - Dokploy will automatically detect exposed ports
   - It will use port 8080 for auth-server health checks
   - No manual configuration needed

3. **Deploy**:
   - Click Deploy
   - Named volume `tokens-data` created automatically
   - Database initializes on first run

4. **Generate Tokens**:
   - Access auth server at your domain port 8080
   - Generate tokens for channel and bots
   - Tokens saved to SQLite in the volume

## Advantages of Bun's SQLite

1. **No Dependencies**: No `better-sqlite3` to install
2. **Faster Docker Builds**: No native compilation
3. **Better Performance**: 35% faster operations
4. **TypeScript Native**: Full type support built-in
5. **Smaller Image**: No node-gyp or build tools needed

## Backup & Recovery

### Quick Backup Script
```bash
# Add to package.json scripts
"scripts": {
  "db:backup": "bun run scripts/db-utils.ts export",
  "db:view": "bun run scripts/db-utils.ts view"
}
```

### In Dokploy
- Go to Volumes tab
- Select `tokens-data` volume
- Click "Create Backup"
- Download or restore as needed

## Monitoring in Dokploy

Dokploy provides:
- Automatic health monitoring
- Container restart on failure
- Log aggregation
- Resource usage metrics

No additional health check configuration needed!

## Notes

- Bun's SQLite is production-ready and used by many companies
- WAL mode enabled for better concurrent access
- No external dependencies = simpler, faster, more reliable
- Dokploy handles all container orchestration automatically