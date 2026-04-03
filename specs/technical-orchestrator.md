# Technical: Orchestrator

## State Machine

The orchestrator manages the flow of conversation. It consumes messages from the chat listener and decides which bots respond.

### States

```
IDLE ─── session starts ──> RUNNING
RUNNING ─── session ends ──> DRAINING
DRAINING ─── queue empty ──> IDLE

Within RUNNING:
  WAITING ─── message arrives ──> EVALUATING
  EVALUATING ─── speakers selected ──> SCHEDULING
  SCHEDULING ─── delays set ──> GENERATING
  GENERATING ─── response ready ──> SENDING
  SENDING ─── sent ──> WAITING
```

### Core Loop (Pseudocode)

```
loop:
  message = await chatWindow.nextMessage()

  // 1. Speaker Selection (deterministic)
  candidates = selectSpeakers(message, botStates)

  // 2. For each selected bot, schedule with delay
  for bot in candidates:
    delay = calculateDelay(bot, message)
    schedule(delay, async () => {
      // 3. Check if still valid (bot might have been pre-empted)
      if bot.cooldownActive or bot.consecutiveCount >= 3:
        skip

      // 4. Get director hint if available
      hint = director.currentHint()

      // 5. Assemble prompt + generate
      prompt = assemblePrompt(bot, chatWindow, hint)
      response = await aiService.generate(bot.model, prompt, bot.fallbackModels)

      // 6. Send to platform
      await platformAdapter.sendMessage(channel, response)

      // 7. Update state
      bot.lastSpokeAt = now()
      bot.consecutiveCount += 1
      resetOtherBotsConsecutive()
      costTracker.record(response.tokensUsed, response.cost)
    })

  // Silence breaker check
  if timeSinceLastMessage() > silenceThreshold:
    triggerSilenceBreaker()
```

## Speaker Selection Algorithm

Priority-ordered. Each rule can select 0+ bots. Results are merged and deduplicated.

```
function selectSpeakers(message, botStates):
  selected = []

  // Rule 1: Mention detection
  for bot in enabledBots:
    if message.text contains "@{bot.name}":
      selected.push(bot)  // always responds

  // Rule 2: Conversation threading
  for bot in enabledBots:
    if bot.spokeInLast(3, chatWindow) and bot not in selected:
      if random() < 0.4:  // 40% chance to continue thread
        selected.push(bot)

  // Rule 3: Talkativeness roll
  for bot in enabledBots:
    if bot not in selected:
      if random() < (bot.talkativeness / 100):
        selected.push(bot)

  // Rule 4: Consecutive limit filter
  selected = selected.filter(bot => bot.consecutiveCount < 3)

  // Rule 5: Cooldown filter
  selected = selected.filter(bot => !bot.cooldownActive)

  // Rule 6: Cap total responders
  if selected.length > 3:
    selected = selected.sortBy(priority).take(3)
    // priority: mentioned > threading > talkativeness

  return selected
```

## Timing Engine

```
function calculateDelay(bot, message):
  base = match triggerType:
    Mention    -> randomBetween(1000, 3000)   // 1-3s
    Threading  -> randomBetween(1000, 4000)   // 1-4s
    Voluntary  -> randomBetween(2000, 6000)   // 2-6s
    Silence    -> randomBetween(3000, 8000)   // 3-8s

  // Add typing simulation: ~50ms per word of eventual response
  // We estimate response length from bot.responseLength
  typingDelay = bot.responseLength.avg * 50

  // Stagger multiple bots so they don't all fire at once
  stagger = bot.selectionIndex * randomBetween(500, 1500)

  return base + typingDelay + stagger
```

## Cooldown Management

```
Per-bot state:
  lastSpokeAt: timestamp
  consecutiveCount: number  // resets when another bot speaks
  cooldownUntil: timestamp  // lastSpokeAt + cooldownDuration

Cooldown duration:
  base = 5 seconds
  + 2 seconds per consecutive message (so 3rd message = 11s cooldown)
  + jitter of 0-2 seconds
```

## Silence Breaker

```
silenceThreshold = 15 seconds (configurable)

function triggerSilenceBreaker():
  // Pick the bot with highest talkativeness that isn't on cooldown
  bot = enabledBots
    .filter(b => !b.cooldownActive)
    .sortBy(b => b.talkativeness)
    .last()

  if bot:
    // Give it a special hint to start a new topic
    schedule(randomBetween(3000, 8000), () =>
      generate(bot, hint="Start a new conversation topic naturally")
    )
```

## Director

### Trigger Conditions

The director runs when ANY of:

- 15 messages have been sent since last director evaluation
- 2 minutes have passed since last evaluation
- A scenario is active and needs topic injection

### Director Prompt

```
SYSTEM: You are a conversation director. Analyze the chat and output JSON.

CHAT LOG:
{last 15 messages}

OUTPUT FORMAT:
{
  "topic_shift": boolean,       // should conversation shift topics?
  "suggested_topic": string?,   // if shift, what topic?
  "vibe": string,               // "high_energy" | "low_energy" | "argumentative" | "friendly" | "stale"
  "nudge_bot": string?,         // bot name to nudge to speak next, if any
  "nudge_reason": string?       // why nudge this bot
}
```

### Director Output Handling

- `topic_shift=true`: inject `suggested_topic` into next bot's context
- `vibe=stale`: boost talkativeness rolls by 20% temporarily
- `nudge_bot`: that bot gets a guaranteed slot in next speaker selection
- All decisions logged to orchestrator event stream (visible in UI log panel)

## Scenario Integration

When a scenario is active:

1. Scenario steps take priority over organic orchestration
2. Between steps, organic chat continues normally
3. Topic from scenario is always active in director context
4. If a step targets a bot that's on cooldown, cooldown is overridden
5. After scenario ends, topic lingers for 30 seconds then fades

```
function processScenarioStep(step):
  match step.action:
    "say" ->
      // Send exact message, no AI generation
      await platformAdapter.sendMessage(channel, step.content)

    "respond" ->
      // AI generation with step's content as hint
      hint = step.content
      response = await generate(step.bot, hint)
      await platformAdapter.sendMessage(channel, response)

    "wait" ->
      await sleep(step.delayAfter)
```

## PubSub Topology

```
                    +---> [Bot 1 Queue]
                    |
[Chat Listener] -->  PubSub  --+---> [Bot 2 Queue]
                    |
                    +---> [Bot N Queue]
                    |
                    +---> [Orchestrator]
                    |
                    +---> [Director] (sampled, not every message)
                    |
                    +---> [Session Logger]
                    |
                    +---> [UI WebSocket Feed]
```

- **Chat Listener** publishes every message to a shared PubSub
- **Orchestrator** subscribes and runs speaker selection
- **Director** subscribes but only evaluates every N messages
- **Session Logger** subscribes and writes every message to DB
- **UI Feed** subscribes and forwards to WebSocket connections
- **Bot Queues** receive scheduled generation tasks from the orchestrator
