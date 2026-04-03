## Project Overview

**Lonely Chat** -- AI-powered Twitch chat bots. Multiple bots with distinct personalities join chat, respond to @mentions and randomly participate, with a moderator bot that can timeout users.

## Foundation

- **Effect v4** (4.0.0-beta.43)
- **Vite+** toolchain (oxlint + oxfmt), all lint categories enabled, type-aware
- **pnpm** package manager; do not generate or commit `bun.lock`

## Commands

```bash
vp check        # format + lint + typecheck (USE THIS for validation)
vp lint         # lint only (type-aware enabled in config)
vp fmt          # format only
vp dev          # dev server
vp pack         # production build
vp run test     # run the repo's Bun-driven test command
```

## Discovery Workflow

- When answering questions that require searching many files, use subagents/explorers to parallelize codebase discovery.
- Split exploration by area or hypothesis, then synthesize the results before answering.

## Implementation Workflow

Use the implementation checklist as the source of truth:

- `specs/implementation-tasks.md` is the ordered task list
- `specs/implementation-plan.md` explains the slicing rules
- `LEARNINGS.md` stores durable repo-specific lessons from previous runs

When doing implementation work:

1. Select exactly one implementation slice.
2. If the operator did not specify a task:
   - find the next unchecked task in `specs/implementation-tasks.md`
   - only consider tasks whose `Depends on` items are already complete
   - pick the earliest runnable task in file order
3. Read `LEARNINGS.md` before editing code.
4. Read only that task's listed spec inputs, plus the code files needed for the slice.
5. Implement the smallest end-to-end behavior that satisfies the task.
6. Add or update targeted tests for the slice.
7. Run the task's required verification.
8. Mark the completed task as done in `specs/implementation-tasks.md`.
9. Append any durable new lessons to `LEARNINGS.md`.
10. Report results and stop after that one slice.

Do not create a new roadmap when the checklist already exists.

## Scope Rules

- Work on one slice only.
- Do not skip ahead unless the operator explicitly names a task.
- Do not bundle future work into the current slice.
- If a task expands, complete the smallest working subset that still satisfies the task outcome and verification.
- If the task cannot be verified, stop and report the blocker clearly.

## Rule And Lint Policy

- Do not add lint-disable comments or rule suppressions unless explicitly approved.
- If repo rules conflict, report the conflict instead of silently choosing one side.
- Do not claim a slice is complete unless the required checks actually pass.
- Do not claim a slice is complete until its checkbox is updated in `specs/implementation-tasks.md`.

## Verification Standard

For implementation slices, run the verification listed on the selected task. At minimum, this usually includes:

- `vp check`
- targeted `vp run test`
- `vp pack` when the slice changes app wiring or production build shape
- any manual smoke check listed on the task

## Implementation Report Format

At the end of an implementation run, report:

- Selected slice
- Why it was selected
- Files changed
- Specs read
- Whether `LEARNINGS.md` was read and updated
- Tests and checks run
- Manual verification performed
- Whether the slice is complete
- Confirmation that the task checkbox was updated
- Follow-ups intentionally left for later slices

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
