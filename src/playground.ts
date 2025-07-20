import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { Effect, pipe } from "effect";
// import { env } from '@/env';

// ========================================
// CONFIGURATION - Modify these as needed
// ========================================

// Available models you can try (some examples):
// - 'openai/gpt-4o-mini'
// - 'openai/gpt-4o'
// - 'anthropic/claude-3-haiku'
// - 'anthropic/claude-3.5-sonnet'
// - 'meta-llama/llama-3.1-8b-instruct:free'
// - 'meta-llama/llama-3.1-70b-instruct'
// - 'google/gemini-2.0-flash-exp:free'
// - 'mistralai/mistral-7b-instruct:free'
// - 'moonshotai/kimi-k2:free'
// Check OpenRouter docs for full list: https://openrouter.ai/models

// const MODEL = 'moonshotai/kimi-k2:free';
// const MODEL = 'mistralai/mistral-nemo:free';
const MODEL = "deepseek/deepseek-chat-v3-0324:free";
// const MODEL = 'mistralai/mistral-small-3.2-24b-instruct:free';
// const MODEL = 'deepseek/deepseek-r1-0528:free';

const SYSTEM_PROMPT =
  "You are an unhinged lunatic who lashes out at the user. Use obscene potty language. Keep your answer to a maximum of 2 sentences.";

const TEMPERATURE = 0.8; // 0 = deterministic, 2 = very random

const MAX_TOKENS = 200;

const TIMEOUT_SECONDS = 30; // Timeout after 30 seconds
// const TIMEOUT_SECONDS = 0.1; // Uncomment to test timeout behavior

// ========================================
// TEST MESSAGE - Change this to test different inputs
// ========================================

const TEST_MESSAGE = "Hows it going today? Are you enjoing my livestream?";

// ========================================
// MAIN PLAYGROUND CODE
// ========================================

async function playground() {
  console.log("🎮 AI Model Playground");
  console.log("====================");
  console.log(`Model: ${MODEL}`);
  console.log(`Temperature: ${TEMPERATURE}`);
  console.log(`Max Tokens: ${MAX_TOKENS}`);
  console.log(`Timeout: ${TIMEOUT_SECONDS}s`);
  console.log(`System Prompt: "${SYSTEM_PROMPT}"`);
  console.log("");
  console.log(`📨 Your Message: "${TEST_MESSAGE}"`);
  console.log("");
  console.log("⏳ Generating response...");
  console.log("");

  // const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_KEY });
  const openrouter = createOpenRouter();

  const startTime = Date.now();

  // Create an Effect that wraps the generateText call
  const generateTextEffect = Effect.tryPromise({
    try: () =>
      generateText({
        model: openrouter.chat(MODEL),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: TEST_MESSAGE,
          },
        ],
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_TOKENS,
        maxRetries: 0,
      }),
    catch: (error) => new Error(`GenerateText failed: ${error}`),
  });

  // Apply timeout and error handling
  const program = pipe(
    generateTextEffect,
    Effect.timeout(`${TIMEOUT_SECONDS} seconds`),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new Error(`Request timed out after ${TIMEOUT_SECONDS} seconds`))
    )
  );

  try {
    const result = await Effect.runPromise(program);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log("🤖 AI Response:");
    console.log("---------------");
    console.log(result.text);
    console.log("");
    console.log("📊 Stats:");
    console.log(`- Response time: ${duration.toFixed(2)}s`);
    console.log(`- Tokens used: ${result.usage?.totalTokens || "Unknown"}`);
    console.log(`- Finish reason: ${result.finishReason}`);

    if (result.usage) {
      console.log(`- Prompt tokens: ${result.usage.inputTokens}`);
      console.log(`- Completion tokens: ${result.usage.outputTokens}`);
      console.log(`- Total tokens: ${result.usage.totalTokens}`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    }
  }
}

// Run the playground
playground().catch(console.error);
