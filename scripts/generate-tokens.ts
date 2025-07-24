import { existsSync } from 'node:fs';

import { readFile, writeFile } from 'node:fs/promises';
import { Twitch } from 'arctic';
import { Hono } from 'hono';
import { env } from '@/env';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: bun run generate-tokens.ts <bot-name>');
  console.error('Example:');
  console.error('  bun run generate-tokens.ts mybot1');
  process.exit(1);
}

const botName = args[0];

// Initialize Arctic Twitch provider
const twitch = new Twitch(
  env.TWITCH_CLIENT_ID,
  env.TWITCH_CLIENT_SECRET,
  env.TWITCH_REDIRECT_URI || 'https://0wvvnjxz-8080.use.devtunnels.ms/callback'
);

const app = new Hono();

// Token storage path
const TOKEN_FILE = './tokens.json';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  savedAt: string;
  scope: string[];
  userId?: string;
  channelName?: string;
}

interface TokenStorage {
  bots: Record<string, TokenData>;
}

// Helper function to load tokens
async function loadTokens(): Promise<TokenStorage> {
  if (existsSync(TOKEN_FILE)) {
    const data = await readFile(TOKEN_FILE, 'utf-8');
    return JSON.parse(data);
  }
  return { bots: {} };
}

// Helper function to save tokens
async function saveTokens(storage: TokenStorage) {
  await writeFile(TOKEN_FILE, JSON.stringify(storage, null, 2));
}

// Login route to initiate OAuth flow
app.get('/login', (c) => {
  const state = crypto.randomUUID();

  // Bot scopes for chat functionality
  const scopes = ['chat:read', 'chat:edit', 'moderator:manage:banned_users'];

  const url = twitch.createAuthorizationURL(state, scopes);

  console.log(`\nGenerating tokens for bot: ${botName}`);
  console.log(`Requested scopes: ${scopes.join(', ')}`);
  console.log('\nOpening browser for authentication...');

  return c.redirect(url.toString());
});

// Callback endpoint for Twitch OAuth
app.get('/callback', async (c) => {
  const code = c.req.query('code');

  if (!code) {
    return c.text('Error: No authorization code received', 400);
  }

  try {
    // Exchange code for tokens
    const tokens = await twitch.validateAuthorizationCode(code);

    // Load existing tokens
    const storage = await loadTokens();

    // Prepare token data
    const tokenData: TokenData = {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt().toISOString(),
      savedAt: new Date().toISOString(),
      // @ts-expect-error scope is there
      scope: tokens.data.scope as string[],
    };

    // Save bot tokens
    storage.bots[botName] = tokenData;

    await saveTokens(storage);

    const successMessage = `Bot '${botName}' tokens saved successfully!`;

    console.log(`\n✅ ${successMessage}`);
    console.log('Tokens saved to tokens.json');

    // Return success page
    return c.html(`
      <html>
        <body style="font-family: sans-serif; padding: 40px;">
          <h1>✅ Authentication Successful!</h1>
          <p>${successMessage}</p>
          <p>You can close this window and return to the terminal.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth error:', error);
    return c.text('Error during authentication', 500);
  }
});

// Root endpoint
app.get('/', (c) => {
  const title = `Twitch Bot OAuth - ${botName}`;

  return c.html(`
    <html>
      <body style="font-family: sans-serif; padding: 40px;">
        <h1>${title}</h1>
        <p>Click the button below to authenticate with Twitch.</p>
        <a href="/login" style="
          display: inline-block;
          padding: 10px 20px;
          background: #9146ff;
          color: white;
          text-decoration: none;
          border-radius: 4px;
        ">Login with Twitch</a>
      </body>
    </html>
  `);
});

// Start server
console.log('Starting OAuth server on http://localhost:8080');
console.log('Navigate to http://localhost:8080 to begin authentication');

export default {
  port: 8080,
  fetch: app.fetch,
};
