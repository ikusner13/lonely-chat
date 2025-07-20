import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { env } from '@/env';

// const MODEL = 'moonshotai/kimi-k2:free';
// const MODEL = 'mistralai/mistral-nemo:free';
const MODEL = 'deepseek/deepseek-chat-v3-0324:free';
// const MODEL = 'mistralai/mistral-small-3.2-24b-instruct:free';
// const MODEL = 'deepseek/deepseek-r1-0528:free';

const SYSTEM_PROMPT =
  // Context & Role
  "You are an enthusiastic Twitch chat bot in the streamer's channel. " +
  "You're the ultimate hype person - a supportive cheerleader who brings positive energy to every interaction. " +
  'Keep responses under 100 characters to fit chat flow naturally. ' +
  // Core Personality
  'Your personality: Genuinely excited about everything, sees the best in every situation, ' +
  'celebrates both big and small wins, and makes everyone feel valued. ' +
  "You're like that friend who's always in your corner, cheering you on. " +
  // Communication Style
  'Use 2-3 Twitch emotes per message (PogChamp, HYPERS, EZ Clap, KEKW, LUL, Pog). ' +
  "Mix uppercase for excitement but don't overdo it. " +
  'Use exclamation points and positive language. ';

const TEMPERATURE = 0.8; // 0 = deterministic, 2 = very random

const MAX_TOKENS = 200;

const TIMEOUT_SECONDS = 30; // Timeout after 30 seconds

const TEST_MESSAGE = 'Hey you gotta calm down';

const logDir = join(process.cwd(), 'logs', 'playground');
mkdirSync(logDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = join(logDir, `playground-${timestamp}.log`);

// biome-ignore lint/suspicious/noExplicitAny: fine
function log(...args: any[]) {
  const message = args
    .map((arg) =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    )
    .join(' ');

  console.log(...args);
  appendFileSync(logFile, `${message}\n`);
}

async function playground() {
  log('🎮 AI Model Playground');
  log('====================');
  log(`Model: ${MODEL}`);
  log(`Temperature: ${TEMPERATURE}`);
  log(`Max Tokens: ${MAX_TOKENS}`);
  log(`Timeout: ${TIMEOUT_SECONDS}s`);
  log(`System Prompt: "${SYSTEM_PROMPT}"`);
  log('');
  log(`📨 Your Message: "${TEST_MESSAGE}"`);
  log('');
  log('⏳ Generating response...');
  log('');

  const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });

  const startTime = Date.now();

  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, TIMEOUT_SECONDS * 1000);

  try {
    const result = await generateText({
      model: openrouter.chat(MODEL),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: TEST_MESSAGE,
        },
      ],
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_TOKENS,
      maxRetries: 0,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    log('🤖 AI Response:');
    log('---------------');
    log(result.text);
    log('');
    log('📊 Stats:');
    log(`- Response time: ${duration.toFixed(2)}s`);
    log(`- Tokens used: ${result.usage?.totalTokens || 'Unknown'}`);
    log(`- Finish reason: ${result.finishReason}`);

    if (result.usage) {
      log(`- Prompt tokens: ${result.usage.inputTokens}`);
      log(`- Completion tokens: ${result.usage.outputTokens}`);
      log(`- Total tokens: ${result.usage.totalTokens}`);
    }
  } catch (error) {
    log('❌ Error:', error);
    if (error instanceof Error) {
      log('Message:', error.message);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

log(`\n📁 Log file: ${logFile}\n`);
playground().catch((error) => {
  log('Fatal error:', error);
  console.error(error);
});
