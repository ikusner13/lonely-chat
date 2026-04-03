# Scenarios

## What

Predefined chat sequences that trigger specific multi-bot interactions. Created and managed via the web UI, stored in SQLite. Used to test specific product features (e.g., ad CTA engagement, chat triggers, specific conversation patterns).

## Schema

| Field           | Type    | Purpose                                                                                         |
| --------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `id`            | uuid    | internal identifier                                                                             |
| `name`          | string  | human-readable name ("Ad CTA Hype", "New Viewer Welcome")                                       |
| `description`   | string  | what this scenario tests / simulates                                                            |
| `topic`         | string  | theme injected into participating bots' context — bots organically weave this into conversation |
| `participants`  | botId[] | which bots participate (subset of all configured bots)                                          |
| `triggerType`   | enum    | manual, timed (delay after session start), on-event                                             |
| `triggerConfig` | json    | config for the trigger (delay seconds, event type, etc.)                                        |
| `steps`         | Step[]  | optional ordered sequence of scripted beats                                                     |
| `duration`      | number? | estimated duration in seconds (for timed scenarios)                                             |
| `enabled`       | boolean | whether scenario can be triggered                                                               |

### Step Schema

Steps are optional — a scenario can be just a topic + participants (fully organic) or have scripted beats.

| Field        | Type    | Purpose                                                                    |
| ------------ | ------- | -------------------------------------------------------------------------- |
| `botId`      | uuid    | which bot performs this step                                               |
| `action`     | enum    | "say" (specific message), "respond" (AI-generated with topic hint), "wait" |
| `content`    | string? | for "say": exact message. For "respond": topic/context hint                |
| `delayAfter` | number  | seconds to wait after this step before next                                |

## How It Works

### Topic-Only Scenario (Organic)

1. Scenario triggered (manually or by timer)
2. Topic string injected into all participating bots' context
3. Orchestrator increases talkativeness of participating bots temporarily
4. Bots naturally start discussing the topic
5. Scenario ends after `duration` or manually

### Scripted Scenario

1. Scenario triggered
2. Steps execute in order with delays
3. "say" steps send exact messages
4. "respond" steps trigger AI generation with the step's content as a context hint
5. "wait" steps just pause
6. Between steps, organic conversation continues
7. After all steps complete, topic remains active for `duration`

## Example Scenarios

### "Ad CTA Engagement"

- **Topic**: "Check out [product] — looks pretty cool actually"
- **Participants**: 3 bots with different personalities
- **Steps**:
  1. Bot A says the CTA message (exact text)
  2. Wait 3s
  3. Bot B responds organically about the product (AI-generated)
  4. Wait 5s
  5. Bot C chimes in (AI-generated)
- **Purpose**: test how CTA messages look in active chat

### "Heated Debate"

- **Topic**: "controversial gaming opinion"
- **Participants**: 4 bots
- **Steps**: none (fully organic)
- **Duration**: 120 seconds
- **Purpose**: stress-test chat UI with rapid back-and-forth

### "New Viewer Arrival"

- **Topic**: "someone new just showed up"
- **Participants**: 2 bots
- **Steps**:
  1. Bot A: "respond" with hint "greet the new person enthusiastically"
  2. Wait 2s
  3. Bot B: "respond" with hint "welcome them more casually"
- **Purpose**: test welcome flows
