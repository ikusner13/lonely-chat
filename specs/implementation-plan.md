# Implementation Plan

Companion execution docs:

- `specs/implementation-tasks.md` is the checklist-only task list.
- `specs/implementation-agent-prompt.md` is the single-prompt entrypoint that selects the next runnable task automatically.
- `specs/implementation-run-prompt.md` is the reusable prompt wrapper for each implementation run.

This plan turns the current `specs/` set into tracer bullets and vertical slices that fit a Ralph loop:

1. Read only the spec inputs for the current task.
2. Implement one thin, end-to-end behavior.
3. Run the required checks.
4. Capture evidence that the slice works.
5. Only then move to the next slice.

The goal is not to finish a subsystem at a time. The goal is to land small, testable, demoable slices that an AI can complete reliably inside one context window.

## Planning Rules

### 1. Tracer bullet first

Start with the thinnest possible path through the real architecture: UI -> RPC/API -> Effect service -> SQLite/mock adapter -> stream/update back to UI.

Early slices may use:

- a mock platform adapter
- a fake or stub AI client
- simplified UI

That is intentional. The first slices prove the wiring and feedback loop before real platform complexity is added.

### 2. Vertical slices over subsystem phases

Each task must produce observable behavior. Avoid tasks like "build all DB models" or "finish orchestrator service" unless they are part of a user-visible or test-visible flow.

Prefer:

- "create a bot in UI and persist it"
- "start a mock session and see chat messages stream"
- "run a scenario and verify ordered messages"

Avoid:

- "add all repositories"
- "implement all platform abstractions"
- "build analytics backend"

### 3. Ralph-compatible task size

A task is the right size when it:

- has one primary behavior
- references a small spec set, usually 2-4 docs
- can be implemented without holding the entire project in context
- has a clear pass/fail result
- can be verified with targeted tests plus one smoke check

Split the task if it:

- touches more than one major domain boundary at once
- needs both real platform integration and new orchestration logic
- requires broad schema, backend, and multi-page UI work in one pass
- does not have an obvious automated verification path

### 4. Every task needs explicit acceptance criteria

Use acceptance criteria that are clear, independent, measurable, and testable. For this repo, every completed item must map to one or more executable checks.

### 5. Definition of done is mandatory

No task is complete until all of the following are true:

- the intended behavior exists end-to-end
- targeted tests for the slice pass
- `vp check` passes
- if the slice changes a user flow, a manual smoke check is recorded
- the task checkbox is updated in `specs/implementation-tasks.md`
- any durable new lesson from the slice is recorded in `LEARNINGS.md`
- any missing follow-up work is pushed to a later unchecked task, not hidden inside the current one
- no new lint or rule suppressions were added unless they were explicitly approved

## Ralph Loop Template

Use this template for every task issue or implementation prompt.

### Task header

- Slice ID:
- Goal:
- User-visible or test-visible outcome:
- Spec inputs:
- Files likely to change:

### Before editing

- Restate the exact behavior being added.
- State the automated checks that will prove it.
- State the manual smoke check, if one is needed.
- Read `LEARNINGS.md` for repo-specific lessons from previous slices.

### During implementation

- Keep the scope to the smallest viable behavior.
- Prefer mocks and seams over premature production integrations.
- Add or update targeted tests with the implementation.
- Do not add rule suppressions to force the slice through checks.
- If rules conflict, stop and record the conflict clearly.

### Before marking done

- Run the targeted tests for the slice.
- Run `vp check`.
- Run any slice-specific smoke check.
- Update the task checkbox in `specs/implementation-tasks.md`.
- Append durable new lessons to `LEARNINGS.md`.
- Record the evidence in the task or PR.

## AI Handoff Contract

Each slice above should be handed to an AI with a tight, structured prompt packet. Do not dump the entire repo or all specs into context.

### Prompting rules for implementation tasks

- Keep the prompt simple and direct.
- Use clear section delimiters and headers.
- Start zero-shot. Only add examples if the model keeps missing the desired output shape.
- Be specific about the end goal, constraints, and pass/fail checks.
- Do not ask for chain-of-thought. Ask for the code, tests, and verification evidence.
- Give the AI the smallest high-signal context that can possibly work.
- Prefer just-in-time context loading over pasting large files into the prompt.
- Include non-goals so the model does not expand the task on its own.
- Include exact commands for verification.
- Require the agent to follow the loop: gather context -> take action -> verify work -> repeat.

### OpenAI and GPT-specific guidance

If the task is being handed to an OpenAI GPT or Codex-style coding model, use these additional rules:

- Put the instructions first, then the context.
- Separate instructions from repo context with `###` or fenced sections.
- Be explicit about the desired output shape, file targets, and stopping point.
- Prefer saying what to do, not only what to avoid.
- For planning or status output that will be parsed, require a strict JSON schema or another tightly specified structure.
- For tool-based agent runs, prefer strict function schemas over free-form tool arguments.
- Keep tool surfaces narrow and non-overlapping so tool choice is obvious.
- Load rarely used tools or context only when needed.
- Prefer the latest capable model for complex coding slices; use smaller models only for narrow, low-risk subtasks.
- For long-running autonomous tasks through the API, prefer background execution rather than forcing a single foreground request to stay alive.
- For deterministic planning, classification, extraction, and verification tasks, use low temperature settings.

### OpenAI-specific prompt packet additions

When preparing a slice prompt for an OpenAI model, also include:

- exact output contract
- whether the result should be prose, checklist, JSON, patch, or report
- whether the model should call tools or stay text-only
- whether the task is planning, implementation, review, or verification
- the explicit completion condition

### OpenAI-specific output contracts

Use stronger output constraints for GPT models when the result feeds another system:

- planning output: checklist or JSON, never loose mixed prose
- task decomposition output: one task per item, each with goal, spec inputs, files, non-goals, acceptance criteria, verification
- review output: findings first, with severity and file references
- verification output: commands run, result, failures, and conclusion

If the output will be consumed by code or another agent, prefer Structured Outputs or strict function calling over plain-text parsing.

### Required context for every AI task

Every implementation prompt should include:

- Slice ID and title
- Goal
- User-visible or test-visible outcome
- Spec inputs for this slice only
- Relevant existing files or directories only
- Explicit non-goals
- Acceptance criteria
- Exact verification commands
- Expected final report format

### AI prompt template

```md
You are implementing `SLICE_ID: SLICE_TITLE`.

## Goal

<one paragraph on the exact behavior to add>

## Outcome

<what must be true in the product or tests when done>

## Spec Inputs

- specs/...
- specs/...

## Files In Scope

- src/...
- src/...

## Non-Goals

- do not ...
- do not ...

## Acceptance Criteria

- ...
- ...

## Verification

- `vp check`
- `vp test <targeted test command>`
- <manual smoke check if needed>

## Instructions

- load only the listed specs and files first
- keep the implementation to the smallest viable vertical slice
- add or update targeted tests with the code change
- if the task grows, stop at the smallest working subset that satisfies the acceptance criteria
- finish by reporting:
  - files changed
  - tests run
  - smoke checks performed
  - known follow-ups that were intentionally not included
```

### Context budget rules

Use these guardrails to keep tasks inside one context window:

- Prefer 2-4 spec docs, not the whole `specs/` directory.
- Prefer one primary directory or boundary at a time.
- If the task requires loading more than roughly 8-10 code files before editing, split it.
- If the task needs multiple pages of prompt examples, split it.
- If the task mixes real platform auth, orchestration changes, and UI work, split it.
- If the task cannot name a targeted test command before implementation, split it.
- If the task needs a machine-readable result and does not yet have a schema, add the schema first.

### Example non-goals by slice type

Use non-goals aggressively. Examples:

- bot CRUD slice: do not add preview, auth, or orchestration
- session slice: do not add scenarios or cost limits
- Twitch tracer bullet: do not add Kick support in the same task
- director slice: do not retune core speaker selection in the same task
- analytics slice: do not redesign unrelated dashboard UI

## Global Verification Standard

Every slice should name exact checks, but the default bar is:

- targeted unit/integration tests for the changed behavior
- `vp check`
- `vp pack` for slices that change app wiring or production build shape
- one manual smoke check for UI, streaming, or platform behavior

If a slice cannot be verified automatically yet, the slice is too early. Add the test seam first.

## Ordered Checklist

## Track 0: Foundation Tracer Bullets

### [ ] TB-01: Boot the app shell and health path

- Goal: Create the minimum runnable server and web shell so the repo has a real app entrypoint and one testable path.
- Outcome: App boots, serves a placeholder dashboard, and exposes a health/status endpoint.
- Spec inputs: `specs/overview.md`, `specs/architecture.md`, `CLAUDE.md`
- Verify:
  - add a server test for the health endpoint
  - add a smoke test or minimal app render test for the dashboard shell
  - run `vp check`
  - run `vp test`
  - run `vp pack`

### [ ] TB-02: Add SQLite runtime and migration runner

- Goal: Establish the real DB path early so later slices do not fake persistence.
- Outcome: App starts with SQLite configured, migrations run cleanly, and a smoke test proves the DB is reachable.
- Spec inputs: `specs/architecture.md`, `specs/data.md`, `specs/technical-effect.md`
- Verify:
  - add an integration test that boots the DB layer and runs migrations
  - add a failing-then-passing test for one simple read/write
  - run `vp check`
  - run targeted `vp test`

### [ ] TB-03: Add mock platform adapter and fake AI client

- Goal: Create the seams that let the first real user flow work without Twitch, Kick, or OpenRouter.
- Outcome: A mock adapter can emit and accept chat messages, and a fake AI client can return deterministic responses.
- Spec inputs: `specs/platforms.md`, `specs/technical-effect.md`, `specs/technical-ai.md`
- Verify:
  - add unit tests for mock adapter send/listen behavior
  - add unit tests for fake AI fallback behavior
  - run `vp check`
  - run targeted `vp test`

### [ ] TB-04: Start and stop a mock session from the dashboard

- Goal: Prove the first full tracer bullet across UI, API, service state, and persistence.
- Outcome: A user clicks Start Session, sees active status on the dashboard, then clicks Stop Session and sees the session end cleanly.
- Spec inputs: `specs/ui.md`, `specs/overview.md`, `specs/data.md`, `specs/technical-effect.md`
- Verify:
  - add an integration test for session start/stop state transitions
  - add a UI test for dashboard controls and status updates
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check of start/stop in the browser

## Track 1: Bot Configuration Vertical Slices

### [ ] VS-01: Persist bot records and list them in the UI

- Goal: Land the smallest useful bot-management slice.
- Outcome: A bot can be created in the database and appears in the Bot Manager list.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/ui.md`
- Verify:
  - add repository tests for bot create/list
  - add an RPC/API test for bot listing
  - add a UI test for rendering saved bots
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-02: Create and edit the core bot fields

- Goal: Support the minimum bot editing flow without every advanced field.
- Outcome: Name, display name, platform, model, enabled, and talkativeness are editable and persist correctly.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/ui.md`
- Verify:
  - add form validation tests
  - add integration tests for create and update flows
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check for create/edit in the UI

### [ ] VS-03: Add advanced personality fields and schema validation

- Goal: Complete the structured personality model in a testable way.
- Outcome: Example messages, vocabulary rules, response length, prompts, and fallback models are validated and stored.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/technical-ai.md`
- Verify:
  - add schema tests for valid and invalid bot payloads
  - add persistence tests for JSON-backed fields
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-04: Bot preview with fake AI

- Goal: Prove prompt assembly and preview wiring before real chat orchestration.
- Outcome: A user can preview a bot response in the UI using deterministic fake AI output.
- Spec inputs: `specs/bots.md`, `specs/ui.md`, `specs/technical-ai.md`
- Verify:
  - add prompt assembly tests
  - add API tests for preview requests
  - add a UI test for preview rendering
  - run `vp check`
  - run targeted `vp test`

## Track 2: Chat and Session Core Slices

### [ ] VS-05: Persist sessions and session messages

- Goal: Make chat history and exports possible before advanced orchestration.
- Outcome: Starting a session creates a session record, and incoming/outgoing messages are stored with the correct metadata.
- Spec inputs: `specs/data.md`, `specs/technical-effect.md`, `specs/platforms.md`
- Verify:
  - add repository tests for session and message writes
  - add integration tests that messages emitted by the mock adapter are persisted
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-06: Stream live chat into the Chat Viewer

- Goal: Create the first observable live-chat slice.
- Outcome: Messages from the mock adapter appear live in `/chat` and match persisted session history.
- Spec inputs: `specs/ui.md`, `specs/platforms.md`, `specs/technical-effect.md`
- Verify:
  - add tests for the WebSocket or stream bridge
  - add a UI test for live chat rendering
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check of the chat feed

### [ ] VS-07: Single-bot mention response loop

- Goal: Ship the smallest real orchestration behavior.
- Outcome: When a chat message mentions one enabled bot, that bot generates one response through the fake AI client and sends it back through the mock adapter.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/technical-ai.md`
- Verify:
  - add orchestrator tests for mention detection
  - add integration tests for generate-and-send flow
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-08: Multi-bot speaker selection, caps, and cooldowns

- Goal: Expand from one-response behavior to controlled multi-bot conversation.
- Outcome: Selection rules, responder cap, consecutive-message limits, and cooldowns behave as specified.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/bots.md`
- Verify:
  - add table-driven tests for speaker selection rules
  - add integration tests for cooldown and responder cap behavior
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-09: Timing engine and silence breaker

- Goal: Make the chat cadence feel plausible before director logic exists.
- Outcome: Responses are delayed according to trigger type, and a silence breaker schedules a new message after inactivity.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`
- Verify:
  - add tests with fake time for delay calculations
  - add integration tests for silence-breaker scheduling
  - run `vp check`
  - run targeted `vp test`

## Track 3: Scenario and Cost Slices

### [ ] VS-10: Persist scenarios and show them in the UI

- Goal: Land the CRUD slice before the runtime slice.
- Outcome: Scenarios can be created, listed, edited, and deleted in `/scenarios`.
- Spec inputs: `specs/scenarios.md`, `specs/data.md`, `specs/ui.md`
- Verify:
  - add repository tests for scenario persistence
  - add UI tests for scenario list and editor flows
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-11: Run manual scripted scenarios

- Goal: Prove scenario execution without adding every trigger type.
- Outcome: During an active session, a manual scenario runs its steps in order and injected messages appear in chat and persistence.
- Spec inputs: `specs/scenarios.md`, `specs/technical-orchestrator.md`, `specs/ui.md`
- Verify:
  - add integration tests for ordered step execution
  - add tests for `say`, `respond`, and `wait`
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check of run-scenario from the UI

### [ ] VS-12: Add time and cost limits with alert thresholds

- Goal: Enforce the safety rails before real AI spend exists.
- Outcome: Sessions emit 50/75/90% alerts and end automatically when the configured limit is crossed.
- Spec inputs: `specs/data.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-ai.md`
- Verify:
  - add tests for alert threshold emission
  - add tests for timeout and cost-limit termination
  - add a UI test for alert rendering
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-13: Export session history as CSV and JSON

- Goal: Finish a self-contained analytics-adjacent slice with clear output.
- Outcome: A completed session can be exported from the UI in both formats and matches stored data.
- Spec inputs: `specs/data.md`, `specs/ui.md`
- Verify:
  - add tests for CSV and JSON export generation
  - add API tests for content type and payload shape
  - run `vp check`
  - run targeted `vp test`

## Track 4: Real AI and Director Slices

### [ ] VS-14: Replace fake AI preview with real OpenRouter integration

- Goal: Swap the preview path to the real provider before live orchestration uses it.
- Outcome: Bot preview can call OpenRouter through the production AI client with model and fallback configuration.
- Spec inputs: `specs/technical-ai.md`, `specs/bots.md`, `specs/architecture.md`
- Verify:
  - add tests around request construction and fallback order
  - add a mocked provider integration test for error handling
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check with a configured API key

### [ ] VS-15: Use real AI for live bot generation

- Goal: Promote the single-bot and multi-bot chat loop from fake AI to the real client.
- Outcome: Live orchestration uses the production prompt assembly, token accounting, and fallback chain.
- Spec inputs: `specs/technical-ai.md`, `specs/technical-orchestrator.md`, `specs/data.md`
- Verify:
  - add integration tests around generation result handling and accounting
  - add tests for fallback and skip-on-failure behavior
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-16: Add director evaluation and hint injection

- Goal: Improve conversation quality only after the base loop is stable.
- Outcome: Director evaluations run on the configured triggers and influence the next orchestration cycle.
- Spec inputs: `specs/technical-orchestrator.md`, `specs/technical-ai.md`, `specs/orchestration.md`
- Verify:
  - add tests for director trigger conditions
  - add tests for hint application and nudge behavior
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-17: Generate and inject bot memory across sessions

- Goal: Add persistence of conversational style after live sessions already work.
- Outcome: Session-end summaries are generated per bot, stored, and injected into the next session's prompt assembly.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/technical-ai.md`
- Verify:
  - add tests for memory generation triggers
  - add tests for memory injection limits and ordering
  - run `vp check`
  - run targeted `vp test`

## Track 5: Platform Integration Slices

### [ ] VS-18: Persist bot tokens and show auth status

- Goal: Add the storage and UI contract before wiring full OAuth.
- Outcome: The app can store token metadata, show status per bot, and represent valid, expired, and missing credentials.
- Spec inputs: `specs/platforms.md`, `specs/data.md`, `specs/ui.md`, `specs/bots.md`
- Verify:
  - add repository tests for token storage and status derivation
  - add UI tests for auth status views
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-19: Twitch auth and send-message tracer bullet

- Goal: Land the thinnest real Twitch path before full live session support.
- Outcome: One Twitch bot can authorize, connect, and send a test message through the production adapter.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`
- Verify:
  - add adapter tests around token refresh and send behavior using mocks
  - add an integration test for the adapter boundary
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check against a test channel

### [ ] VS-20: Twitch live listener and session control

- Goal: Replace the mock platform path with Twitch for one real end-to-end slice.
- Outcome: A Twitch-backed session can start, receive chat, and show live messages in the UI.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-orchestrator.md`
- Verify:
  - add integration tests for adapter-to-session wiring
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check with a real stream or test channel

### [ ] VS-21: Kick auth and send-message tracer bullet

- Goal: Repeat the proven platform pattern on Kick in a small slice.
- Outcome: One Kick bot can authorize and send a test message through the production adapter.
- Spec inputs: `specs/platforms.md`, `specs/technical-effect.md`
- Verify:
  - add adapter tests for auth and send behavior
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check against a test channel

### [ ] VS-22: Kick live listener and session control

- Goal: Complete the second launch platform with the same bar as Twitch.
- Outcome: A Kick-backed session can start, receive chat, and show live messages in the UI.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-orchestrator.md`
- Verify:
  - add integration tests for Kick adapter wiring
  - run `vp check`
  - run targeted `vp test`
  - run a manual smoke check with a real stream or test channel

## Track 6: Analytics and Hardening Slices

### [ ] VS-23: Analytics page with session and per-bot summaries

- Goal: Add the first meaningful reporting slice after core runtime behavior exists.
- Outcome: `/analytics` shows session history, per-bot message counts, and cost totals from persisted data.
- Spec inputs: `specs/ui.md`, `specs/data.md`
- Verify:
  - add query tests for analytics aggregations
  - add a UI test for analytics rendering
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-24: Failure states, degraded bots, and recovery signals

- Goal: Make operational failure modes visible before broader use.
- Outcome: Auth failures, AI failures, reconnect attempts, and degraded bot states surface correctly in logs and UI.
- Spec inputs: `specs/technical-effect.md`, `specs/platforms.md`, `specs/ui.md`
- Verify:
  - add tests for failure-state transitions and retries
  - add UI tests for degraded/offline state display
  - run `vp check`
  - run targeted `vp test`

### [ ] VS-25: Regression suite for core conversation loops

- Goal: Lock in the behavior of the highest-risk slices before launch.
- Outcome: There is a stable regression suite covering session control, chat persistence, speaker selection, scenarios, limits, and platform adapter contracts.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/technical-ai.md`, `specs/platforms.md`
- Verify:
  - add or consolidate high-value integration tests
  - ensure every previous slice has an owned regression test
  - run `vp check`
  - run `vp test`
  - run `vp pack`

## Execution Notes

- Do not open all spec files for every task. Load only the listed inputs plus the files already touched by earlier slices.
- Prefer one slice per PR.
- If a slice grows during implementation, split it and keep the already-working subset as the current slice.
- Keep mocks in place until the matching real integration slice lands and has equivalent tests.
- When a slice depends on external credentials, preserve a mock-backed automated path so CI remains reliable.

## Research Basis

This plan is based on:

- tracer bullets from the Pragmatic Programmer approach: ship a thin end-to-end path early and adjust with feedback
- INVEST-style slicing: tasks should be independent, valuable or vertical, small, and testable
- acceptance-criteria discipline: each item should map cleanly to executable verification
- Anthropic's agent guidance: start with simple, composable patterns and only add complexity when it clearly improves outcomes
- Anthropic's context-engineering guidance: use the smallest set of high-signal context, structure prompts clearly, and load additional context just in time
- OpenAI prompt-engineering guidance: put instructions first, separate context with clear delimiters, be specific about the desired outcome, and start zero-shot before adding examples
- eval-driven agent work: define success and build verification early, not after the fact

References:

- Pragmatic Programmer tip on tracer bullets: <https://pragprog.com/tips>
- Agile Alliance on INVEST: <https://agilealliance.org/glossary/invest/>
- Agile Alliance on Definition of Done: <https://agilealliance.org/glossary/definition-of-done/>
- Atlassian on acceptance criteria: <https://www.atlassian.com/work-management/project-management/acceptance-criteria>
- OpenAI prompt engineering best practices: <https://help.openai.com/en/articles/6654000-best-practices-for-prompt-engineering-with-openai-api>
- Anthropic on building effective agents: <https://www.anthropic.com/research/building-effective-agents>
- Anthropic on context engineering for agents: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Anthropic on writing effective tools for agents: <https://www.anthropic.com/engineering/writing-tools-for-agents>
- Anthropic on evals for AI agents: <https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents>
