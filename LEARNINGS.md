# Learnings

Use this file to capture durable implementation lessons discovered while working on the repo.

Read this file before starting implementation work.

Add new learnings after finishing a slice when they are likely to help future runs.

Good learnings:

- repo-specific constraints that are easy to miss
- lint or tooling quirks
- build or test gotchas
- stable architectural decisions
- patterns that should be repeated in later slices

Do not add:

- task status updates
- temporary debugging notes
- obvious facts already stated clearly in `AGENTS.md` or the task list
- one-off details that will not help future work

## Current Learnings

- The repo lint config disables the conflicting `require-await` and `promise-function-async` rules in `vite.config.ts`; use the clearest Promise/Effect style for tests and local helpers instead of contorting code around those rules.
- A slice is not complete until its checkbox is updated in `specs/implementation-tasks.md`.
- Use `vp run test`, not `vp test`, when a slice relies on the repo's own package-script Vitest command. `vp test` uses the Vite+ test runner path, while `vp run test` respects the package script `node ./node_modules/vitest/vitest.mjs run`, which matters because the shared SQLite tests use `better-sqlite3` and do not run under Bun.
- For Effect services in this repo, keep the `ServiceMap.Service` contract in `Services/<name>.ts` and the live/test implementation in `Layers/<name>.ts`; that satisfies the one-class-per-file lint rule and avoids falling back to structural error objects.
- This repo should target `esnext` in `tsconfig.json` so Effect code can use modern built-ins like `toReversed()` without extra compatibility workarounds.
- When Hono handlers need Effect services, create one shared `ManagedRuntime` for the app and pass that same runtime into `createApp`; otherwise request handling and shutdown can accidentally use different service instances.
- Prefer `Schema` for domain modeling wherever practical: use branded schema types for meaningful primitives and `Schema.Class` / literal schemas for persisted or cross-service records instead of plain TypeScript-only interfaces and string unions.
- When a persistence test inserts outgoing mock chat messages, seed a matching `bots` row first if `session_messages.bot_id` has a foreign key to `bots.id`; otherwise the listener fiber fails on insert and the test can look like message persistence silently stopped.
- Background Effect fibers that must survive across separate `runtime.runPromise(...)` calls need a service-owned `Scope` plus `Effect.forkIn(scope)`. `Effect.forkChild` ties the listener to the single request/effect fiber and will stop mock session listeners after `startSession()` returns.
- When composing app or test runtimes in this repo, build dependency-free service layers first and combine them with `Layer.mergeAll`. Starting from `Layer.empty.pipe(Layer.provideMerge(...))` can leave earlier layers unable to see later dependencies, which showed up here as missing `AiClient`/`BotService` wiring for `SessionServiceLive`.
- In the orchestrator, treat talkativeness and thread-continuation rolls as fallback behavior. If at least one mentioned bot is still eligible after cooldown and consecutive-limit checks, only the mentioned bots should respond; if every mentioned bot is blocked, then the selector can fall back to other eligible bots.
- Time-based orchestration tests should rely on `TestClock.adjust(...)` and assert within the full configured delay window; multi-bot scheduled replies use jitter and stagger, so request/send assertions should not depend on a fixed completion order.
- Manual scripted scenarios should send bot output back through `PlatformAdapter.sendMessage(...)` instead of inserting `session_messages` directly; that keeps persistence, live chat streaming, and session totals on the existing listener path.
- Session lifecycle timestamps and timeout checks should use `Clock.currentTimeMillis`, not `Date.now()` / `new Date()` directly, so TestClock-driven session-limit tests stay deterministic.
- Keep VS-14's OpenRouter preview client as a route-specific `AiClient` layer in `createApp(...)` instead of swapping the shared app runtime layer; otherwise preview work would also flip mock-session generation over to real AI before the later live-generation slice.
- When using `@effect/ai-openrouter` in this repo, prefer the package's exported `Generated` request/response schema types over ad-hoc payload or response shapes; that keeps the live client aligned with the generated Effect contract and avoids structural parsing drift.
- For live AI generation, assemble prompts from persisted `session_messages` inside the scheduled send effect rather than at selection time; that keeps the OpenRouter request aligned with the stored chat window and avoids stale context after response delays.
- Optional AI sidecars inside the session loop, like director evaluations, should catch generation/JSON-decode failures and degrade to `null` directives instead of failing the main listener fiber; otherwise one bad director response can stop all live chat persistence and orchestration.
- Tests that insert `bot_memory` rows directly must seed the referenced `sessions` row first, because the new table keeps a real foreign key to `sessions.id` and SQLite will reject orphaned memory fixtures.
- Keep OAuth token storage separate from `BotRecord` and the main bot editor schema. For auth-status slices, add a dedicated `bot_tokens` model/query path and layer the derived `missing`/`expired`/`valid` status onto page-specific bot-manager data instead of broadening every bot consumer.
- Keep real platform integrations like Twitch auth/send as route-specific layers instead of adding them to the shared app runtime; otherwise missing Twitch env/config would break mock-only pages and session flows that do not use the live adapter.
- For the Twitch tracer bullet, provide `TwitchPlatformAdapterLive` only around the auth/send effects that need it and let it depend on the existing `BotService`; that keeps `/bots` OAuth/test-message flows moving without prematurely replacing the mock session adapter before VS-20.
- For live Twitch sessions, keep the shared `PlatformAdapter` optional-capable: only switch session startup over to Twitch when there is at least one enabled Twitch bot with stored credentials, and still resolve the target channel from the `settings.channel` value so mock-only runtimes can boot without Twitch env.
- Kick's current OAuth 2.1 flow requires PKCE. For the `/bots` auth tracer bullet, generate a per-request verifier/challenge pair in the start route, store the verifier in a short-lived callback cookie keyed by `state`, and keep the Kick live adapter route-scoped like the Twitch tracer bullet instead of wiring Kick into the shared session adapter before VS-22.
- Kick live-session tests in this repo need the full session adapter seam, not just chat send stubs: provide `buildSessionClient` plus no-op `createEventSubscriptions` / `deleteEventSubscriptions` hooks whenever a test constructs Kick live dependencies without exercising the real event-subscription path.
- For Kick live sessions, feed webhook `chat.message.sent` payloads into the adapter's existing session-client listener path via `publishKickSessionMessage(...)` instead of writing straight into `SessionService`; that keeps the same persistence/live-stream/orchestrator flow the mock and Twitch adapters already use.
- For Svelte route UI tests in this repo, prefer extracting a presentational component and server-rendering that component in Vitest. Route files that await data inside `<svelte:boundary>` tend to SSR their pending snippet, which makes direct route-render assertions unreliable.
- In `SessionService`'s timing-sensitive response fibers, add failure-state bookkeeping by wrapping the existing connect/generate/send steps with explicit `Effect.catch(...).as(...)` branches instead of rewriting the happy path around nested `Effect.either(...)` flows; that keeps the established TestClock-driven conversation loops stable while still surfacing degraded/offline state.
