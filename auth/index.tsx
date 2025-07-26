import { Hono } from 'hono';
import localtunnel from 'localtunnel';
import { TokenManager } from '@/services/token.service';
import { createLogger } from '@/utils/logger';
// Import components
import { Dashboard } from './components/dashboard';
import { Layout } from './components/layout';
import { env } from './env';
import { botRoutes } from './routes/bot';
// Import routes
import { channelRoutes } from './routes/channel';
import { moderatorRoutes } from './routes/moderator';

const app = new Hono();
const logger = createLogger('AuthServer');
const tokenManager = new TokenManager();

// Global state for tunnel URL
let tunnelUrl: string | null = null;
let tunnel: localtunnel.Tunnel | null = null;

// Remove jsxRenderer since we're using c.html() directly

// Health check endpoint
app.get('/health', (c) => c.text('OK', 200));

// Root dashboard route
app.get('/', async (c) => {
  try {
    const tokens = await tokenManager.loadTokens();
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

// Mount auth routes
app.route('/auth/channel', channelRoutes);
app.route('/auth/bot', botRoutes);
app.route('/auth/moderator', moderatorRoutes);

// Unified callback handler
app.get('/callback', (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!(code && state)) {
    return c.html(
      <Layout title="Authentication Error">
        <div class="rounded-md border border-red-400 bg-red-100 p-4 text-red-700">
          <h2 class="mb-2 font-semibold text-xl">Authentication Error</h2>
          <p class="mb-4">Missing authorization code or state parameter.</p>
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

  // State contains the auth type and optional bot name
  // Format: "channel" or "bot:botname" or "moderator:botname"
  const [authType, botName] = state.split(':');

  // Create a new context with the code and state
  const newRequest = new Request(
    `${c.req.url.split('?')[0]}?code=${code}&state=${state}${botName ? `&botName=${botName}` : ''}`,
    {
      method: 'GET',
      headers: c.req.raw.headers,
    }
  );

  // Delegate to appropriate handler based on auth type
  switch (authType) {
    case 'channel':
      return channelRoutes.fetch(newRequest, env, c.executionCtx);
    case 'bot':
      return botRoutes.fetch(newRequest, env, c.executionCtx);
    case 'moderator':
      return moderatorRoutes.fetch(newRequest, env, c.executionCtx);
    default:
      return c.html(
        <Layout title="Invalid Authentication">
          <div class="rounded-md border border-red-400 bg-red-100 p-4 text-red-700">
            <h2 class="mb-2 font-semibold text-xl">
              Invalid Authentication Type
            </h2>
            <p class="mb-4">Unknown authentication type: {authType}</p>
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
});

// Delete token endpoint
app.delete('/tokens/:type/:name?', async (c) => {
  const type = c.req.param('type');
  const name = c.req.param('name');

  try {
    const tokens = await tokenManager.loadTokens();

    if (type === 'channel') {
      // biome-ignore lint/performance/noDelete: fine
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

// Tunnel status endpoint
app.get('/tunnel/status', (c) => {
  return c.json({
    url: tunnelUrl,
    status: tunnel ? 'connected' : 'disconnected',
  });
});

// Get subdomain from env (required)
function getSubdomain(): string {
  return env.LOCALTUNNEL_SUBDOMAIN ?? 'localhost';
}

// Start server with localtunnel
async function startServer() {
  const port = 8080;
  const subdomain = getSubdomain();

  logger.info(`Starting auth server on port ${port}`);

  // Start local server
  Bun.serve({
    port,
    fetch: app.fetch,
  });

  logger.info(`Local server running at http://localhost:${port}`);

  // Start localtunnel
  try {
    logger.info(`Creating tunnel with subdomain: ${subdomain}`);
    tunnel = await localtunnel({
      port,
      subdomain,
      host: 'https://loca.lt',
    });

    tunnelUrl = tunnel.url;
    logger.info(`🌐 Tunnel established at: ${tunnelUrl}`);

    // Update environment if needed
    if (
      !env.TWITCH_REDIRECT_URI ||
      env.TWITCH_REDIRECT_URI.includes('localhost')
    ) {
      logger.warn('TWITCH_REDIRECT_URI is not set to tunnel URL');
      logger.info('Add this to your .env file:');
      logger.info(`TWITCH_REDIRECT_URI=${tunnelUrl}/callback`);
    }

    tunnel.on('close', () => {
      logger.warn('Tunnel closed');
      tunnelUrl = null;
    });

    tunnel.on('error', (err: Error) => {
      logger.error({ err }, 'Tunnel error');
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create tunnel');
    logger.warn('Running without tunnel - OAuth callbacks will not work');
  }

  // Open browser to dashboard
  const open = await import('open');
  await open.default(`http://localhost:${port}`);

  logger.info('✨ Auth server is ready!');
  logger.info(`Dashboard: http://localhost:${port}`);
  if (tunnelUrl) {
    logger.info(`Public URL: ${tunnelUrl}`);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  if (tunnel) {
    tunnel.close();
  }
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  logger.error({ err: error }, 'Failed to start server');
  process.exit(1);
});

export default app;
