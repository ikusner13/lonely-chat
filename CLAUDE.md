# CLAUDE.md

## Project Overview

**Lonely Chat** -- AI-powered Twitch chat bots. Multiple bots with distinct personalities join chat, respond to @mentions and randomly participate, with a moderator bot that can timeout users. Built on Effect v4.

## Stack

- **Effect**: v4 (4.0.0-beta.43) -- ServiceMap.Service, Layer, PubSub, Queue, Ref, Schema, SQL
- **Toolchain**: Vite+ (oxlint + oxfmt), all categories enabled, type-aware
- **Package manager**: pnpm
- **Twitch**: Twurple (auth, chat, api, eventsub-ws)
- **AI**: Vercel AI SDK v5 + OpenRouter provider
- **HTTP**: Hono (auth dashboard/API) bridged via ManagedRuntime
- **DB**: SQLite via @effect/sql-sqlite-bun
- **Config**: TOML with hot-reload (SIGHUP)

## Commands

```bash
vp check        # format + lint + typecheck (USE THIS for validation)
vp lint         # lint only (type-aware enabled in config)
vp fmt          # format only
vp dev          # dev server
vp pack         # production build
vp test         # run tests
```

## Project Structure

```
src/                           # all source code
  index.ts                     # BunRuntime.runMain(Layer.launch(MainLive))
  AppConfig.ts                 # Effect Config layer (env vars)
  Errors.ts                    # Schema.TaggedErrorClass errors
  Pubsub.ts                   # PubSub tags: StreamEventPubSub, ChatMessagePubSub
  MainLive.ts                  # top-level layer composition
  config/                      # bot config schema + TOML loader
  db/                          # SQLite layer + token repo
  auth/                        # TokenManager + OAuth service
  twitch/                      # stream monitor, chat listener, bot clients
  bot/                         # bot manager, response coordinator, queue, message window
  ai/                          # AI service (generateText/generateObject)
  http/                        # Hono server + routes + JSX components
.references/                   # Effect v4 reference repos (not committed)
```

## Effect v4 Patterns

Always run `effect-solutions show <topic>` before writing Effect code. Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

<!-- effect-solutions:start -->

### Service definition

```typescript
class Foo extends ServiceMap.Service<
  Foo,
  {
    readonly bar: (x: string) => Effect.Effect<number, FooError>;
  }
>()("lonely-chat/Foo") {
  static readonly layer = Layer.effect(
    Foo,
    Effect.gen(function* () {
      const bar = Effect.fn("Foo.bar")(function* (x: string) {
        // ...
      });
      return Foo.of({ bar });
    }),
  );
}
```

### Errors

```typescript
class FooError extends Schema.TaggedErrorClass<FooError>()("FooError", {
  cause: Schema.optional(Schema.Defect),
}) {}
```

### Layer composition

```typescript
const MainLive = Layer.empty.pipe(
  Layer.provideMerge(ServiceALive),
  Layer.provideMerge(ServiceBLive),
  // ...
);
```

### Key v4 differences from v3

- `ServiceMap.Service` not `Context.Tag`
- `Effect.fn("name")` for named functions
- `Effect.forkChild` (was `fork`), `Effect.forkDetach` (was `forkDaemon`)
- `Effect.catch` (was `catchAll`), `Effect.catchCause` (was `catchAllCause`)
- `Ref.get(ref)` / `Ref.set(ref, val)` -- no more `yield* ref`
- `PubSub.bounded({ capacity })` + `Stream.fromPubSub` for subscriptions
- `Schema.TaggedErrorClass` (was `Schema.TaggedError`)

<!-- effect-solutions:end -->

## Effect v4 Reference Repos

Local clones in `.references/` for searching real implementations:

- `.references/effect-smol/ai-docs/` -- canonical examples (services, layers, PubSub, HTTP, Schema)
- `.references/effect-smol/migration/` -- v3 to v4 migration guides
- `.references/opencode/packages/opencode/src/` -- large Effect v4 app (ServiceMap.Service, ManagedRuntime+Hono, PubSub, Effect.fn)
- `.references/t3code/apps/server/src/` -- Effect v4 server (Layer.provideMerge, Queue+PubSub, HttpRouter)

## Architecture

See `PLAN.md` for full layer dependency graph, PubSub topology, and phased implementation plan.

## Environment Variables

Required: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_CHANNEL_ID`, `TWITCH_CHANNEL_NAME`, `OPENROUTER_KEY`

Optional: `TOKEN_DB_PATH` (default `./tokens.db`), `BOT_CONFIG_PATH` (default `./config/bots.toml`), `PORT` (default `8080`), `NODE_ENV`, `LOG_LEVEL`
