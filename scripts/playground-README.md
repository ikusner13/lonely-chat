# AI Model Playground

A simple script to test different AI models through OpenRouter.

## Usage

1. Edit the configuration in `src/playground.ts`:
   - `MODEL` - The AI model to use
   - `SYSTEM_PROMPT` - The personality/behavior of the AI
   - `TEMPERATURE` - Randomness (0-2)
   - `MAX_TOKENS` - Maximum response length
   - `TEST_MESSAGE` - Your test message

2. Run the playground:
   ```bash
   bun run src/playground.ts
   ```

## Examples

Check `src/playground-examples.ts` for pre-configured examples you can copy into the playground script:

- **Friendly Bot** - Enthusiastic chatbot with emojis
- **Code Expert** - Technical programming assistant
- **Creative Writer** - Storytelling and narrative
- **Meme Lord** - Internet culture and memes
- **Technical Writer** - Documentation specialist
- **Philosopher** - Deep thinking and philosophy
- **Speed Test** - Quick responses with free model
- **Game Master** - Tabletop RPG dungeon master
- **JSON Responder** - Structured JSON output
- **Conversation Test** - Natural dialogue

## Understanding Temperature

Temperature controls the randomness and creativity of AI responses. It's crucial for fine-tuning bot personalities:

### Temperature Scale (0.0 - 2.0)

- **0.0 - 0.3**: **Deterministic/Focused**
  - Nearly identical responses to the same prompt
  - Best for: Technical documentation, factual Q&A, code generation
  - Personality: Serious, professional, reliable
  
- **0.4 - 0.7**: **Balanced** (Default range)
  - Some variation while staying on topic
  - Best for: General assistants, customer service, tutoring
  - Personality: Helpful, conversational, consistent

- **0.8 - 1.0**: **Creative**
  - More diverse vocabulary and sentence structures
  - Best for: Storytelling, brainstorming, casual chat
  - Personality: Engaging, dynamic, spontaneous

- **1.1 - 1.5**: **Very Creative**
  - High variation, unexpected connections
  - Best for: Comedy, creative writing, unique personalities
  - Personality: Quirky, unpredictable, entertaining

- **1.6 - 2.0**: **Chaotic**
  - Maximum randomness, may go off-topic
  - Best for: Experimental use, finding edge cases
  - Personality: Wild, incoherent at times, surprising

### Fine-Tuning Tips

1. **Start at 0.7** and adjust based on results
2. **Lower by 0.1-0.2** if responses are too random
3. **Raise by 0.1-0.2** if responses feel robotic
4. **Match to personality**:
   - Meme Lord: 0.9-1.2 (needs creativity)
   - Code Expert: 0.2-0.4 (needs accuracy)
   - Friendly Bot: 0.7-0.9 (balanced but warm)
   - Philosopher: 0.6-0.8 (thoughtful but not rigid)

### Examples of Temperature Effects

Same prompt: "Tell me about cats"

- **0.2**: "Cats are small, carnivorous mammals that are often kept as pets. They belong to the family Felidae."
- **0.7**: "Cats are fascinating creatures! They're independent yet affectionate pets who've been human companions for thousands of years."
- **1.2**: "Oh cats? Those mysterious little furballs who think they own the universe! They're like tiny lions with WiFi passwords."

## Available Models

Some popular models on OpenRouter:
- `openai/gpt-4o-mini` - Fast and capable
- `anthropic/claude-3.5-sonnet` - Advanced reasoning
- `meta-llama/llama-3.1-70b-instruct` - Open source powerhouse
- `google/gemini-2.0-flash-exp:free` - Google's latest
- `moonshotai/kimi-k2:free` - Free model with good performance

See full list at: https://openrouter.ai/models