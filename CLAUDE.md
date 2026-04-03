# CLAUDE.md

## Project Overview

**Lonely Chat** -- AI-powered Twitch chat bots. Multiple bots with distinct personalities join chat, respond to @mentions and randomly participate, with a moderator bot that can timeout users.

## Foundation

- **Effect v4** (4.0.0-beta.43)
- **Vite+** toolchain (oxlint + oxfmt), all lint categories enabled, type-aware
- **pnpm** package manager

## Commands

```bash
vp check        # format + lint + typecheck (USE THIS for validation)
vp lint         # lint only (type-aware enabled in config)
vp fmt          # format only
vp dev          # dev server
vp pack         # production build
vp test         # run tests
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

See `PLAN.md` for the rearchitecture plan.
