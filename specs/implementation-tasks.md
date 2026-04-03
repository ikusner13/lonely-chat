# Implementation Tasks

This file is the execution checklist only. It is intentionally short.

Use it with:

- `specs/implementation-plan.md` for the planning rules
- `specs/implementation-run-prompt.md` for the per-run AI prompt

## Track 0: Foundation Tracer Bullets

### [x] TB-01: Boot the app shell and health path

- Depends on: none
- Outcome: App boots, serves a placeholder dashboard, and exposes a health/status endpoint.
- Spec inputs: `specs/overview.md`, `specs/architecture.md`, `CLAUDE.md`
- Verify: health endpoint test, dashboard shell test, `vp check`, `vp test`, `vp pack`

### [x] TB-02: Add SQLite runtime and migration runner

- Depends on: `TB-01`
- Outcome: App starts with SQLite configured, migrations run cleanly, and a smoke test proves the DB is reachable.
- Spec inputs: `specs/architecture.md`, `specs/data.md`, `specs/technical-effect.md`
- Verify: DB boot/migration test, simple read/write integration test, `vp check`, targeted `vp test`

### [x] TB-03: Add mock platform adapter and fake AI client

- Depends on: `TB-01`
- Outcome: A mock adapter can emit and accept chat messages, and a fake AI client can return deterministic responses.
- Spec inputs: `specs/platforms.md`, `specs/technical-effect.md`, `specs/technical-ai.md`
- Verify: mock adapter tests, fake AI tests, `vp check`, targeted `vp test`

### [x] TB-04: Start and stop a mock session from the dashboard

- Depends on: `TB-02`, `TB-03`
- Outcome: A user clicks Start Session, sees active status on the dashboard, then clicks Stop Session and sees the session end cleanly.
- Spec inputs: `specs/ui.md`, `specs/overview.md`, `specs/data.md`, `specs/technical-effect.md`
- Verify: session state integration test, dashboard UI test, `vp check`, targeted `vp test`, manual smoke check

## Track 1: Bot Configuration Vertical Slices

### [x] VS-01: Persist bot records and list them in the UI

- Depends on: `TB-02`, `TB-04`
- Outcome: A bot can be created in the database and appears in the Bot Manager list.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/ui.md`
- Verify: bot repository tests, bot listing API test, bot list UI test, `vp check`, targeted `vp test`

### [x] VS-02: Create and edit the core bot fields

- Depends on: `VS-01`
- Outcome: Name, display name, platform, model, enabled, and talkativeness are editable and persist correctly.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/ui.md`
- Verify: form validation tests, create/update integration tests, `vp check`, targeted `vp test`, manual smoke check

### [x] VS-03: Add advanced personality fields and schema validation

- Depends on: `VS-02`
- Outcome: Example messages, vocabulary rules, response length, prompts, and fallback models are validated and stored.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/technical-ai.md`
- Verify: schema tests, JSON field persistence tests, `vp check`, targeted `vp test`

### [x] VS-04: Bot preview with fake AI

- Depends on: `VS-03`, `TB-03`
- Outcome: A user can preview a bot response in the UI using deterministic fake AI output.
- Spec inputs: `specs/bots.md`, `specs/ui.md`, `specs/technical-ai.md`
- Verify: prompt assembly tests, preview API tests, preview UI test, `vp check`, targeted `vp test`

## Track 2: Chat and Session Core Slices

### [x] VS-05: Persist sessions and session messages

- Depends on: `TB-04`
- Outcome: Starting a session creates a session record, and incoming/outgoing messages are stored with the correct metadata.
- Spec inputs: `specs/data.md`, `specs/technical-effect.md`, `specs/platforms.md`
- Verify: session/message repository tests, mock adapter persistence integration test, `vp check`, targeted `vp test`

### [x] VS-06: Stream live chat into the Chat Viewer

- Depends on: `VS-05`
- Outcome: Messages from the mock adapter appear live in `/chat` and match persisted session history.
- Spec inputs: `specs/ui.md`, `specs/platforms.md`, `specs/technical-effect.md`
- Verify: stream bridge tests, live chat UI test, `vp check`, targeted `vp test`, manual smoke check

### [x] VS-07: Single-bot mention response loop

- Depends on: `VS-03`, `VS-05`, `TB-03`
- Outcome: When a chat message mentions one enabled bot, that bot generates one response through the fake AI client and sends it back through the mock adapter.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/technical-ai.md`
- Verify: mention detection tests, generate-and-send integration test, `vp check`, targeted `vp test`

### [x] VS-08: Multi-bot speaker selection, caps, and cooldowns

- Depends on: `VS-07`
- Outcome: Selection rules, responder cap, consecutive-message limits, and cooldowns behave as specified.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/bots.md`
- Verify: table-driven selection tests, cooldown/cap integration tests, `vp check`, targeted `vp test`

### [x] VS-09: Timing engine and silence breaker

- Depends on: `VS-08`
- Outcome: Responses are delayed according to trigger type, and a silence breaker schedules a new message after inactivity.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`
- Verify: fake-time delay tests, silence-breaker integration tests, `vp check`, targeted `vp test`

## Track 3: Scenario and Cost Slices

### [x] VS-10: Persist scenarios and show them in the UI

- Depends on: `TB-02`, `TB-04`
- Outcome: Scenarios can be created, listed, edited, and deleted in `/scenarios`.
- Spec inputs: `specs/scenarios.md`, `specs/data.md`, `specs/ui.md`
- Verify: scenario repository tests, scenario UI tests, `vp check`, targeted `vp test`

### [x] VS-11: Run manual scripted scenarios

- Depends on: `VS-10`, `VS-05`, `VS-07`
- Outcome: During an active session, a manual scenario runs its steps in order and injected messages appear in chat and persistence.
- Spec inputs: `specs/scenarios.md`, `specs/technical-orchestrator.md`, `specs/ui.md`
- Verify: ordered step execution tests, `say`/`respond`/`wait` tests, `vp check`, targeted `vp test`, manual smoke check

### [x] VS-12: Add time and cost limits with alert thresholds

- Depends on: `VS-05`
- Outcome: Sessions emit 50/75/90% alerts and end automatically when the configured limit is crossed.
- Spec inputs: `specs/data.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-ai.md`
- Verify: threshold tests, timeout/cost-limit tests, alert UI test, `vp check`, targeted `vp test`

### [x] VS-13: Export session history as CSV and JSON

- Depends on: `VS-05`
- Outcome: A completed session can be exported from the UI in both formats and matches stored data.
- Spec inputs: `specs/data.md`, `specs/ui.md`
- Verify: CSV/JSON generation tests, export API tests, `vp check`, targeted `vp test`

## Track 4: Real AI and Director Slices

### [ ] VS-14: Replace fake AI preview with real OpenRouter integration

- Depends on: `VS-04`
- Outcome: Bot preview can call OpenRouter through the production AI client with model and fallback configuration.
- Spec inputs: `specs/technical-ai.md`, `specs/bots.md`, `specs/architecture.md`
- Verify: request construction tests, fallback/error integration test, `vp check`, targeted `vp test`, manual smoke check

### [ ] VS-15: Use real AI for live bot generation

- Depends on: `VS-08`, `VS-12`, `VS-14`
- Outcome: Live orchestration uses the production prompt assembly, token accounting, and fallback chain.
- Spec inputs: `specs/technical-ai.md`, `specs/technical-orchestrator.md`, `specs/data.md`
- Verify: generation/accounting integration tests, fallback tests, `vp check`, targeted `vp test`

### [ ] VS-16: Add director evaluation and hint injection

- Depends on: `VS-15`, `VS-09`
- Outcome: Director evaluations run on the configured triggers and influence the next orchestration cycle.
- Spec inputs: `specs/technical-orchestrator.md`, `specs/technical-ai.md`, `specs/orchestration.md`
- Verify: director trigger tests, hint/nudge tests, `vp check`, targeted `vp test`

### [ ] VS-17: Generate and inject bot memory across sessions

- Depends on: `VS-15`
- Outcome: Session-end summaries are generated per bot, stored, and injected into the next session's prompt assembly.
- Spec inputs: `specs/bots.md`, `specs/data.md`, `specs/technical-ai.md`
- Verify: memory generation tests, memory injection ordering/limit tests, `vp check`, targeted `vp test`

## Track 5: Platform Integration Slices

### [ ] VS-18: Persist bot tokens and show auth status

- Depends on: `VS-01`
- Outcome: The app can store token metadata, show status per bot, and represent valid, expired, and missing credentials.
- Spec inputs: `specs/platforms.md`, `specs/data.md`, `specs/ui.md`, `specs/bots.md`
- Verify: token storage/status tests, auth status UI tests, `vp check`, targeted `vp test`

### [ ] VS-19: Twitch auth and send-message tracer bullet

- Depends on: `VS-18`
- Outcome: One Twitch bot can authorize, connect, and send a test message through the production adapter.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`
- Verify: token refresh/send tests, adapter boundary integration test, `vp check`, targeted `vp test`, manual smoke check

### [ ] VS-20: Twitch live listener and session control

- Depends on: `VS-19`, `VS-05`
- Outcome: A Twitch-backed session can start, receive chat, and show live messages in the UI.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-orchestrator.md`
- Verify: adapter-to-session integration tests, `vp check`, targeted `vp test`, manual smoke check

### [ ] VS-21: Kick auth and send-message tracer bullet

- Depends on: `VS-18`
- Outcome: One Kick bot can authorize and send a test message through the production adapter.
- Spec inputs: `specs/platforms.md`, `specs/technical-effect.md`
- Verify: auth/send adapter tests, `vp check`, targeted `vp test`, manual smoke check

### [ ] VS-22: Kick live listener and session control

- Depends on: `VS-21`, `VS-05`
- Outcome: A Kick-backed session can start, receive chat, and show live messages in the UI.
- Spec inputs: `specs/platforms.md`, `specs/ui.md`, `specs/technical-effect.md`, `specs/technical-orchestrator.md`
- Verify: Kick adapter wiring tests, `vp check`, targeted `vp test`, manual smoke check

## Track 6: Analytics and Hardening Slices

### [ ] VS-23: Analytics page with session and per-bot summaries

- Depends on: `VS-05`, `VS-12`
- Outcome: `/analytics` shows session history, per-bot message counts, and cost totals from persisted data.
- Spec inputs: `specs/ui.md`, `specs/data.md`
- Verify: analytics query tests, analytics UI test, `vp check`, targeted `vp test`

### [ ] VS-24: Failure states, degraded bots, and recovery signals

- Depends on: `VS-15`, `VS-19`, `VS-21`
- Outcome: Auth failures, AI failures, reconnect attempts, and degraded bot states surface correctly in logs and UI.
- Spec inputs: `specs/technical-effect.md`, `specs/platforms.md`, `specs/ui.md`
- Verify: failure-state transition tests, degraded/offline UI tests, `vp check`, targeted `vp test`

### [ ] VS-25: Regression suite for core conversation loops

- Depends on: `VS-16`, `VS-17`, `VS-20`, `VS-22`, `VS-24`
- Outcome: There is a stable regression suite covering session control, chat persistence, speaker selection, scenarios, limits, and platform adapter contracts.
- Spec inputs: `specs/orchestration.md`, `specs/technical-orchestrator.md`, `specs/technical-ai.md`, `specs/platforms.md`
- Verify: regression suite added or consolidated, `vp check`, `vp test`, `vp pack`
