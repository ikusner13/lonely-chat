import { Hono } from 'hono';
import { createLogger } from '@/shared/logger';
import { TokenManager } from '@/shared/token.service';
import { Dashboard } from './components/dashboard';
import { Layout } from './components/layout';
import { env } from './env';
import { botRoutes } from './routes/bot';
import { channelRoutes } from './routes/channel';
import { moderatorRoutes } from './routes/moderator';

const app = new Hono();
const logger = createLogger('AuthServer');
const tokenManager = new TokenManager({
  clientId: env.TWITCH_CLIENT_ID,
  clientSecret: env.TWITCH_CLIENT_SECRET,
  dbPath: env.TOKEN_DB_PATH,
});

// Health check endpoint
app.get('/health', (c) => c.text('OK', 200));

// Root dashboard route
app.get('/', (c) => {
  try {
    const tokens = tokenManager.loadTokens();
    return c.html(
      <Layout title="Twitch Bot Authentication">
        <Dashboard tokens={tokens} tunnelUrl={null} />
      </Layout>
    );
  } catch (error) {
    logger.error({ err: error }, 'Failed to load tokens');
    return c.html(
      <Layout title="Twitch Bot Authentication">
        <div class="rounded-lg bg-white p-6 shadow-sm">
          <h2 class="mb-2 font-semibold text-2xl">Welcome to Twitch Auth</h2>
          <p class="mb-4">
            No tokens found. Generate your first token to get started!
          </p>
          <a
            class="inline-block rounded-md bg-purple-600 px-6 py-3 font-medium text-white no-underline transition-colors hover:bg-purple-700"
            href="/auth/channel"
          >
            Generate Channel Token
          </a>
        </div>
      </Layout>
    );
  }
});

// Mount auth routes
app.route('/auth/channel', channelRoutes);
app.route('/auth/bot', botRoutes);
app.route('/auth/moderator', moderatorRoutes);

// Simple callback redirect based on state
app.get('/callback', (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!(code && state)) {
    return c.redirect('/');
  }

  const [authType, botName] = state.split(':');

  // Redirect to the appropriate auth route callback
  const params = new URLSearchParams({ code, state });
  if (botName) {
    params.append('botName', botName);
  }

  return c.redirect(`/auth/${authType}/callback?${params}`);
});

// Delete token endpoint
app.delete('/tokens/:type/:name?', (c) => {
  const type = c.req.param('type');
  const name = c.req.param('name');

  try {
    const tokens = tokenManager.loadTokens();

    if (type === 'channel') {
      // biome-ignore lint/performance/noDelete: fine
      delete tokens.channel;
    } else if (type === 'bot' && name) {
      delete tokens.bots[name];
    }

    tokenManager.saveTokens(tokens);
    return c.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete token');
    return c.json({ success: false, error: 'Failed to delete token' }, 500);
  }
});

const port = Number(env.PORT) || 8080;

logger.info(`Starting auth server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
