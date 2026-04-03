# Implementation Agent Prompt

Use this as the single prompt contract for an implementation run.

The agent should not create a new project plan. The project plan already exists in:

- `specs/implementation-tasks.md`
- `specs/implementation-plan.md`

The agent's job is to:

1. determine the next executable slice from the task list
2. implement exactly that slice
3. verify it
4. report the result
5. stop

## Task Selection Rule

Choose the next task using this exact rule:

1. scan `specs/implementation-tasks.md`
2. find all unchecked tasks
3. exclude any unchecked task whose `Depends on` items are not all done
4. from the remaining tasks, pick the earliest task in file order
5. do not skip ahead unless the prompt explicitly tells you to

This keeps execution deterministic and prevents the agent from replanning the roadmap.

## Execution Rule

After selecting the task:

1. read this file
2. read the chosen task in `specs/implementation-tasks.md`
3. read only the listed spec inputs for that task
4. read only the code files needed for that task
5. implement the smallest end-to-end slice that satisfies the task
6. add or update targeted tests for that slice
7. run the listed verification
8. report evidence
9. stop after one slice

## Scope Control

- Work on exactly one slice.
- Do not redesign the plan.
- Do not pull in unrelated future work.
- If the task expands, complete the smallest working subset that still satisfies the task's outcome and verification.
- If the task cannot be verified, create the test seam first or stop and explain the blocker.
- Do not add lint-disable comments or rule suppressions just to get a slice through checks.
- If repo rules conflict with each other, stop and report the conflict explicitly instead of picking one rule silently.

## OpenAI and GPT Guidance

- Put instructions before context.
- Keep outputs direct and structured.
- Read the smallest possible set of high-signal files.
- Prefer zero-shot execution unless examples are required for output shape.
- Do not output hidden reasoning. Output actions, decisions, code changes, tests, and evidence.

## Completion Contract

A slice is complete only if:

- the slice outcome is implemented
- targeted tests pass
- `vp check` passes
- `vp pack` passes when the slice changes app wiring or build shape
- any required manual smoke check is reported
- no new lint suppressions were introduced unless the operator explicitly approved them

## Final Report Format

Return:

- Selected slice
- Why it was selected
- Files changed
- Tests and checks run
- Manual verification performed
- Whether the slice is complete
- Follow-ups intentionally left for later slices

## Operator Use

When you start a run, the prompt can be as small as:

```md
Read `specs/implementation-agent-prompt.md` and follow it exactly.
```

Optionally, the operator may override selection with:

```md
Read `specs/implementation-agent-prompt.md` and follow it exactly.
Implement `VS-07` instead of auto-selecting the next task.
```
