import { Hono } from 'hono';
import { TokenManager } from '@/services/token.service';
import { createLogger } from '@/utils/logger';
import { Layout } from '../components/layout';
import { env } from '../env';
import {
  exchangeCodeForTokens,
  generateAuthUrl,
  getUserInfo,
} from '../lib/oauth';

const botRoutes = new Hono();
const logger = createLogger('BotAuth');
const tokenManager = new TokenManager({
  clientId: env.TWITCH_CLIENT_ID,
  clientSecret: env.TWITCH_CLIENT_SECRET,
  dbPath: env.TOKEN_DB_PATH,
});

// Start bot auth flow
botRoutes.get('/new', (c) => {
  const botName = c.req.query('name');

  if (!botName) {
    return c.html(
      <Layout title="Bot Name Required">
        <div class="error">
          <h2>Bot Name Required</h2>
          <p>Please provide a name for your bot.</p>
          <a class="button" href="/">
            Back to Dashboard
          </a>
        </div>
      </Layout>
    );
  }

  const authUrl = generateAuthUrl('bot', botName);

  return c.html(
    <Layout title={`Generate Bot Token: ${botName}`}>
      <div class="card">
        <h2>Generate Bot Token: {botName}</h2>
        <p style="margin-bottom: 1rem;">
          This will generate a token for <strong>{botName}</strong> to read and
          send messages in chat.
        </p>
        <p style="margin-bottom: 1rem;">
          Required scopes: <code>chat:read</code>, <code>chat:edit</code>
        </p>
        <p style="margin-bottom: 1rem; color: #dc2626;">
          <strong>Important:</strong> Log in with the bot's Twitch account, not
          your channel account.
        </p>
        <a class="button" href={authUrl}>
          Authenticate Bot with Twitch
        </a>
      </div>
    </Layout>
  );
});

// Handle OAuth callback
botRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const botName = c.req.query('botName') || state?.split(':')[1];

  if (!(code && botName)) {
    return c.html(
      <Layout title="Authentication Failed">
        <div class="error">
          <h2>Authentication Failed</h2>
          <p>Missing authorization code or bot name.</p>
          <a class="button" href="/">
            Back to Dashboard
          </a>
        </div>
      </Layout>
    );
  }

  try {
    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code);

    // Get user info
    const userInfo = await getUserInfo(tokenData.accessToken);

    // Load existing tokens
    const storage = tokenManager.loadTokens();

    // Save bot token
    storage.bots[botName] = {
      ...tokenData,
      savedAt: new Date().toISOString(),
      userId: userInfo.userId,
      channelName: userInfo.username,
    };

    tokenManager.saveTokens(storage);

    logger.info(
      {
        botName,
        userId: userInfo.userId,
        username: userInfo.username,
        scopes: tokenData.scope,
      },
      'Bot token saved successfully'
    );

    return c.html(
      <Layout title="Bot Authentication Successful">
        <div class="success">
          <h2>✅ Bot Authentication Successful!</h2>
          <p>
            Token for bot <strong>{botName}</strong> has been saved.
          </p>
          <p>
            Twitch account: <strong>{userInfo.username}</strong>
          </p>
          <p>
            Granted scopes: <code>{tokenData.scope.join(', ')}</code>
          </p>
          <div class="actions">
            <a class="button" href="/">
              Back to Dashboard
            </a>
          </div>
        </div>
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to save bot token');

    return c.html(
      <Layout title="Authentication Failed">
        <div class="error">
          <h2>Authentication Failed</h2>
          <p>Failed to exchange authorization code for tokens.</p>
          <p>
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <div class="actions">
            <a class="button" href={`/auth/bot/new?name=${botName}`}>
              Try Again
            </a>
            <a class="button secondary" href="/">
              Back to Dashboard
            </a>
          </div>
        </div>
      </Layout>
    );
  }
});

// Refresh existing bot token
botRoutes.get('/:name', (c) => {
  const botName = c.req.param('name');
  const authUrl = generateAuthUrl('bot', botName);

  try {
    const tokens = tokenManager.loadTokens();
    const existingToken = tokens.bots[botName];

    if (!existingToken) {
      return c.html(
        <Layout title="Bot Not Found">
          <div class="error">
            <h2>Bot Not Found</h2>
            <p>No token found for bot: {botName}</p>
            <a class="button" href="/">
              Back to Dashboard
            </a>
          </div>
        </Layout>
      );
    }

    return c.html(
      <Layout title={`Refresh Bot Token: ${botName}`}>
        <div class="card">
          <h2>Refresh Bot Token: {botName}</h2>
          <p style="margin-bottom: 1rem;">
            Current token for <strong>{botName}</strong> expires at:{' '}
            {new Date(existingToken.accessTokenExpiresAt).toLocaleString()}
          </p>
          <p style="margin-bottom: 1rem;">
            Click below to generate a new token.
          </p>
          <a class="button" href={authUrl}>
            Refresh Bot Token
          </a>
        </div>
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to load bot token');
    return c.html(
      <Layout title="Error Loading Token">
        <div class="error">
          <h2>Error Loading Token</h2>
          <p>Failed to load token information.</p>
          <a class="button" href="/">
            Back to Dashboard
          </a>
        </div>
      </Layout>
    );
  }
});

export { botRoutes };
