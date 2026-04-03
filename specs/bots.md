# Bots

## Identity & Auth

Each bot is a separate platform account. On Twitch, each bot has its own OAuth tokens. On Kick, each has its own OAuth 2.1 credentials. Tokens are stored in SQLite and managed through the web UI's auth flow.

Bots are **write-only** chat clients — they send messages but don't read chat. A single chat listener (per platform adapter) reads all incoming messages and feeds them to the orchestrator.

## Personality Schema

Inspired by the Character Card V2 spec, adapted for chat bot use. All fields are DB-backed and editable via the web UI.

### Core Fields

| Field            | Type     | Purpose                                          |
| ---------------- | -------- | ------------------------------------------------ |
| `id`             | uuid     | internal identifier                              |
| `name`           | string   | platform username (must match the OAuth account) |
| `displayName`    | string   | how other bots refer to them                     |
| `platform`       | enum     | twitch, kick                                     |
| `model`          | string   | OpenRouter model ID                              |
| `fallbackModels` | string[] | ordered list of fallback model IDs               |
| `temperature`    | number   | 0.0 - 2.0                                        |
| `maxTokens`      | number   | response token limit                             |
| `enabled`        | boolean  | whether bot is active                            |

### Personality Fields

| Field               | Type                         | Purpose                                                                                                                                           |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personality`       | string                       | short trait summary — declarative sentences ("sarcastic, brief, never apologizes")                                                                |
| `description`       | string                       | background, backstory, character context                                                                                                          |
| `exampleMessages`   | string[]                     | 3-5 sample messages — **highest impact on voice/style**. Models imitate format, punctuation, vocabulary from examples more than from instructions |
| `firstMessage`      | string?                      | intro message sent when bot joins. Models pattern-match off this                                                                                  |
| `postHistoryPrompt` | string?                      | injected after chat history, before generation — strongest enforcement point for staying in character                                             |
| `vocabularyRules`   | string[]                     | per-bot constraints: "never use exclamation points", "never say 'certainly'" — prevents AI homogeneity                                            |
| `responseLength`    | { min: number, max: number } | word count range — **response length is a personality trait** (shy bot: 3-5 words, verbose bot: 15-25)                                            |
| `talkativeness`     | number                       | 0-100 — probability of responding when not mentioned. 0 = only responds to @mentions                                                              |
| `systemPrompt`      | string?                      | full override — if set, replaces assembled prompt. Escape hatch for complex characters                                                            |

### Why Structured > Free-Text

Research shows:

- `exampleMessages` shape writing style more effectively than description text
- `vocabularyRules` (negative constraints) prevent all bots converging to "helpful assistant" voice
- Per-bot `responseLength` creates strong differentiation with zero prompt engineering
- `talkativeness` as a numeric field enables the orchestrator to make deterministic decisions
- Different `temperature` + different `model` per bot creates the most divergence

### Prompt Assembly

When `systemPrompt` is not set, the prompt is assembled from structured fields:

```
[personality]
[description]
[vocabularyRules as "NEVER: ..." list]
[responseLength as "Keep responses between X and Y words"]
[postHistoryPrompt — injected after chat history]
```

`exampleMessages` are injected as few-shot examples in the chat history, not in the system prompt.

## Memory

Bots have persistent conversation style memory across sessions:

- Running jokes and catchphrases they develop
- Personality quirks that emerge during conversations
- Stored as AI-generated session summaries in SQLite
- Injected into context as "things you remember" at the start of each session

Memory is **not** full conversation recall — just style/personality evolution.

## Lifecycle

1. Bot created via UI (name, personality fields, platform, OAuth)
2. Bot sits idle until session starts
3. On session start: bot connects to platform, sends `firstMessage` if set
4. During session: orchestrator decides when bot speaks, bot generates + sends response
5. On session end: AI summarizes session highlights for memory, bot disconnects
