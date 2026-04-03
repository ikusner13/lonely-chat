# Technical: Effect Architecture

## Service Graph

Coarse-grained services grouped by domain boundary. Three primary services + supporting infrastructure.

```
┌─────────────────────────────────────────────────────┐
│                    MainLive                          │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ ChatService   │  │ SessionService│  │ ApiService │ │
│  │              │  │              │  │            │ │
│  │ - Orchestrator│  │ - Lifecycle  │  │ - RPC      │ │
│  │ - ChatWindow  │  │ - CostTracker│  │ - WebSocket│ │
│  │ - Director    │  │ - Export     │  │ - Hono     │ │
│  │ - BotManager  │  │ - Scenarios  │  │            │ │
│  │ - AiClient    │  │              │  │            │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │        │
│  ┌──────┴─────────────────┴─────────────────┴──────┐ │
│  │              Shared Infrastructure               │ │
│  │                                                  │ │
│  │  PlatformAdapter  │  SqliteDb  │  ConfigService  │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Service Definitions (Pseudocode)

### ChatService

Owns the conversation engine: reading chat, deciding who speaks, generating responses.

```typescript
class ChatService extends ServiceMap.Service<
  ChatService,
  {
    // Chat window
    readonly getWindow: () => Effect<ChatMessage[]>;
    readonly pushMessage: (msg: ChatMessage) => Effect<void>;

    // Orchestrator
    readonly startOrchestration: () => Effect<void>;
    readonly stopOrchestration: () => Effect<void>;

    // Bot management
    readonly connectBot: (botId: string) => Effect<void, BotConnectionError>;
    readonly disconnectBot: (botId: string) => Effect<void>;
    readonly disconnectAll: () => Effect<void>;

    // Director
    readonly getDirectorState: () => Effect<DirectorState>;

    // Event stream (for UI)
    readonly events: Stream<OrchestratorEvent>;
  }
>()("lonely-chat/ChatService") {}
```

**Internally contains:**

- Chat message window (sliding buffer, Effect `Ref` + `PubSub`)
- Orchestrator loop (Effect fiber, consumes from PubSub)
- Director loop (Effect fiber, periodic evaluation)
- Bot instances (map of bot ID -> connection + generation queue)
- AI client (Vercel AI SDK wrapper)

### SessionService

Owns session lifecycle, cost tracking, scenarios, and data export.

```typescript
class SessionService extends ServiceMap.Service<
  SessionService,
  {
    // Lifecycle
    readonly startSession: (opts: SessionOpts) => Effect<Session, SessionStartError>;
    readonly stopSession: (reason: EndReason) => Effect<void>;
    readonly getActiveSession: () => Effect<Session | null>;

    // Cost tracking
    readonly recordCost: (tokens: number, cost: number) => Effect<void>;
    readonly getCostState: () => Effect<CostState>;

    // Scenarios
    readonly runScenario: (scenarioId: string) => Effect<void, ScenarioError>;
    readonly stopScenario: () => Effect<void>;

    // Export
    readonly exportSession: (sessionId: string, format: "csv" | "json") => Effect<Uint8Array>;

    // Events (cost alerts, session state changes)
    readonly events: Stream<SessionEvent>;
  }
>()("lonely-chat/SessionService") {}
```

**Internally contains:**

- Session state machine (Effect `Ref`)
- Cost accumulator (Effect `Ref`, checked after each generation)
- Timer fiber (checks time limit periodically)
- Alert thresholds (emits to event stream at 50/75/90%)
- Scenario engine (step executor fiber)

### ApiService

HTTP server + RPC routes + WebSocket management.

```typescript
class ApiService extends ServiceMap.Service<
  ApiService,
  {
    readonly start: () => Effect<void>;
    readonly stop: () => Effect<void>;
  }
>()("lonely-chat/ApiService") {}
```

**Internally contains:**

- Hono app instance
- Effect RPC router (CRUD for bots, scenarios, sessions, settings)
- Effect RPC streaming endpoints (session events, cost alerts)
- WebSocket handler (chat feed, orchestrator log stream)
- Static file serving (SvelteKit build)

### PlatformAdapter

```typescript
class PlatformAdapter extends ServiceMap.Service<
  PlatformAdapter,
  {
    readonly connect: (bot: BotCredentials) => Effect<PlatformConnection, PlatformConnectionError>;
    readonly disconnect: (connectionId: string) => Effect<void>;
    readonly sendMessage: (connectionId: string, text: string) => Effect<void, PlatformSendError>;
    readonly chatStream: (channel: string) => Stream<ChatMessage>;
    readonly streamStatus: (channel: string) => Stream<StreamStatusEvent>;
  }
>()("lonely-chat/PlatformAdapter") {}
```

Implemented by `TwitchAdapter` and `KickAdapter`. Selected by config/env.

## Layer Composition

```typescript
const MainLive = Layer.empty.pipe(
  // Infrastructure
  Layer.provideMerge(SqliteLive), // @effect/sql-sqlite-bun
  Layer.provideMerge(ConfigServiceLive), // reads env + DB settings
  Layer.provideMerge(PlatformAdapterLive), // Twitch or Kick based on config

  // Domain services
  Layer.provideMerge(ChatServiceLive),
  Layer.provideMerge(SessionServiceLive),
  Layer.provideMerge(ApiServiceLive),
);
```

## Error Types

```typescript
// Platform errors
class PlatformConnectionError extends Schema.TaggedErrorClass<PlatformConnectionError>()(
  "PlatformConnectionError",
  {
    platform: Schema.String,
    botId: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

class PlatformSendError extends Schema.TaggedErrorClass<PlatformSendError>()("PlatformSendError", {
  platform: Schema.String,
  botId: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

// Bot errors
class BotConnectionError extends Schema.TaggedErrorClass<BotConnectionError>()(
  "BotConnectionError",
  {
    botId: Schema.String,
    reason: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// AI errors
class AiGenerationError extends Schema.TaggedErrorClass<AiGenerationError>()("AiGenerationError", {
  botId: Schema.String,
  model: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

// Session errors
class SessionStartError extends Schema.TaggedErrorClass<SessionStartError>()("SessionStartError", {
  reason: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

class CostLimitError extends Schema.TaggedErrorClass<CostLimitError>()("CostLimitError", {
  currentCost: Schema.Number,
  limit: Schema.Number,
}) {}
```

## Error Recovery Strategy

Self-healing with per-bot isolation:

```
AI Generation Failure:
  1. Retry primary model (1s delay)
  2. Try fallback models in order
  3. If all fail: log error, skip bot's turn, bot stays online
  4. If 3 consecutive failures: mark bot as "degraded" in UI
  5. Never crash the session for a single bot failure

Platform Connection Failure:
  1. Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
  2. After 5 failed reconnects: mark bot offline, alert in UI
  3. Other bots continue unaffected

Platform Send Failure:
  1. Retry once (500ms delay)
  2. If rate-limited: respect retry-after header, queue message
  3. If auth error: attempt token refresh, retry
  4. If persistent failure: mark bot offline

Cost/Time Limit:
  1. At threshold (50/75/90%): emit alert event to UI
  2. At limit: gracefully end session (drain queue, disconnect bots)
  3. Record end_reason as "cost_limit" or "timeout"
```

## Fiber Topology

During an active session, these long-running Effect fibers are alive:

```
Main Fiber
  ├── ApiService fiber (Hono server)
  ├── ChatListener fiber (reads platform chat, publishes to PubSub)
  ├── Orchestrator fiber (consumes PubSub, runs speaker selection loop)
  ├── Director fiber (periodic evaluation, emits hints)
  ├── SessionTimer fiber (checks time limit every 10s)
  ├── CostChecker fiber (checks cost after each generation)
  ├── Bot fibers (one per connected bot)
  │     ├── Bot 1: generation queue consumer
  │     ├── Bot 2: generation queue consumer
  │     └── Bot N: generation queue consumer
  └── Scenario fiber (when active, executes steps)
```

All child fibers are forked with `Effect.forkChild` so they're scoped to the session lifecycle. When the session ends, all child fibers are interrupted.

## Runtime Lifecycle

```
1. App starts
2. Layer construction: SqliteLive -> ConfigServiceLive -> PlatformAdapterLive -> services
3. ApiService starts (Hono server listening)
4. App is IDLE — UI accessible, no bots connected

5. Session starts (manual or stream-online trigger)
6. ChatListener fiber starts (connects to platform, reads chat)
7. Bot fibers start (connect each enabled bot to platform)
8. Orchestrator + Director fibers start
9. SessionTimer + CostChecker fibers start
10. App is RUNNING

11. Session ends (manual, stream-offline, timeout, cost limit)
12. Scenario fiber interrupted (if active)
13. Orchestrator + Director fibers interrupted
14. Bot generation queues drained
15. Bot fibers interrupted (disconnect from platform)
16. ChatListener fiber interrupted
17. Memory generation runs (one AI call per bot)
18. Session record finalized in DB
19. App returns to IDLE
```
