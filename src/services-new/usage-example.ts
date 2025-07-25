// Example: How to use the factory pattern services

import { TokenManager } from './token.service';
import { ChatbotService } from './chatbot.service';
import { ModeratorBotService } from './moderatorbot.service';

async function example() {
  // Initialize token manager
  const tokenManager = new TokenManager();

  // Example 1: Create a regular chatbot
  const regularBot = await ChatbotService.create(
    tokenManager,
    'friendly', // bot name
    [] // no additional intents
  );
  
  await regularBot.joinChannel();
  regularBot.say('Hello, I am a regular bot!');
  
  // Example 2: Create a moderator bot
  const moderatorBot = await ModeratorBotService.create(
    tokenManager,
    'neckbearddiscordmod' // bot name with mod permissions
  );
  
  await moderatorBot.joinChannel();
  moderatorBot.say('Hello, I am a moderator bot!');
  
  // Moderator bot can timeout users
  await moderatorBot.timeout('spammer123', 300, 'Spamming in chat');
  
  // Clean up
  await regularBot.leaveChannel();
  await moderatorBot.leaveChannel();
}

// Run example
example().catch(console.error);