#!/usr/bin/env bun
import { AppBootstrapper } from './src/app-bootstrapper';

// Simple test to ensure moderator bot is working
async function testModeratorBot() {
  console.log('🧪 Testing moderator bot setup...\n');

  try {
    // Bootstrap the application
    const bootstrapper = new AppBootstrapper();
    const app = await bootstrapper.bootstrap();
    
    // Get services
    const services = app.getServices();
    
    // Check if moderator bot is initialized
    const modBot = services.botManager.getBot('neckbearddiscordmod');
    
    if (modBot) {
      console.log('✅ Moderator bot found!');
      console.log(`   Name: ${modBot.name}`);
      console.log(`   Personality: ${modBot.personality.name}`);
      console.log(`   Model: ${modBot.personality.model}`);
      console.log(`   Temperature: ${modBot.personality.temperature}`);
      
      // Check if bot has moderator permissions
      const tokenData = modBot.client.getCurrentTokenData();
      const hasModScopes = tokenData.scope?.some(scope => 
        scope.startsWith('moderator:')
      );
      
      console.log(`\n📋 Token Scopes:`);
      tokenData.scope?.forEach(scope => {
        console.log(`   - ${scope}`);
      });
      
      if (hasModScopes) {
        console.log('\n✅ Bot has moderator permissions!');
      } else {
        console.log('\n⚠️ Bot does not have moderator permissions');
        console.log('   Run: bun run generate-moderator-token neckbearddiscordmod');
      }
      
      // Test AI service
      console.log('\n🤖 Testing AI service with tools...');
      const aiResponse = await services.aiService.generateResponse({
        channelName: 'test',
        botName: 'neckbearddiscordmod',
        triggerMessage: 'THIS IS ALL CAPS SPAM!!!',
        triggerUser: 'testuser',
      });
      
      console.log(`\n💬 AI Response: ${aiResponse || 'No response generated'}`);
      
    } else {
      console.error('❌ Moderator bot not found!');
      console.log('   Make sure neckbearddiscordmod is in your tokens.json');
    }
    
    // Cleanup
    await app.shutdown();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testModeratorBot().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});