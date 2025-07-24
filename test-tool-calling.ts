#!/usr/bin/env bun
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { env } from './src/env';

// Test tool calling directly
async function testToolCalling() {
  console.log('🧪 Testing tool calling directly...\n');

  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });

  try {
    // Test with a clear violation
    const result = await generateText({
      model: openrouter.chat('moonshotai/kimi-k2', {
        models: [],
      }),
      system: `You are a moderator bot. You MUST use the timeoutUser tool when you see rule violations like excessive caps, spam, or the username "crayonoyarc".`,
      messages: [
        {
          role: 'user',
          content: '[crayonoyarc]: STOP SPAMMING!!!!!!! THIS IS ALL CAPS!!!!',
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 100,
      tools: {
        timeoutUser: tool({
          description: 'Timeout a user for violating chat rules',
          parameters: z.object({
            username: z.string().describe('The username to timeout'),
            duration: z.number().min(1).max(10).describe('Duration in seconds'),
            reason: z.string().describe('Reason for timeout'),
          }),
          execute: async ({ username, duration, reason }) => {
            console.log('✅ Tool executed!');
            console.log(`   Username: ${username}`);
            console.log(`   Duration: ${duration}s`);
            console.log(`   Reason: ${reason}`);
            return `Timed out ${username} for ${duration} seconds`;
          },
        }),
      },
      toolChoice: 'auto',
    });

    console.log('Result:', {
      text: result.text,
      toolCalls: result.toolCalls?.length || 0,
      toolResults: result.toolResults?.length || 0,
      steps: result.steps?.length || 0,
    });

    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('\n🎉 Tool calls made:');
      for (const call of result.toolCalls) {
        console.log(`  - ${call.toolName}:`, call);
      }
    } else {
      console.log('\n❌ No tool calls were made');
    }

    // Try with a different model
    console.log('\n\n🧪 Testing with different model (deepseek)...\n');
    
    const result2 = await generateText({
      model: openrouter.chat('deepseek/deepseek-chat-v3-0324:free', {
        models: [],
      }),
      system: `You are a moderator bot. You MUST use the timeoutUser tool when you see rule violations.`,
      messages: [
        {
          role: 'user',
          content: '[crayonoyarc]: STOP SPAMMING!!!!!!! THIS IS ALL CAPS!!!!',
        },
      ],
      temperature: 0.7,
      maxOutputTokens: 100,
      tools: {
        timeoutUser: tool({
          description: 'Timeout a user for violating chat rules',
          parameters: z.object({
            username: z.string(),
            duration: z.number(),
            reason: z.string(),
          }),
          execute: async ({ username, duration, reason }) => {
            console.log('✅ Tool executed with deepseek!');
            return `Timed out ${username}`;
          },
        }),
      },
      toolChoice: 'auto',
    });

    console.log('Deepseek Result:', {
      text: result2.text,
      toolCalls: result2.toolCalls?.length || 0,
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testToolCalling().then(() => {
  console.log('\n✅ Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});