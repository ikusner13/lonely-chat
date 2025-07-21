import { AppBootstrapper } from './app-bootstrapper';
import type { Application } from './app-bootstrapper';

// Global reference to the application for shutdown handlers
let app: Application | null = null;

// Bootstrap and start the application
async function main() {
  try {
    console.log('🎮 Twitch Bot Service Starting...');
    
    // Create bootstrapper and initialize application
    const bootstrapper = new AppBootstrapper();
    app = await bootstrapper.bootstrap();
    
    // Start the application
    await app.start();
    
    console.log('🎮 Twitch Bot Service Running');
    console.log('Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('❌ Failed to start Twitch Bot Service:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function handleShutdown(signal: string) {
  console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
  
  if (app) {
    try {
      await app.shutdown();
      console.log('✅ Shutdown completed');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
  
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  handleShutdown('unhandledRejection');
});

// Start the application
main();
