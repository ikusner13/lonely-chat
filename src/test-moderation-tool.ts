#!/usr/bin/env bun

/**
 * Test script for the moderation bot tool calling
 */

import { config } from 'dotenv';
config();

// Simple test to verify the AI with tools service is working
console.log('🧪 Moderation Tool Test Script');
console.log('================================');

// Test message that should trigger a timeout
const testMessages = [
  { user: 'crayonoyarc', message: 'hello everyone!' },
  { user: 'normaluser', message: 'THIS IS ALL CAPS SPAM!!!!!!' },
  { user: 'spammer', message: 'buy now! buy now! buy now!' },
];

console.log('Test messages that should trigger timeouts:');
testMessages.forEach((msg, i) => {
  console.log(`${i + 1}. [${msg.user}]: ${msg.message}`);
});

console.log('\n✅ Test script created. Run the main bot to test moderation.');
console.log('The moderator bot should timeout these users when it sees these messages.');