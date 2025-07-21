#!/usr/bin/env bun

/**
 * Simple run script for the new architecture
 * This provides a clean way to start the application with proper error handling
 */

import type { Application } from './app-bootstrapper';
import { AppBootstrapper } from './app-bootstrapper';

async function run() {
  let app: Application | null = null;

  try {
    console.log('🚀 Starting Twitch Bot Service with new architecture...\n');

    // Bootstrap the application
    const bootstrapper = new AppBootstrapper();
    app = await bootstrapper.bootstrap();

    // Start the application
    await app.start();

    console.log('\n✨ Application is running!');
    console.log('📡 Listening for Twitch events...');
    console.log('💬 Bots are ready to chat!');
    console.log('\nPress Ctrl+C to stop\n');

    // Keep the process alive
    await new Promise(() => {
      // Intentionally empty - keeps process running
    });
  } catch (error) {
    console.error('❌ Failed to start application:', error);

    // Attempt cleanup if app was partially initialized
    if (app) {
      try {
        await app.shutdown();
      } catch (shutdownError) {
        console.error('❌ Error during emergency shutdown:', shutdownError);
      }
    }

    process.exit(1);
  }
}

// Run the application
run();
