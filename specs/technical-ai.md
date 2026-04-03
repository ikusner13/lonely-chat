# Technical: AI & Prompt Engineering

## Prompt Assembly Pipeline

Each bot's prompt is assembled from structured personality fields. The pipeline runs every time a bot generates a response.

### Step 1: System Prompt Construction

If `bot.systemPrompt` is set, use it verbatim. Otherwise, assemble:

```
SYSTEM PROMPT:
─────────────
You are {bot.name}. You are chatting in a live stream chat on {platform}.

{bot.personality}

{bot.description}

RULES:
- Keep responses between {bot.responseLength.min} and {bot.responseLength.max} words
- DO NOT include your name or any prefix in messages
- DO NOT use action tags like *action*
- DO NOT continue or respond as other chatters
- Just write your direct response
{for each rule in bot.vocabularyRules:}
- NEVER: {rule}
{end}

{bot.postHistoryPrompt ?? ""}
```

### Step 2: Memory Injection

If bot has persistent memory entries, prepend to chat history:

```
THINGS YOU REMEMBER FROM PAST SESSIONS:
- {memory_summary_1}
- {memory_summary_2}
(max 3 most recent summaries, ~200 tokens total)
```

### Step 3: Example Messages (Few-Shot)

Bot's `exampleMessages` are injected as the first messages in chat history:

```
[example] {bot.name}: {exampleMessage_1}
[example] {bot.name}: {exampleMessage_2}
[example] {bot.name}: {exampleMessage_3}
```

These are marked as examples so they don't confuse the chat context, but models pattern-match format, punctuation, and vocabulary from them.

### Step 4: Chat History Window

The shared chat window (last 15-20 messages, max 10 min old) is appended as the conversation:

```
stickyman1776: PogChamp LETS GOOO
geneJacqueman: what is happening
jessiepinkman: yo this is crazy, yeah bitch!
[external] realviewer42: lol these bots are wild
stickyman1776: @geneJacqueman you seeing this??
```

Format: `{username}: {message}` — raw, shared, same for all bots.
External messages (non-bot) are marked with `[external]` so the model can distinguish.

### Step 5: Director Hint (Optional)

If the director has emitted a recent directive, append as a system-level nudge:

```
[CONTEXT: The conversation is getting stale. Consider bringing up a new topic. Current vibe: low energy]
```

This is NOT visible to the bot as a "message" — it's injected as a system instruction after the chat history.

### Step 6: Generation

```
Call OpenRouter with:
  model: bot.model (fallback chain: bot.fallbackModels)
  messages: [system_prompt, ...examples, ...memory, ...chat_history, director_hint]
  temperature: bot.temperature
  max_tokens: bot.maxTokens
  stop: ["\n"] (single-line responses for chat)
```

## Model Selection Strategy

### Per-Bot Models

Each bot has a primary model + ordered fallback list. This creates natural voice diversity — different models have different quirks.

### Fallback Chain

On generation failure (rate limit, model down, error):

1. Retry primary model once (1s delay)
2. Try fallback models in order
3. If all fail, skip this bot's turn (log error, don't crash session)

### Director Model

Uses the cheapest/fastest available model. The director prompt is simple and doesn't need quality:

- Recommended: `meta-llama/llama-3.1-8b-instruct:free` or similar
- Output is structured JSON, not creative text

## Token Budgeting

### Per-Message Budget

- System prompt: ~200-400 tokens (varies by personality complexity)
- Memory: ~200 tokens (capped)
- Example messages: ~100-150 tokens (3-5 short messages)
- Chat history: ~300-500 tokens (15-20 short chat messages)
- Director hint: ~30-50 tokens
- **Total input per generation: ~800-1300 tokens**
- Output: capped by `bot.maxTokens` (typically 50-150)

### Per-Session Budget

- Tracked on `sessions.total_tokens_used` and `sessions.total_cost_usd`
- OpenRouter returns cost in response metadata
- Checked after each generation against `sessions.cost_limit_usd`

### Cost Estimation

At typical rates with free/cheap models:

- ~1000 input tokens + ~100 output tokens per bot response
- At $0.10/M tokens: ~$0.0001 per response
- 10 bots, 5 messages/minute each = 50 msg/min = ~$0.30/hour
- With premium models: 10-100x more

## Session Memory Generation

At session end, one final AI call per bot generates a style summary:

```
SYSTEM: Summarize this bot's conversational style during this session.
Focus on: catchphrases they used, running jokes, notable interactions,
personality quirks that emerged. Keep it under 100 words.

[full session history for this bot]
```

Output stored in `bot_memory` table, injected into future sessions.

## Anti-Homogeneity Techniques

1. **Different models per bot** — strongest divergence signal
2. **Different temperatures** — 0.7 vs 1.1 creates measurably different variance
3. **Example messages** — models imitate format more than they follow instructions
4. **Vocabulary prohibitions** — prevents convergence to "helpful assistant" voice
5. **Response length constraints** — shy bot (3-5 words) vs verbose bot (15-25 words)
6. **Stop at newline** — prevents multi-line essay responses in chat context
