import { logger } from '@/shared/logger';
import { App } from './app';
import { env } from './env';

const mainLogger = logger.child({ module: 'main' });
let app: App | null = null;

// Start the app
async function main() {
  try {
    // Env is validated on import
    mainLogger.info(`Environment: ${env.NODE_ENV}`);
    mainLogger.info(`Database path: ${env.TOKEN_DB_PATH}`);

    app = new App();
    await app.start();

    mainLogger.info('🚀 Twitch bot started successfully');

    // Setup signal handlers after successful start
    setupSignalHandlers();
  } catch (error) {
    mainLogger.error({ err: error }, '❌ Failed to start app');
    process.exit(1);
  }
}

function setupSignalHandlers() {
  // SIGHUP for configuration reload
  process.on('SIGHUP', async () => {
    mainLogger.info('📨 SIGHUP received - reloading configuration...');
    try {
      if (!app) {
        mainLogger.error('App not initialized');
        return;
      }

      const configManager = app.getConfigManager();
      await configManager.loadConfig();
      configManager.emit('config:updated');
      mainLogger.info('✅ Configuration reloaded successfully');
    } catch (error) {
      mainLogger.error({ err: error }, '❌ Failed to reload configuration');
    }
  });

  // SIGTERM for graceful shutdown (Docker stop)
  process.on('SIGTERM', async () => {
    mainLogger.info('📨 SIGTERM received - shutting down gracefully...');
    await gracefulShutdown();
  });

  // SIGINT for Ctrl+C (development)
  process.on('SIGINT', async () => {
    mainLogger.info('📨 SIGINT received - shutting down gracefully...');
    await gracefulShutdown();
  });

  mainLogger.info(
    'Signal handlers registered (SIGHUP for reload, SIGTERM/SIGINT for shutdown)'
  );
}

async function gracefulShutdown() {
  try {
    if (app) {
      mainLogger.info('Stopping application...');
      await app.destroy();
    }
    mainLogger.info('👋 Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    mainLogger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
}

main();
