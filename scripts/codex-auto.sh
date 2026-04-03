#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODEL="${CODEX_MODEL:-gpt-5.4}"
REASONING="${CODEX_REASONING:-high}"
SERVICE_TIER="${CODEX_SERVICE_TIER:-fast}"
AGENT_TIMEOUT_SECONDS="${CODEX_AGENT_TIMEOUT_SECONDS:-900}"
MAX_ATTEMPTS_PER_SLICE="${CODEX_MAX_ATTEMPTS_PER_SLICE:-6}"
MAX_ITERATIONS=0
RUN_PACK=false
NO_COMMIT=false
ALLOW_DIRTY=false
TASK_OVERRIDE=""
EXTRA_PROMPT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      TASK_OVERRIDE="$2"
      shift 2
      ;;
    --prompt)
      EXTRA_PROMPT="$2"
      shift 2
      ;;
    --pack)
      RUN_PACK=true
      shift
      ;;
    --no-commit)
      NO_COMMIT=true
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=true
      shift
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --reasoning)
      REASONING="$2"
      shift 2
      ;;
    --service-tier)
      SERVICE_TIER="$2"
      shift 2
      ;;
    --agent-timeout-seconds)
      AGENT_TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --max-attempts-per-slice)
      MAX_ATTEMPTS_PER_SLICE="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: scripts/codex-auto.sh [options]

Options:
  --task <id>             Implement a specific task instead of auto-selecting
  --prompt <text>         Extra operator instructions
  --pack                  Run `vp pack` after agent execution
  --no-commit             Do not create commits
  --allow-dirty           Skip the clean-worktree preflight check
  --max-iterations <n>    Stop after n completed slices in auto-select mode (0 means unlimited)
  --model <name>          Override model (default: gpt-5.4)
  --reasoning <level>     Override model reasoning effort (default: high)
  --service-tier <tier>   Override service tier (default: fast)
  --agent-timeout-seconds Stop a single Codex run after n seconds (default: 900)
  --max-attempts-per-slice
                         Stop after n unfinished attempts on the same slice (default: 6)
  --help                  Show this message
EOF
      exit 0
      ;;
    *)
      echo "unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

OUT_DIR=".codex-auto"
SCHEMA_FILE="$OUT_DIR/final.schema.json"
PROMPT_FILE="$OUT_DIR/prompt.md"
RESULT_FILE="$OUT_DIR/result.json"
PROGRESS_FILE="$OUT_DIR/progress.md"
CI_ERRORS_FILE="$OUT_DIR/ci-errors.md"
AGENT_TIMEOUT_FILE="$OUT_DIR/agent-timeout.md"
mkdir -p "$OUT_DIR"

log() {
  echo "[codex-auto] $*"
}

require_command() {
  local cmd="$1"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing required command: $cmd" >&2
    exit 1
  fi
}

require_clean_worktree() {
  if [[ "$ALLOW_DIRTY" == true ]]; then
    return 0
  fi

  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "worktree must be clean before running codex-auto" >&2
    exit 1
  fi
}

build_schema() {
  cat > "$SCHEMA_FILE" <<'EOF'
{
  "type": "object",
  "properties": {
    "status": { "type": "string", "enum": ["continue", "slice_complete", "blocked"] },
    "selected_slice": { "type": "string" },
    "summary": { "type": "string" },
    "tests_run": {
      "type": "array",
      "items": { "type": "string" }
    },
    "manual_verification": { "type": "string" },
    "task_checkbox_updated": { "type": "boolean" },
    "follow_ups": {
      "type": "array",
      "items": { "type": "string" }
    }
  },
  "required": [
    "status",
    "selected_slice",
    "summary",
    "tests_run",
    "manual_verification",
    "task_checkbox_updated",
    "follow_ups"
  ],
  "additionalProperties": false
}
EOF
}

build_prompt() {
  local iteration="$1"

  cat > "$PROMPT_FILE" <<EOF
Read \`PROMPT.md\`, \`AGENTS.md\`, \`LEARNINGS.md\`, and \`specs/implementation-agent-prompt.md\` and follow them exactly.
Work on exactly one implementation slice.
This is iteration $iteration.
EOF

  if [[ -n "$TASK_OVERRIDE" ]]; then
    cat >> "$PROMPT_FILE" <<EOF

Implement \`$TASK_OVERRIDE\` instead of auto-selecting.
EOF
  else
    cat >> "$PROMPT_FILE" <<'EOF'

Auto-select the next runnable unchecked task from `specs/implementation-tasks.md`.
EOF
  fi

  if [[ -n "$EXTRA_PROMPT" ]]; then
    cat >> "$PROMPT_FILE" <<EOF

Additional operator instructions: $EXTRA_PROMPT
EOF
  fi

  if [[ -f "$CI_ERRORS_FILE" ]]; then
    cat >> "$PROMPT_FILE" <<EOF

Previous verification failures are recorded in \`$CI_ERRORS_FILE\`. Fix those first.
EOF
  fi

  if [[ -f "$PROGRESS_FILE" ]]; then
    cat >> "$PROMPT_FILE" <<EOF

Previous iteration output is recorded in \`$PROGRESS_FILE\`.
EOF
  fi

  cat >> "$PROMPT_FILE" <<'EOF'

Make one implementation attempt and at most one verification pass inside this Codex invocation.
Run only the slice-specific targeted verification you need for this slice.
Do not run `vp check`; the outer loop runs it after you exit.
If a targeted check fails, stop and return JSON with `"status": "continue"` and summarize the failing command(s).
Do not enter an internal repair loop inside this Codex invocation.

Return only JSON matching the supplied schema.
Set "status" to "slice_complete" only if one slice is fully verified and its checkbox is updated.
Set "status" to "continue" if the loop should run again.
Set "status" to "blocked" if human input is required.
EOF
}

run_agent() {
  local iteration="$1"
  local agent_log_file="$OUT_DIR/codex.$iteration.log"

  rm -f "$RESULT_FILE" "$AGENT_TIMEOUT_FILE" "$agent_log_file"
  log "starting Codex iteration $iteration; raw log: $agent_log_file"

  codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    --model "$MODEL" \
    -c "model_reasoning_effort=\"$REASONING\"" \
    -c "service_tier=\"$SERVICE_TIER\"" \
    --cd "$ROOT" \
    --output-schema "$SCHEMA_FILE" \
    --output-last-message "$RESULT_FILE" \
    - < "$PROMPT_FILE" >"$agent_log_file" 2>&1 &
  local agent_pid="$!"

  (
    sleep "$AGENT_TIMEOUT_SECONDS"

    if kill -0 "$agent_pid" >/dev/null 2>&1; then
      cat > "$AGENT_TIMEOUT_FILE" <<EOF
Codex exceeded the per-run timeout of ${AGENT_TIMEOUT_SECONDS} seconds.
The process was terminated to avoid getting stuck in an internal repair loop.
EOF
      kill -TERM "$agent_pid" >/dev/null 2>&1 || true
      sleep 5

      if kill -0 "$agent_pid" >/dev/null 2>&1; then
        kill -KILL "$agent_pid" >/dev/null 2>&1 || true
      fi
    fi
  ) &
  local watchdog_pid="$!"
  local agent_status=0

  if ! wait "$agent_pid"; then
    agent_status="$?"
  fi

  kill "$watchdog_pid" >/dev/null 2>&1 || true
  wait "$watchdog_pid" >/dev/null 2>&1 || true

  if [[ -f "$AGENT_TIMEOUT_FILE" ]]; then
    echo "codex exec timed out after ${AGENT_TIMEOUT_SECONDS}s; see $AGENT_TIMEOUT_FILE and $agent_log_file" >&2
    return 124
  fi

  if [[ ! -f "$RESULT_FILE" ]]; then
    echo "codex exec exited without writing $RESULT_FILE; see $agent_log_file" >&2
    return 1
  fi

  log "finished Codex iteration $iteration"
  return "$agent_status"
}

append_progress() {
  local iteration="$1"

  {
    echo "## Iteration $iteration"
    cat "$RESULT_FILE"
    echo
  } >> "$PROGRESS_FILE"
}

capture_failure() {
  local command_name="$1"
  local log_file="$2"

  cat > "$CI_ERRORS_FILE" <<EOF
$command_name failed after the last iteration.
Read \`$log_file\` and fix those issues first.
EOF
}

run_checks() {
  local iteration="$1"
  local check_log="$OUT_DIR/vp-check.$iteration.log"
  local test_log="$OUT_DIR/vp-test.$iteration.log"
  local pack_log="$OUT_DIR/vp-pack.$iteration.log"

  if ! vp check | tee "$check_log"; then
    capture_failure "vp check" "$check_log"
    return 1
  fi

  if ! vp run test | tee "$test_log"; then
    capture_failure "vp run test" "$test_log"
    return 1
  fi

  if [[ "$RUN_PACK" == true ]]; then
    if ! vp pack | tee "$pack_log"; then
      capture_failure "vp pack" "$pack_log"
      return 1
    fi
  fi

  rm -f "$CI_ERRORS_FILE"
}

commit_if_needed() {
  local iteration="$1"
  local slice="$2"

  if [[ "$NO_COMMIT" == true ]]; then
    return 0
  fi

  if git diff --quiet && git diff --cached --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    return 0
  fi

  git add -A
  git commit -m "feat(auto): ${slice} (iteration ${iteration})"
}

require_command codex
require_command jq
require_command vp
require_clean_worktree
build_schema

completed_slices=0
last_selected_slice=""
attempts_for_slice=0

iteration=1
while :; do
  if [[ -z "$TASK_OVERRIDE" && "$MAX_ITERATIONS" -gt 0 && "$completed_slices" -ge "$MAX_ITERATIONS" ]]; then
    echo "completed $completed_slices slice(s); reached max iterations: $MAX_ITERATIONS"
    exit 0
  fi

  build_prompt "$iteration"
  if ! run_agent "$iteration"; then
    exit $?
  fi
  append_progress "$iteration"

  slice="$(jq -r '.selected_slice' "$RESULT_FILE")"
  status="$(jq -r '.status' "$RESULT_FILE")"

  if [[ "$slice" == "null" || -z "$slice" ]]; then
    echo "codex exec returned no selected_slice in $RESULT_FILE" >&2
    exit 1
  fi

  if [[ "$slice" == "$last_selected_slice" ]]; then
    attempts_for_slice=$((attempts_for_slice + 1))
  else
    last_selected_slice="$slice"
    attempts_for_slice=1
  fi

  if ! run_checks "$iteration"; then
    log "verification failed for $slice; see $CI_ERRORS_FILE"
    if [[ "$attempts_for_slice" -ge "$MAX_ATTEMPTS_PER_SLICE" ]]; then
      echo "slice $slice failed verification $attempts_for_slice time(s); stopping" >&2
      exit 3
    fi

    iteration=$((iteration + 1))
    continue
  fi

  commit_if_needed "$iteration" "$slice"

  if [[ "$status" == "slice_complete" ]]; then
    completed_slices=$((completed_slices + 1))
    attempts_for_slice=0
    last_selected_slice=""

    if [[ -n "$TASK_OVERRIDE" ]]; then
      log "completed $slice"
      exit 0
    fi

    log "completed $slice ($completed_slices slice(s) done)"
    iteration=$((iteration + 1))
    continue
  fi

  if [[ "$status" == "blocked" ]]; then
    echo "blocked: $(jq -r '.summary' "$RESULT_FILE")" >&2
    exit 2
  fi

  if [[ "$attempts_for_slice" -ge "$MAX_ATTEMPTS_PER_SLICE" ]]; then
    echo "slice $slice returned continue $attempts_for_slice time(s); stopping" >&2
    exit 3
  fi

  iteration=$((iteration + 1))
done
