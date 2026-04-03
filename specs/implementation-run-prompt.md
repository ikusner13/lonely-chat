# Implementation Run Prompt

Use this file as the prompt wrapper for each implementation run.

The goal is to complete exactly one implementation slice from `specs/implementation-tasks.md` using the Ralph loop:

1. gather only the context needed for the slice
2. implement one thin vertical slice
3. verify it with tests and checks
4. report evidence

## Run Rules

- Work on exactly one slice at a time.
- Do not expand scope beyond the selected slice.
- Prefer tracer-bullet implementations over complete subsystem build-outs.
- Read only the spec inputs listed for the slice, plus the specific code files you need.
- Add or update targeted tests with the code change.
- Run the required verification before calling the slice done.
- If the slice grows, stop at the smallest working subset that still satisfies the acceptance criteria.
- If the slice cannot be verified, create the test seam first or split the task.
- Do not add lint-disable comments or suppressions unless the operator explicitly approved that change.
- If repo rules conflict, report the conflict instead of silently choosing one side.

## OpenAI and GPT Guidance

- Put the instructions first and the repo context after them.
- Keep the prompt simple, direct, and explicit.
- Use clear delimiters and headings.
- Prefer zero-shot instructions first. Add examples only if the output shape keeps drifting.
- Be explicit about the output contract: prose, checklist, JSON, patch, or report.
- Prefer strict schemas for machine-readable outputs.
- Keep context to the smallest possible set of high-signal files and specs.
- For planning, verification, and extraction tasks, keep sampling conservative.
- Do not output hidden reasoning. Output decisions, code, tests, and evidence.

## What To Read First

For any run:

1. Read this file.
2. Read the selected task in `specs/implementation-tasks.md`.
3. Read only the spec inputs listed on that task.
4. Read only the existing code files needed to implement that task.
5. Do not bulk-read the whole repo unless the task explicitly requires it.

## Required Prompt Packet

Every run should include these sections.

```md
You are implementing one slice from the Lonely Chat implementation checklist.

## Slice

`SLICE_ID: SLICE_TITLE`

## Goal

<exact behavior to add>

## Outcome

<what must be true when done>

## Spec Inputs

- specs/...
- specs/...

## Code In Scope

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
- `vp test <targeted command>`
- `<manual smoke check if needed>`

## Execution Rules

- read only the listed specs and in-scope files first
- keep the implementation to one thin vertical slice
- add or update targeted tests with the implementation
- if the task expands, stop at the smallest working subset that still satisfies the acceptance criteria
- finish with a concise report of files changed, tests run, smoke checks, and deferred follow-ups
```

## Completion Contract

A run is complete only when all of the following are true:

- the selected slice behavior exists end to end
- targeted tests for the slice pass
- `vp check` passes
- `vp pack` passes if the slice changes app wiring or production build shape
- any required manual smoke check has been performed and reported
- follow-up work has been left unchecked in the task list instead of being silently bundled in
- no new rule suppressions were added without explicit approval

## Final Report Format

At the end of the run, report:

- Slice completed
- Files changed
- Tests and checks run
- Manual verification performed
- Remaining follow-ups not included in this slice

## Operator Notes

- Prefer the first unchecked slice unless a specific slice is assigned.
- For external integrations, preserve a mock-backed automated path whenever possible.
- For Twitch, Kick, or OpenRouter work, keep credentials and network dependency outside the core automated verification path.
