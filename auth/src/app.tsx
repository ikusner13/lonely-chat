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

// Dashboard
app.get('/', async (c) => {
  try {
    const tokens = await tokenManager.loadTokens();
    // In production mode, we don't use tunnelUrl
    const tunnelUrl = process.env.NODE_ENV === 'production' ? null : globalThis.tunnelUrl || null;
    return c.html(
      <Layout title="Twitch Bot Authentication">
        <Dashboard tokens={tokens} tunnelUrl={tunnelUrl} />
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

// Mount routes
app.route('/auth/bot', botRoutes);
app.route('/auth/channel', channelRoutes);
app.route('/auth/moderator', moderatorRoutes);

// API endpoints
app.get('/api/tokens', async (c) => {
  try {
    const tokens = await tokenManager.loadTokens();
    return c.json(tokens);
  } catch (error) {
    logger.error({ err: error }, 'Failed to load tokens');
    return c.json({ error: 'Failed to load tokens' }, 500);
  }
});

app.post('/api/tokens/refresh/:type/:name', async (c) => {
  const { type, name } = c.req.param();
  try {
    await tokenManager.refreshToken(type as 'channel' | 'bot', name);
    return c.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to refresh token');
    return c.json({ success: false, error: 'Failed to refresh token' }, 500);
  }
});

app.delete('/api/tokens/:type/:name?', async (c) => {
  const { type, name } = c.req.param();
  try {
    const tokens = await tokenManager.loadTokens();
    
    if (type === 'channel') {
      delete tokens.channel;
    } else if (type === 'bot' && name) {
      delete tokens.bots[name];
    }
    
    await tokenManager.saveTokens(tokens);
    return c.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete token');
    return c.json({ success: false, error: 'Failed to delete token' }, 500);
  }
});

// Tunnel status endpoint (for development)
app.get('/tunnel/status', (c) => {
  const tunnelUrl = globalThis.tunnelUrl || null;
  const tunnel = globalThis.tunnel || null;
  return c.json({
    url: tunnelUrl,
    status: tunnel ? 'connected' : 'disconnected',
  });
});

export default app;