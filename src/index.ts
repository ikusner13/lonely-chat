import { App } from './app';
import { env } from './env';
import { logger } from './utils/logger';

const mainLogger = logger.child({ module: 'main' });

// Handle graceful shutdown
const handleShutdown = () => {
  mainLogger.info('⏹️  Shutting down gracefully...');
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Start the app
async function main() {
  try {
    // Env is validated on import
    mainLogger.info(`Environment: ${env.NODE_ENV}`);
    mainLogger.info(
      `Database path: ${process.env.TOKEN_DB_PATH || './tokens.db'}`
    );

    const app = new App();
    await app.start();
  } catch (error) {
    mainLogger.error({ err: error }, '❌ Failed to start app');
    process.exit(1);
  }
}

main();
