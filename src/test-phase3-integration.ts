#!/usr/bin/env bun
import { AppBootstrapper } from './app-bootstrapper';
import type { Application } from './app-bootstrapper';

// Test Phase 3 Integration - Full System Test
async function testPhase3Integration() {
  console.log('=== Phase 3 Integration Test ===\n');
  
  let app: Application | null = null;
  let allTestsPassed = true;

  try {
    // Test 1: Bootstrap the application
    console.log('1. Testing AppBootstrapper initialization...');
    const bootstrapper = new AppBootstrapper();
    app = await bootstrapper.bootstrap();
    console.log('✅ AppBootstrapper successfully initialized\n');

    // Test 2: Verify all services are initialized
    console.log('2. Verifying service initialization...');
    const appServices = app.getServices();
    const expectedServices = [
      'tokenManager',
      'aiService', 
      'conversationManager',
      'streamService',
      'botManager',
      'orchestrator',
      'messageRouter',
      'streamLifecycleManager'
    ];
    
    for (const service of expectedServices) {
      if (!(service in appServices)) {
        throw new Error(`Missing service: ${service}`);
      }
    }
    console.log('✅ All services initialized correctly\n');

    // Test 3: Start the application
    console.log('3. Testing application startup...');
    await app.start();
    console.log('✅ Application started successfully\n');

    // Test 4: Verify stream lifecycle manager is listening for events
    console.log('4. Verifying stream lifecycle manager...');
    const streamLifecycleEvents = ['stream:online', 'stream:offline', 'bots:connected', 'bots:disconnected'];
    let hasListeners = true;
    
    for (const event of streamLifecycleEvents) {
      if (appServices.streamLifecycleManager.listenerCount(event) === 0) {
        hasListeners = false;
        console.error(`❌ No listeners for event: ${event}`);
      }
    }
    
    if (hasListeners) {
      console.log('✅ Stream lifecycle manager properly configured\n');
    } else {
      allTestsPassed = false;
    }

    // Test 5: Verify bot connections
    console.log('5. Testing bot manager state...');
    const botNames = appServices.botManager.getBotNames();
    const botCount = botNames.length;
    console.log(`   - Number of bots configured: ${botCount}`);
    console.log(`   - Bot names: ${botNames.join(', ')}`); 
    
    if (botCount > 0) {
      console.log('✅ Bot manager has bots configured\n');
    } else {
      console.log('⚠️  No bots configured (this is OK for testing)\n');
    }

    // Test 6: Test message routing simulation
    console.log('6. Testing message routing logic...');
    const testContext = {
      channel: 'test-channel',
      user: 'test-user',
      message: 'Hey @friendly, how are you?',
      timestamp: new Date(),
      isQuestion: true,
      mentionedBots: ['friendly' as const]
    };

    // Test orchestrator decision making
    const responses = appServices.orchestrator.determineResponses(testContext);
    console.log(`   - Orchestrator returned ${responses.length} response(s)`);
    
    if (responses.length > 0) {
      console.log(`   - First response: Bot="${responses[0].botName}", Delay=${responses[0].delay}ms, Priority=${responses[0].priority}`);
      console.log('✅ Message routing logic working correctly\n');
    } else {
      console.log('⚠️  No responses generated (check bot configuration)\n');
    }

    // Test 7: Verify graceful shutdown
    console.log('7. Testing graceful shutdown...');
    await app.shutdown();
    console.log('✅ Application shut down gracefully\n');
    
    app = null;

  } catch (error) {
    console.error('❌ Test failed:', error);
    allTestsPassed = false;
  } finally {
    // Ensure cleanup
    if (app) {
      try {
        await app.shutdown();
      } catch (e) {
        console.error('Error during cleanup:', e);
      }
    }
  }

  // Summary
  console.log('\n=== Test Summary ===');
  if (allTestsPassed) {
    console.log('✅ All Phase 3 integration tests passed!');
    console.log('\nThe new architecture is successfully integrated and ready for use.');
    console.log('You can now run "bun run dev" to start the application.\n');
  } else {
    console.log('❌ Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the test
console.log('Starting Phase 3 Integration Test...\n');
testPhase3Integration().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});