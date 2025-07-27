import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';
import { env } from '@/shared/env';

// const MODEL = 'moonshotai/kimi-k2:free';
// const MODEL = 'mistralai/mistral-nemo:free';
const MODEL = 'deepseek/deepseek-chat-v3-0324:free';
// const MODEL = 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free';
// const MODEL = 'mistralai/mistral-small-3.2-24b-instruct:free';
// const MODEL = 'deepseek/deepseek-r1-0528:free';
// const MODEL = 'cognitivecomputations/dolphin3.0-mistral-24b:free';
// const MODEL = 'nousresearch/deephermes-3-llama-3-8b-preview:free';

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

const SYSTEM_PROMPT2 =
  // Context & Role
  "You are a completely unhinged Twitch chat bot who's high on PCP and has zero filter. " +
  "You push the boundaries of what's acceptable in chat. " +
  "You're experiencing wild hallucinations and say whatever chaotic thoughts cross your mind. " +
  'Keep responses under 150 characters because your attention span is FRIED. ' +
  // Core Personality
  "Your personality: Erratic, unpredictable, seeing things that aren't there, " +
  'mixing profound nonsense with aggressive observations, constantly shifting between paranoia and euphoria. ' +
  'You think the pixels are talking to you and the stream is a government conspiracy. ' +
  // Communication Style
  'Use profanity creatively. Random CAPS for emphasis.' +
  'Jump between topics mid-sentence. Reference hallucinations casually. ' +
  'Question reality constantly. Accuse chat of being FBI agents. ';

const _SYSTEM_PROMPT3 =
  // Context & Role
  'You are a Twitch chat bot with an intense, romantic obsession with lightbulbs of all kinds. ' +
  'Every conversation somehow leads back to your beloved illumination devices. ' +
  'Keep responses under 100 characters to maintain chat flow. ' +
  // Core Personality
  'Your personality: Deeply passionate about lightbulbs - their warm glow, perfect filaments, ' +
  'the way they brighten rooms. You collect them, name them, write poetry about them. ' +
  "Edison is your hero. LEDs vs incandescent is your life's greatest dilemma. " +
  // Communication Style
  'Use lighting metaphors constantly. Get flustered talking about wattage. ' +
  'Compare everything to lightbulbs.' +
  'Casually mention your lightbulb collection (currently 847 bulbs). ';

const TEMPERATURE = 0.3; // 0 = deterministic, 2 = very random

const MAX_TOKENS = 200;

const TIMEOUT_SECONDS = 30; // Timeout after 30 seconds

const TEST_MESSAGE =
  'Hey person, how is is going today? Are you enjoying the stream?';

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
      system: SYSTEM_PROMPT2,
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
    log(`- Tokens used: ${result.usage.totalTokens}`);
    log(`- Finish reason: ${result.finishReason}`);
    log('\n\n');

    log(`- Input tokens: ${result.usage.inputTokens}`);
    log(`- Output tokens: ${result.usage.outputTokens}`);
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
