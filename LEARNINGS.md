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

- Async test code should use `async` and `await`. The repo lint config explicitly disables `no-async-await` in `vite.config.ts` because it conflicted with `typescript-eslint(promise-function-async)`.
- A slice is not complete until its checkbox is updated in `specs/implementation-tasks.md`.
- Use `vp run test`, not `vp test`, when a slice relies on the repo's own Bun-runtime Vitest command. `vp test` uses the Vite+ test runner path, while `vp run test` respects the package script `bun ./node_modules/vitest/vitest.mjs run`.
- For Effect services in this repo, keep the `ServiceMap.Service` contract in `Services/<name>.ts` and the live/test implementation in `Layers/<name>.ts`; that satisfies the one-class-per-file lint rule and avoids falling back to structural error objects.
- This repo should target `esnext` in `tsconfig.json` so Effect code can use modern built-ins like `toReversed()` without extra compatibility workarounds.
- When Hono handlers need Effect services, create one shared `ManagedRuntime` for the app and pass that same runtime into `createApp`; otherwise request handling and shutdown can accidentally use different service instances.
- Prefer `Schema` for domain modeling wherever practical: use branded schema types for meaningful primitives and `Schema.Class` / literal schemas for persisted or cross-service records instead of plain TypeScript-only interfaces and string unions.
