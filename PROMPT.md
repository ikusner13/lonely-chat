# Agent Prompt

Read `AGENTS.md` and `LEARNINGS.md` and follow them exactly.

For implementation work:

- use `specs/implementation-tasks.md` as the source of truth
- execute exactly one slice
- if no task is explicitly named, select the next runnable unchecked task based on `Depends on`
- verify the slice fully before claiming completion
- mark the task done in `specs/implementation-tasks.md` before claiming completion
- append any durable new repo learnings to `LEARNINGS.md` before finishing
- report results and stop

If the operator names a specific task, do that task instead of auto-selecting.
