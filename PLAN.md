# Lonely Chat: Effect v4 Rearchitecture

## Context

Rearchitect from manual-DI/tseep/Hono/pino/p-queue to a unified Effect v4 app. Merge main+auth into one process. Fix known bugs (moderator infinite recursion, unused fallbackModels, dead code). Full Effect ecosystem: Layers, PubSub, Queue, Schema, SQL, Logger.

Keep: Twurple, Vercel AI SDK v5, Arctic, OpenRouter, TOML config, Hono (for HTTP/dashboard).

## Target Structure

```
src/
  index.ts                     # BunRuntime.runMain(Layer.launch(MainLive))
  AppConfig.ts                 # Effect Config layer (merges all 3 env.ts files)
  Errors.ts                    # Schema.TaggedErrorClass errors
  Pubsub.ts                   # PubSub tags: StreamEventPubSub, ChatMessagePubSub

  config/
    BotConfig.ts               # Effect Schema for TOML bot config
    ConfigLoader.ts            # Layer: reads TOML -> Ref<BotConfig[]>, SIGHUP reload

  db/
    SqlLive.ts                 # @effect/sql-sqlite-bun SqlClient layer
    TokenRepo.ts               # Typed token CRUD via SqlClient

  auth/
    TokenManager.ts            # Layer.scoped: RefreshingAuthProvider cache
    OAuthService.ts            # Layer: Arctic OAuth helpers

  twitch/
    StreamMonitor.ts           # Layer.scoped: EventSub -> PubSub<StreamEvent>
    ChatListener.ts            # Layer.scoped: IRC read -> PubSub<ChatMessage>
    ChatbotClient.ts           # Factory: per-bot write-only IRC, acquireRelease
    ModeratorClient.ts         # Layer.scoped: chat + API + 30s moderation loop

  bot/
    BotManager.ts              # Layer.scoped: creates/manages all bot clients
    MessageWindow.ts           # Layer: Ref<SlidingWindow>, subscribes ChatMessagePubSub
    ResponseCoordinator.ts     # Layer: mention/random logic, queues AI generation
    ChatbotQueue.ts            # Layer: bounded Queue + per-bot serial scheduling

  ai/
    AiService.ts               # Layer: wraps generateText/generateObject

  http/
    server.ts                  # Hono app + ManagedRuntime bridge to Effect services
    routes/
      dashboard.ts             # Dashboard HTML routes
      oauth.ts                 # OAuth flow routes (bot/channel/moderator)
      api.ts                   # JSON API routes (tokens CRUD)
    components/                # JSX templates (hono/jsx)

  MainLive.ts                  # Top-level layer composition

config/bots.toml               # Unchanged
Dockerfile                     # Single (replaces two)
docker-compose.yml             # Single service (replaces two)
```

## Layer Dependency Graph

```
AppConfig (env vars)
+-- SqlLive (TOKEN_DB_PATH)
|   +-- TokenRepo
|       +-- TokenManager (+ AppConfig for client_id/secret)
|           +-- StreamMonitor (+ StreamEventPubSub)
|           +-- ChatbotClient instances (via BotManager)
|           +-- ModeratorClient (+ AiService, ChatMessagePubSub)
+-- ConfigLoader (BOT_CONFIG_PATH)
|   +-- BotManager (+ TokenManager)
|       +-- ResponseCoordinator (+ AiService, ChatbotQueue, MessageWindow, ChatMessagePubSub)
+-- AiService (OPENROUTER_KEY)
+-- OAuthService (client_id/secret/redirect)
+-- HttpServer (OAuthService, TokenRepo, TokenManager, ConfigLoader, BotManager)
```

## PubSub Topology

**`PubSub<StreamEvent>`** (`"online" | "offline"`)

- Publisher: StreamMonitor
- Subscriber: BotManager (connects/disconnects all bots via scoped lifecycle)

**`PubSub<ChatMessage>`** (`{ user, message, role }`)

- Publisher: ChatListener
- Subscribers: ResponseCoordinator, ModeratorClient, MessageWindow

Both `PubSub.bounded({ capacity: 256 })`.

## Error Types (src/Errors.ts)

All `Schema.TaggedErrorClass`:

- ConfigNotFoundError, ConfigParseError
- TokenNotFoundError, TokenRefreshError
- OAuthExchangeError
- TwitchConnectionError, TwitchApiError
- AiGenerationError, ModerationError
- BotNotFoundError, BotCreationError

## Key Design Decisions

**Dynamic bot count**: Bots aren't compile-time layers. BotManager holds `Ref<HashMap<string, ChatbotClient>>`. Each created via `acquireRelease` within a BotManager-owned Scope. Stream offline interrupts the scope, triggering all cleanup.

**Stream lifecycle**: BotManager subscribes to StreamEventPubSub in a long-running fiber. On `online`, forks a new Scope for all connections + ResponseCoordinator subscription. On `offline`, interrupts that scope.

**Moderator interval**: `Effect.repeat(drainBufferAndModerate, Schedule.fixed("30 seconds"))` -- replaces `setInterval`.

**Config hot-reload**: ConfigLoader forks a fiber: `Effect.async(SIGHUP) -> Ref.set(reloaded config) -> Effect.forever`. Services read from the Ref.

**Graceful shutdown**: `BunRuntime.runMain(Layer.launch(MainLive))` handles SIGTERM/SIGINT. All scoped finalizers run in reverse order. No manual shutdown code.

**HTTP**: Keep Hono for the auth dashboard/API (proven pattern from opencode). Bridge to Effect services via `ManagedRuntime.make(layer)`. Single Bun.serve() entry.

**Zod**: Keep for Vercel AI SDK `generateObject` schema parameter only. Everything else uses Effect Schema.

**Twurple interop**: Wrap callbacks with `Effect.async` (one-shot) or `PubSub.publish` inside callbacks (ongoing). `onRefresh` callback bridges to Effect via `Effect.runFork`.

## Effect v4 Patterns (from reference repos)

- Services: `ServiceMap.Service<Self, Shape>()("lonely-chat/ServiceName")`
- Methods: `Effect.fn("Service.method")(function*(...) {...})`
- Construction: `Service.of({...})` inside `Layer.effect(Service, Effect.gen(...))`
- Errors: `Schema.TaggedErrorClass<Self>()("ErrorName", { fields })`
- Layer composition: `Layer.provideMerge` chains bottom-up
- PubSub: `PubSub.bounded({ capacity: 256 })` + `Stream.fromPubSub` for subscriptions
- Queue workers: `Queue.unbounded` + `Effect.forever(Queue.take(q).pipe(Effect.flatMap(process)))`
- Ref: Explicit `Ref.get(ref)` / `Ref.set(ref, val)` (no yield\* ref in v4)
- Entry: `BunRuntime.runMain(Layer.launch(MainLive))`
- Hono bridge: `ManagedRuntime.make(layer)` for calling Effect from Hono handlers

## Package Changes

**Add**: `effect`, `@effect/platform`, `@effect/platform-bun`, `@effect/sql`, `@effect/sql-sqlite-bun`

**Remove**: `@t3-oss/env-core`, `tseep`, `p-queue`, `pino`, `pino-pretty`, `open`

**Keep**: `@twurple/*`, `ai`, `@openrouter/ai-sdk-provider`, `arctic`, `zod` (AI SDK only), `hono`

---

## Phased Implementation

### Phase 0: Setup + Dead Code Cleanup

- [ ] Install Effect v4 deps (`effect`, `@effect/platform`, `@effect/platform-bun`, `@effect/sql`, `@effect/sql-sqlite-bun`)
- [ ] Remove dead deps (`open`, can defer others until Phase 6)
- [ ] Delete dead code: `main/src/config/bot.config.ts`
- [ ] Remove unused `DISABLE_EVENTSUB` from `main/src/env.ts`
- [ ] Create `src/` directory structure
- [ ] Update tsconfig paths for new `src/` layout
- [ ] Add `.references/` to `.gitignore`
- [ ] Verify: `bun install` succeeds, `bun run type-check` passes

### Phase 1: Foundation

**Files**: `src/Errors.ts`, `src/AppConfig.ts`, `src/config/BotConfig.ts`, `src/config/ConfigLoader.ts`

- [ ] Error types via `Schema.TaggedErrorClass`
- [ ] Env config via Effect `Config` (merges main/auth/shared env vars)
- [ ] Bot config schema via Effect `Schema`
- [ ] Config loader with `Ref<BotConfig[]>` + SIGHUP reload fiber
- [ ] Verify: `bun run type-check`, smoke script loading config

### Phase 2: Database + Tokens

**Files**: `src/db/SqlLive.ts`, `src/db/TokenRepo.ts`, `src/auth/TokenManager.ts`, `src/auth/OAuthService.ts`

- [ ] `@effect/sql-sqlite-bun` SqlClient layer (WAL mode, schema migration)
- [ ] Typed token repo with `SqlSchema` queries
- [ ] TokenManager: RefreshingAuthProvider cache via `Ref<HashMap>`
- [ ] OAuthService: Arctic wrapper with typed errors
- [ ] Verify: smoke script reading existing tokens.db

### Phase 3: PubSub + Twitch Services

**Files**: `src/Pubsub.ts`, `src/twitch/StreamMonitor.ts`, `src/twitch/ChatListener.ts`, `src/twitch/ChatbotClient.ts`, `src/twitch/ModeratorClient.ts`

- [ ] PubSub service definitions (StreamEvent, ChatMessage)
- [ ] StreamMonitor: scoped EventSub WebSocket -> PubSub<StreamEvent>
- [ ] ChatListener: scoped anonymous IRC -> PubSub<ChatMessage>
- [ ] ChatbotClient: per-bot factory with acquireRelease
- [ ] ModeratorClient: chat + API + Schedule.fixed moderation loop
- [ ] Verify: log PubSub events from test fiber

### Phase 4: Bot Orchestration + AI

**Files**: `src/ai/AiService.ts`, `src/bot/MessageWindow.ts`, `src/bot/ChatbotQueue.ts`, `src/bot/ResponseCoordinator.ts`, `src/bot/BotManager.ts`

- [ ] AiService: generateText/generateObject with fallback models (bug fix)
- [ ] MessageWindow: Ref<SlidingWindow> with expiry
- [ ] ChatbotQueue: bounded Queue + per-bot serial scheduling
- [ ] ResponseCoordinator: mention detection + 25% random + queue
- [ ] BotManager: stream lifecycle, creates/manages all bots
- [ ] Verify: full bot lifecycle -- bots connect on stream online, respond

### Phase 5: HTTP Server + Dashboard (Hono + ManagedRuntime)

**Files**: `src/http/server.ts`, `src/http/routes/*.ts`, `src/http/components/*`

- [ ] Hono app with ManagedRuntime bridge to Effect services
- [ ] Dashboard routes (migrated from auth/src)
- [ ] OAuth routes (bot/channel/moderator)
- [ ] Token API routes (list/refresh/delete)
- [ ] JSX components (migrated from auth/src/components)
- [ ] Verify: `curl /health`, dashboard loads, OAuth flow works

### Phase 6: Entry Point + Cleanup

**Files**: `src/MainLive.ts`, `src/index.ts`, `Dockerfile`, `docker-compose.yml`

- [ ] MainLive: compose all layers via `Layer.provideMerge` chain
- [ ] index.ts: `BunRuntime.runMain(Layer.launch(MainLive))`
- [ ] Single Dockerfile (replaces two)
- [ ] Single docker-compose.yml (replaces two)
- [ ] Delete old code: `main/`, `auth/`, `shared/`
- [ ] Remove dead deps: `@t3-oss/env-core`, `tseep`, `p-queue`, `pino`, `pino-pretty`
- [ ] Update package.json scripts
- [ ] Verify: full e2e -- start, stream live, bots respond, dashboard, SIGHUP reload, SIGTERM shutdown, Docker build

---

## HTTP Endpoints

| Method | Path                                     | Purpose                |
| ------ | ---------------------------------------- | ---------------------- |
| GET    | `/health`                                | Health check           |
| GET    | `/`                                      | Dashboard HTML         |
| GET    | `/auth/{bot,channel,moderator}/new`      | OAuth start pages      |
| GET    | `/auth/{bot,channel,moderator}/callback` | OAuth callbacks        |
| GET    | `/auth/{bot,moderator}/:name`            | Token info pages       |
| GET    | `/api/tokens`                            | List all tokens (JSON) |
| POST   | `/api/tokens/refresh/:type/:name`        | Force refresh          |
| DELETE | `/api/tokens/:type/:name?`               | Delete token           |

## Risks

1. **Twurple callback -> Effect bridge**: `onRefresh` needs `Effect.runFork` from callback-land. Works but loses typed error channel at the boundary.
2. **Vercel AI SDK**: Returns promises, wrapped with `Effect.tryPromise`. `generateObject` needs Zod schema -- can't use Effect Schema directly.
3. **Effect v4 beta**: Unstable modules may break on minor upgrades. Pin exact versions.

## Reference Repos

- `.references/opencode` -- large Effect v4 app, Hono HTTP, ManagedRuntime bridge pattern
- `.references/t3code` -- Effect v4 server, HttpRouter, Services/Layers split, event sourcing
- `.references/effect-smol` -- canonical Effect v4 examples + migration guides in `ai-docs/` and `migration/`
