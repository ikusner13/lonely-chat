import { AIService, BOT_PERSONALITIES } from './src/services/ai.service';

// Test the AI service
async function testAI() {
  const apiKey = process.env.OPENROUTER_KEY;
  if (!apiKey) {
    console.error('❌ OPENROUTER_KEY not found in environment');
    process.exit(1);
  }

  console.log('🤖 Testing AI Service...\n');

  const aiService = new AIService(apiKey);
  const channelName = 'test-channel';
  const botName = 'TestBot';
  const personality = BOT_PERSONALITIES.friendly;

  try {
    // Test 1: Simple response
    console.log('Test 1: Simple greeting response');
    const response1 = await aiService.generateResponse(
      channelName,
      botName,
      'Hello bot!',
      'TestUser',
      personality
    );
    console.log(`Bot response: ${response1}\n`);

    // Test 2: Question response
    console.log('Test 2: Question response');
    const response2 = await aiService.generateResponse(
      channelName,
      botName,
      'What games do you like to play?',
      'TestUser',
      personality
    );
    console.log(`Bot response: ${response2}\n`);

    // Test 3: Context awareness
    console.log('Test 3: Context awareness');
    const response3 = await aiService.generateResponse(
      channelName,
      botName,
      'What did I just ask you?',
      'TestUser',
      personality
    );
    console.log(`Bot response: ${response3}\n`);

    // Test 4: Message triggers
    console.log('Test 4: Message trigger analysis');
    const analysis = aiService.analyzeMessageTriggers(
      'Hey @TestBot, how are you doing today?',
      'TestUser',
      [botName]
    );
    console.log('Trigger analysis:', JSON.stringify(analysis, null, 2));

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAI().catch(console.error);