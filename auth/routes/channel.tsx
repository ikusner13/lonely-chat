import { Hono } from 'hono';
import { TokenManager } from '@/services/token.service';
import { createLogger } from '@/utils/logger';
import { Layout } from '../components/Layout';
import {
  exchangeCodeForTokens,
  generateAuthUrl,
  getUserInfo,
} from '../lib/oauth';

const channelRoutes = new Hono();
const logger = createLogger('ChannelAuth');
const tokenManager = new TokenManager();

// Start channel auth flow
channelRoutes.get('/', (c) => {
  const authUrl = generateAuthUrl('channel');

  return c.html(
    <Layout title="Generate Channel Token">
      <div class="rounded-lg bg-white p-6 shadow-sm">
        <h2 class="mb-4 font-semibold text-2xl">Generate Channel Token</h2>
        <p class="mb-4">
          This will generate a token for your Twitch channel to monitor stream
          events. No special permissions are required for public stream events.
        </p>
        <p class="mb-4">
          <strong>Note:</strong> Make sure to log in with your channel account,
          not a bot account.
        </p>
        <a
          class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
          href={authUrl}
        >
          Authenticate with Twitch
        </a>
      </div>
    </Layout>
  );
});

// Handle OAuth callback
channelRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');

  if (!code) {
    return c.html(
      <Layout title="Authentication Failed">
        <div class="rounded-md border border-red-400 bg-red-100 p-4 text-red-700">
          <h2 class="mb-2 font-semibold text-xl">Authentication Failed</h2>
          <p class="mb-4">No authorization code received.</p>
          <a
            class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
            href="/"
          >
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
    const storage = await tokenManager.loadTokens();

    // Save channel token
    storage.channel = {
      ...tokenData,
      savedAt: new Date().toISOString(),
      userId: userInfo.userId,
      channelName: userInfo.username,
    };

    await tokenManager.saveTokens(storage);

    logger.info(
      {
        userId: userInfo.userId,
        username: userInfo.username,
        scopes: tokenData.scope,
      },
      'Channel token saved successfully'
    );

    return c.html(
      <Layout title="Authentication Successful">
        <div class="rounded-md border border-green-400 bg-green-100 p-4 text-green-700">
          <h2 class="mb-2 font-semibold text-xl">
            ✅ Authentication Successful!
          </h2>
          <p class="mb-2">
            Channel token for <strong>{userInfo.username}</strong> has been
            saved.
          </p>
          <p class="mb-4">
            Channel ID:{' '}
            <code class="rounded bg-green-200 px-2 py-1 text-sm">
              {userInfo.userId}
            </code>
          </p>
          <div class="flex gap-3">
            <a
              class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
              href="/"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to save channel token');

    return c.html(
      <Layout title="Authentication Failed">
        <div class="rounded-md border border-red-400 bg-red-100 p-4 text-red-700">
          <h2 class="mb-2 font-semibold text-xl">Authentication Failed</h2>
          <p class="mb-2">Failed to exchange authorization code for tokens.</p>
          <p class="mb-4">
            Error: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <div class="flex gap-3">
            <a
              class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
              href="/auth/channel"
            >
              Try Again
            </a>
            <a
              class="inline-block rounded-md bg-gray-500 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-gray-600"
              href="/"
            >
              Back to Dashboard
            </a>
          </div>
        </div>
      </Layout>
    );
  }
});

export { channelRoutes };
