import { App } from './app';

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️  Shutting down gracefully...');
  process.exit(0);
});

// Start the app
async function main() {
  const app = new App();
  await app.start().catch((error) => {
    console.error('❌ Failed to start app:', error);
    process.exit(1);
  });
}

main();
