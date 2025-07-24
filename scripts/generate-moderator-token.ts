#!/usr/bin/env bun
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { parse } from 'node:url';
import { exchangeCode, RefreshingAuthProvider } from '@twurple/auth';
import open from 'open';

// Load environment variables
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

if (!(CLIENT_ID && CLIENT_SECRET)) {
  console.error('Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in .env');
  process.exit(1);
}

// Get bot name from command line
const botName = process.argv[2];
if (!botName) {
  console.error('Usage: bun run generate-moderator-token <bot-name>');
  process.exit(1);
}

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  obtainmentTimestamp: number;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string;
  channelName?: string;
}

// Create OAuth client
const twitch = new RefreshingAuthProvider({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
});

// Setup OAuth flow
const redirectUri = 'http://localhost:3000/callback';
const state = crypto.randomUUID();

// Moderator bot scopes
const scopes = [
  'chat:read',
  'chat:edit',
  // Moderation scopes
  'moderator:manage:banned_users', // Ban/timeout/unban
  'moderator:manage:chat_messages', // Delete messages
  'moderator:manage:chat_settings', // Update chat settings
  'moderator:manage:shield_mode', // Shield mode
  'moderator:manage:warnings', // Warn users
  'moderator:read:chatters', // Read chatters list
  'moderator:read:shield_mode', // Read shield mode status
  'moderator:read:followers', // Read followers
];

const url = twitch.createAuthorizationURL(state, scopes);

console.log(`\nGenerating MODERATOR tokens for bot: ${botName}`);
console.log(`Requested scopes: ${scopes.join(', ')}`);
console.log('\nOpening browser for authentication...');

// Create temporary server to handle callback
const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url!, true);

  if (parsedUrl.pathname === '/callback') {
    const code = parsedUrl.query.code as string;
    const receivedState = parsedUrl.query.state as string;

    if (receivedState !== state) {
      res.writeHead(400);
      res.end('Invalid state parameter');
      server.close();
      return;
    }

    try {
      // Exchange code for tokens
      const tokens = await exchangeCode(
        CLIENT_ID,
        CLIENT_SECRET,
        code,
        redirectUri
      );

      // Save tokens
      const tokenData: TokenData = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken!,
        expiresIn: tokens.expiresIn ?? 3600,
        obtainmentTimestamp: tokens.obtainmentTimestamp,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString(),
        savedAt: new Date().toISOString(),
        // @ts-expect-error scope is there
        scope: tokens.data.scope as string[],
      };

      // Load existing tokens file
      let tokensFile: Record<string, TokenData> = {};
      try {
        const content = await fs.readFile('./tokens.json', 'utf-8');
        tokensFile = JSON.parse(content);
      } catch {
        // File doesn't exist, that's okay
      }

      // Add or update bot tokens
      tokensFile[`bot_${botName}`] = tokenData;

      // Save updated tokens
      await fs.writeFile('./tokens.json', JSON.stringify(tokensFile, null, 2));

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body>
            <h1>Success!</h1>
            <p>Moderator bot tokens for ${botName} have been saved.</p>
            <p>Scopes granted: ${tokenData.scope.join(', ')}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);

      console.log(`\n✅ Moderator tokens saved for bot: ${botName}`);
      console.log(`Scopes granted: ${tokenData.scope.join(', ')}`);

      server.close();
      process.exit(0);
    } catch (error) {
      console.error('Error exchanging code:', error);
      res.writeHead(500);
      res.end('Error exchanging code');
      server.close();
      process.exit(1);
    }
  }
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000 for OAuth callback...');
  open(url);
});
