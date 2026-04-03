# Architecture

## Tech Stack

| Layer          | Technology                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Runtime        | Bun (fallback: Node 24)                                                     |
| Language       | TypeScript (strict)                                                         |
| Core framework | Effect v4 (services, layers, PubSub, Queue, Schema, SQL)                    |
| HTTP server    | Hono                                                                        |
| API layer      | @effect/rpc (replaces tRPC — native Effect integration, built-in streaming) |
| Real-time      | Effect RPC streaming + Hono WebSocket for chat feed                         |
| AI             | Vercel AI SDK v5 + OpenRouter provider                                      |
| Frontend       | Svelte 5 (SvelteKit) + Tailwind                                             |
| Database       | SQLite via @effect/sql-sqlite-bun                                           |
| Twitch         | Twurple (auth, chat, eventsub)                                              |
| Kick           | @nekiro/kick-api (OAuth 2.1, official API)                                  |
| Build          | Vite+ (oxlint + oxfmt)                                                      |
| Container      | Docker multi-stage builds                                                   |

## System Architecture

```
+------------------+     +-------------------+     +------------------+
|   Svelte 5 UI    |<--->|   Hono + Effect   |<--->|     SQLite       |
|  (SvelteKit)     |     |   RPC Server      |     |   (all config,   |
|                  |     |                   |     |    sessions,     |
| - Dashboard      |     | - Bot management  |     |    bot memory)   |
| - Chat viewer    |     | - Session control |     +------------------+
| - Analytics      |     | - Scenario engine |
| - Bot config     |     | - Cost tracking   |
+------------------+     +--------+----------+
                                  |
                    +-------------+-------------+
                    |                           |
             +------+------+            +-------+------+
             | Orchestrator |            | Platform     |
             | (hybrid AI   |            | Adapters     |
             |  + rules)    |            |              |
             +------+------+            | - Twitch     |
                    |                    | - Kick       |
             +------+------+            | - (future)   |
             | Bot Instances|            +-------+------+
             | (personality,|                    |
             |  memory,     +--------------------+
             |  AI client)  |     send/receive chat
             +--------------+
```

## Project Structure

```
lonely-chat/
  src/
    server/              # Hono + Effect RPC backend
      index.ts           # entry point
      rpc/               # Effect RPC router definitions
      services/
        orchestrator/    # hybrid turn-taking engine
        bot/             # bot lifecycle, personality, memory
        platform/        # adapter layer
          twitch/
          kick/
          adapter.ts     # shared interface
        session/         # session management, cost tracking
        scenario/        # scenario engine
        ai/              # OpenRouter / Vercel AI SDK integration
      db/
        schema.ts        # Effect SQL schema
        migrations/
    web/                 # SvelteKit frontend
      src/
        routes/
        lib/
          components/
          stores/
    shared/              # types shared between server + web
  specs/
  config/
  docker/
```

## Key Design Decisions

### Effect RPC over tRPC

tRPC's Hono adapter does not support WebSockets. Effect RPC provides native streaming, full Effect integration, and eliminates the impedance mismatch between Effect Schema and tRPC's Zod validators.

### SQLite over Postgres

Single-channel, single-user instances don't need Postgres. SQLite is embedded (no server), fast, and Effect has first-class support via `@effect/sql-sqlite-bun`. Simplifies local dev and Docker deployment.

### Platform Adapter Pattern

Each platform (Twitch, Kick) implements a shared interface:

- `connect(credentials): Effect<Connection>`
- `sendMessage(channel, text): Effect<void>`
- `onMessage(handler): Effect<void>` (for reading chat — single listener)
- `disconnect(): Effect<void>`

New platforms are added by implementing this interface.

### Monorepo, Single Process

Server and frontend are colocated. The Hono server serves both the API and the SvelteKit build. One process, one port, simple deployment.
