import { App } from './app';
import { logger } from './utils/logger';

const mainLogger = logger.child({ module: 'main' });

// Handle graceful shutdown
process.on('SIGINT', () => {
  mainLogger.info('⏹️  Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  mainLogger.info('⏹️  Shutting down gracefully...');
  process.exit(0);
});

// Start the app
async function main() {
  const app = new App();
  await app.start().catch((error) => {
    mainLogger.error({ err: error }, '❌ Failed to start app');
    process.exit(1);
  });
}

main();
