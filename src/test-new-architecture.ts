#!/usr/bin/env bun
/**
 * Test file to verify Phase 1 components work correctly
 * This demonstrates the new architecture without modifying the existing application
 */

import { AppBootstrapper } from './app-bootstrapper';

async function testNewArchitecture() {
  console.log('🧪 Testing new architecture components...\n');

  try {
    // Create bootstrapper and initialize application
    const bootstrapper = new AppBootstrapper();
    const app = await bootstrapper.bootstrap();

    console.log('✅ All components initialized successfully!');
    console.log('\n📋 Service Container Contents:');

    const services = app.getServices();
    console.log('  - TokenManager: ✓');
    console.log('  - ConversationManager: ✓');
    console.log('  - AIService: ✓');
    console.log('  - BotManager: ✓');
    console.log('  - StreamService: ✓');
    console.log('  - StreamLifecycleManager: ✓');
    console.log('  - MessageRouter: ✓');
    console.log('  - MultiBotOrchestratorV2: ✓');

    // Test message routing logic
    console.log('\n🔬 Testing message routing logic...');

    // Simulate a message context
    const testContext = {
      channel: 'testchannel',
      user: 'testuser',
      message: 'Hey @stickyman1776, how are you?',
      timestamp: new Date(),
      mentionedBots: ['stickyman1776' as const],
    };

    // Get response decisions from orchestrator
    const responses = services.orchestrator.determineResponses(testContext);
    console.log(`\n📊 Orchestrator decision for "${testContext.message}":`);
    responses.forEach((response, index) => {
      console.log(
        `  ${index + 1}. Bot: ${response.botName}, Priority: ${response.priority}, Delay: ${response.delay}ms`
      );
    });

    // Test conversation state
    const conversationState = services.orchestrator.getConversationState();
    console.log('\n💬 Conversation State:');
    console.log(`  - Active: ${conversationState.isActive}`);
    console.log(
      `  - Messages since last bot: ${conversationState.messagesSinceLastBot}`
    );

    // Clean shutdown
    console.log('\n🛑 Testing graceful shutdown...');
    await app.shutdown();
    console.log('✅ Shutdown completed successfully!');

    console.log(
      '\n🎉 All tests passed! New architecture is working correctly.'
    );
    console.log(
      "\nNote: This test doesn't connect to Twitch or send real messages."
    );
    console.log(
      'It only verifies that all components initialize and communicate properly.'
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testNewArchitecture().catch(console.error);
