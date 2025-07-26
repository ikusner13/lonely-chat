import { Hono } from 'hono';
import { TokenManager } from '@/services/token.service';
import { createLogger } from '@/utils/logger';
import { Layout } from '../components/layout';
import {
  exchangeCodeForTokens,
  generateAuthUrl,
  getUserInfo,
} from '../lib/oauth';
import { env } from '../env';

const moderatorRoutes = new Hono();
const logger = createLogger('ModeratorAuth');
const tokenManager = new TokenManager({
  clientId: env.TWITCH_CLIENT_ID,
  clientSecret: env.TWITCH_CLIENT_SECRET,
  dbPath: env.TOKEN_DB_PATH,
});

// Start moderator auth flow
moderatorRoutes.get('/new', (c) => {
  const botName = c.req.query('name');

  if (!botName) {
    return c.html(
      <Layout title="Bot Name Required">
        <div class="error">
          <h2>Bot Name Required</h2>
          <p>Please provide a name for your moderator bot.</p>
          <a class="button" href="/">
            Back to Dashboard
          </a>
        </div>
      </Layout>
    );
  }

  const authUrl = generateAuthUrl('moderator', botName);

  return c.html(
    <Layout title={`Generate Moderator Bot Token: ${botName}`}>
      <div class="card">
        <h2>Generate Moderator Bot Token: {botName}</h2>
        <p style="margin-bottom: 1rem;">
          This will generate a token for <strong>{botName}</strong> with
          moderator privileges.
        </p>
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 1rem; border-radius: 0.375rem; margin-bottom: 1rem;">
          <strong>⚠️ Warning:</strong> This bot will have the ability to:
          <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
            <li>Timeout and ban users</li>
            <li>Delete messages</li>
            <li>Manage chat settings</li>
            <li>Enable/disable shield mode</li>
            <li>Issue warnings</li>
          </ul>
        </div>
        <p style="margin-bottom: 1rem;">
          Required scopes: <code>chat:read</code>, <code>chat:edit</code>, plus
          all moderator scopes
        </p>
        <p style="margin-bottom: 1rem; color: #dc2626;">
          <strong>Important:</strong>
          <br />
          1. Log in with the bot's Twitch account
          <br />
          2. The bot must be a moderator in your channel
        </p>
        <a class="button" href={authUrl}>
          Authenticate Moderator Bot
        </a>
      </div>
    </Layout>
  );
});

// Refresh existing moderator token
moderatorRoutes.get('/:name', async (c) => {
  const botName = c.req.param('name');
  const authUrl = generateAuthUrl('moderator', botName);

  try {
    const tokens = await tokenManager.loadTokens();
    const existingToken = tokens.bots[botName];

    if (!existingToken) {
      return c.html(
        <Layout title="Bot Not Found">
          <div class="error">
            <h2>Bot Not Found</h2>
            <p>No token found for moderator bot: {botName}</p>
            <a class="button" href="/">
              Back to Dashboard
            </a>
          </div>
        </Layout>
      );
    }

    return c.html(
      <Layout title={`Refresh Moderator Token: ${botName}`}>
        <div class="card">
          <h2>Refresh Moderator Token: {botName}</h2>
          <p style="margin-bottom: 1rem;">
            Current token for <strong>{botName}</strong> expires at:{' '}
            {new Date(existingToken.accessTokenExpiresAt).toLocaleString()}
          </p>
          <p style="margin-bottom: 1rem;">
            This bot has moderator privileges. Click below to refresh the token.
          </p>
          <a class="button" href={authUrl}>
            Refresh Moderator Token
          </a>
        </div>
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to load moderator token');
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

// Handle OAuth callback
moderatorRoutes.get('/callback', async (c) => {
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

    // Verify moderator scopes were granted
    const hasModScopes = tokenData.scope.some((s) => s.includes('moderator'));
    if (!hasModScopes) {
      throw new Error(
        'Moderator scopes were not granted. Make sure the bot is a moderator in your channel.'
      );
    }

    // Get user info
    const userInfo = await getUserInfo(tokenData.accessToken);

    // Load existing tokens
    const storage = await tokenManager.loadTokens();

    // Save moderator bot token
    storage.bots[botName] = {
      ...tokenData,
      savedAt: new Date().toISOString(),
      userId: userInfo.userId,
      channelName: userInfo.username,
    };

    await tokenManager.saveTokens(storage);

    logger.info(
      {
        botName,
        userId: userInfo.userId,
        username: userInfo.username,
        scopes: tokenData.scope,
      },
      'Moderator bot token saved successfully'
    );

    return c.html(
      <Layout title="Moderator Bot Authentication Successful">
        <div class="success">
          <h2>✅ Moderator Bot Authentication Successful!</h2>
          <p>
            Token for moderator bot <strong>{botName}</strong> has been saved.
          </p>
          <p>
            Twitch account: <strong>{userInfo.username}</strong>
          </p>
          <div style="background-color: #d1fae5; border: 1px solid #34d399; padding: 1rem; border-radius: 0.375rem; margin: 1rem 0;">
            <strong>Granted moderator scopes:</strong>
            <ul style="margin-top: 0.5rem; margin-left: 1.5rem; font-family: monospace; font-size: 0.875rem;">
              {tokenData.scope
                .filter((s) => s.includes('moderator'))
                .map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
            </ul>
          </div>
          <div class="actions">
            <a class="button" href="/">
              Back to Dashboard
            </a>
          </div>
        </div>
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to save moderator token');

    return c.html(
      <Layout title="Authentication Failed">
        <div class="error">
          <h2>Authentication Failed</h2>
          <p>Failed to exchange authorization code for tokens.</p>
          <p>
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          {error instanceof Error && error.message.includes('moderator') && (
            <div style="background-color: #fee2e2; border: 1px solid #f87171; padding: 1rem; border-radius: 0.375rem; margin: 1rem 0;">
              <strong>Make sure:</strong>
              <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">
                <li>The bot account is a moderator in your channel</li>
                <li>
                  You're logging in with the bot account, not your channel
                  account
                </li>
                <li>You approved all requested permissions</li>
              </ul>
            </div>
          )}
          <div class="actions">
            <a class="button" href={`/auth/moderator/new?name=${botName}`}>
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

export { moderatorRoutes };
