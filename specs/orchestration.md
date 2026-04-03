# Orchestration

## Design Philosophy

Hybrid approach: **deterministic rules** for timing and speaker selection, **AI** for topic flow and conversational arcs. Be predictable when we can, natural when we need to be.

## Message Flow

```
Platform Chat
     |
     v
[Chat Listener] ── reads all messages ──> [Message Window]
                                               |
                                               v
                                        [Orchestrator]
                                          /    |    \
                                    select   decide   schedule
                                    who      what     when
                                         \   |   /
                                          v  v  v
                                      [Bot Instance]
                                            |
                                            v
                                      [AI Generate]
                                            |
                                            v
                                      [Platform Send]
```

## Speaker Selection (Deterministic)

Priority-ordered rules:

1. **Mention detection**: if a message @mentions a bot, that bot **always** responds
2. **Consecutive limit**: no bot can send more than 3 messages in a row (prevents pile-on)
3. **Cooldown**: each bot has a per-bot cooldown timer after speaking (prevents rapid-fire)
4. **Talkativeness roll**: for non-mention messages, each enabled bot rolls against its `talkativeness` score (0-100%). Multiple bots can "win" the roll
5. **Conversation threading**: if a bot was part of an ongoing exchange (spoke in last 3 messages), boost their probability of continuing
6. **Silence breaker**: if no bot has spoken for N seconds, force-trigger the bot with the highest talkativeness

## Topic Management (AI-Assisted)

A lightweight AI call (cheap/fast model) periodically evaluates the chat window and decides:

- Should the topic shift? (conversation going stale)
- What's the current vibe? (excited, bored, argumentative)
- Should a specific bot be nudged to respond? (e.g., a topic that matches their personality)

This runs on a slower cadence than individual bot responses — every 10-15 messages or every 2 minutes, whichever comes first. Output is a short directive injected into the next responding bot's context.

## Timing

All delays are randomized within ranges to feel human:

| Event                          | Delay       |
| ------------------------------ | ----------- |
| After being mentioned          | 1-3 seconds |
| Voluntary response             | 2-6 seconds |
| Follow-up in a thread          | 1-4 seconds |
| After silence breaker triggers | 3-8 seconds |

Typing simulation: delay scales with response length. A 5-word response has ~1s typing delay. A 25-word response has ~3-4s.

## Chat Context Window

Sliding window of recent messages shared across all bots:

- **Size**: last 15-20 messages
- **Expiry**: messages older than 10 minutes drop out
- **Content**: username, message text, timestamp, bot-or-human flag
- **Per-bot framing**: each bot gets a slightly different framing of the same history (e.g., "you noticed X said..." vs neutral log) to generate divergent reactions

## Anti-Patterns to Prevent

- **Echo chamber**: bots agreeing with everything. Vocabulary rules and personality divergence handle this
- **Pile-on**: 5 bots all responding to one message. Consecutive limit + cooldown prevent this
- **Dead air**: nobody talking. Silence breaker handles this
- **Rapid-fire**: messages faster than a human could type. Typing delays handle this
- **Topic lock**: same conversation forever. AI topic manager handles this
- **AI homogeneity**: all bots sounding the same. Example messages + vocabulary rules + model diversity handle this
