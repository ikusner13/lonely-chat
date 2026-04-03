#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODEL="${CODEX_MODEL:-gpt-5.4}"
REASONING="${CODEX_REASONING:-high}"
SERVICE_TIER="${CODEX_SERVICE_TIER:-fast}"
AGENT_TIMEOUT_SECONDS="${CODEX_AGENT_TIMEOUT_SECONDS:-900}"
STALL_TIMEOUT_SECONDS="${CODEX_STALL_TIMEOUT_SECONDS:-300}"
MAX_ATTEMPTS_PER_SLICE="${CODEX_MAX_ATTEMPTS_PER_SLICE:-6}"
HEARTBEAT_SECONDS="${CODEX_HEARTBEAT_SECONDS:-15}"
CODEX_PREVIEW_LINES="${CODEX_PREVIEW_LINES:-6}"
SHOW_CODEX_PREVIEW="${CODEX_SHOW_PREVIEW:-true}"
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
    --stall-timeout-seconds)
      STALL_TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --max-attempts-per-slice)
      MAX_ATTEMPTS_PER_SLICE="$2"
      shift 2
      ;;
    --codex-preview-lines)
      CODEX_PREVIEW_LINES="$2"
      shift 2
      ;;
    --no-codex-preview)
      SHOW_CODEX_PREVIEW=false
      shift
      ;;
    --status)
      if [[ -f ".codex-auto/status.json" ]]; then
        cat ".codex-auto/status.json"
      else
        echo '{"phase":"idle","note":"No active codex-auto status file found."}'
      fi
      exit 0
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
  --stall-timeout-seconds Stop a Codex run after n seconds with no log growth (default: 300)
  --max-attempts-per-slice
                         Stop after n unfinished attempts on the same slice (default: 6)
  --codex-preview-lines <n>
                         Show up to n recent command output lines per Codex event (default: 6)
  --no-codex-preview     Hide live Codex JSON event filtering in the terminal
  --status                Print the current `.codex-auto/status.json` and exit
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
STATUS_FILE="$OUT_DIR/status.json"
EVENT_LOG_FILE="$OUT_DIR/events.log"
LOCKED_SLICE_FILE="$OUT_DIR/locked-slice.txt"
mkdir -p "$OUT_DIR"

LOCKED_SLICE=""
if [[ -f "$LOCKED_SLICE_FILE" ]]; then
  LOCKED_SLICE="$(<"$LOCKED_SLICE_FILE")"
fi

log() {
  local timestamp
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "[codex-auto] $*"
  echo "$timestamp $*" >> "$EVENT_LOG_FILE"
}

write_status() {
  local phase="$1"
  local iteration="$2"
  local slice="$3"
  local attempt="$4"
  local note="$5"
  local pid="${6:-}"
  local log_file="${7:-}"

  jq -n \
    --arg phase "$phase" \
    --arg iteration "$iteration" \
    --arg slice "$slice" \
    --arg attempt "$attempt" \
    --arg note "$note" \
    --arg pid "$pid" \
    --arg log_file "$log_file" \
    --arg updated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    '{
      phase: $phase,
      iteration: $iteration,
      slice: $slice,
      attempt: $attempt,
      note: $note,
      pid: ($pid | if . == "" then null else . end),
      log_file: ($log_file | if . == "" then null else . end),
      updated_at: $updated_at
    }' > "$STATUS_FILE"
}

print_prefixed_lines() {
  local prefix="$1"
  local text="$2"
  local limit="${3:-$CODEX_PREVIEW_LINES}"
  local count=0

  while IFS= read -r line; do
    if [[ -z "$line" ]]; then
      continue
    fi

    echo "$prefix $line"
    count=$((count + 1))

    if (( count >= limit )); then
      break
    fi
  done <<< "$text"
}

stream_filter() {
  local line
  local item_type
  local command
  local exit_code
  local text
  local aggregated_output
  local thread_id
  local usage

  while IFS= read -r line; do
    if [[ -z "$line" || "$SHOW_CODEX_PREVIEW" != true ]]; then
      continue
    fi

    case "$(jq -r '.type // empty' <<< "$line" 2>/dev/null)" in
      "thread.started")
        thread_id="$(jq -r '.thread_id // empty' <<< "$line" 2>/dev/null)"
        if [[ -n "$thread_id" ]]; then
          echo "[codex-auto][thread] $thread_id"
        fi
        ;;
      "turn.started")
        echo "[codex-auto][turn] started"
        ;;
      "turn.completed")
        usage="$(jq -r '"input_tokens=\(.usage.input_tokens // 0) output_tokens=\(.usage.output_tokens // 0)"' <<< "$line" 2>/dev/null)"
        echo "[codex-auto][turn] completed $usage"
        ;;
      "item.started")
        item_type="$(jq -r '.item.type // empty' <<< "$line" 2>/dev/null)"
        if [[ "$item_type" == "command_execution" ]]; then
          command="$(jq -r '.item.command // empty' <<< "$line" 2>/dev/null)"
          echo "[codex-auto][cmd] $command"
        fi
        ;;
      "item.completed")
        item_type="$(jq -r '.item.type // empty' <<< "$line" 2>/dev/null)"

        case "$item_type" in
          "agent_message")
            text="$(jq -r '.item.text // empty' <<< "$line" 2>/dev/null)"
            if [[ -n "$text" ]]; then
              print_prefixed_lines "[codex-auto][agent]" "$text" 20
            fi
            ;;
          "command_execution")
            command="$(jq -r '.item.command // empty' <<< "$line" 2>/dev/null)"
            exit_code="$(jq -r '.item.exit_code // empty' <<< "$line" 2>/dev/null)"
            echo "[codex-auto][cmd] exit=$exit_code $command"
            aggregated_output="$(jq -r '.item.aggregated_output // empty' <<< "$line" 2>/dev/null)"
            if [[ -n "$aggregated_output" ]]; then
              print_prefixed_lines "[codex-auto][cmd-out]" "$aggregated_output"
            fi
            ;;
        esac
        ;;
    esac
  done
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
  elif [[ -n "$LOCKED_SLICE" ]]; then
    cat >> "$PROMPT_FILE" <<EOF

Implement \`$LOCKED_SLICE\` instead of auto-selecting. This slice is locked because a prior attempt did not finish outer verification.
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

Stay on this same slice inside this Codex invocation and try to self-repair when your slice-specific targeted verification fails.
Run only the slice-specific targeted verification you need for this slice.
Do not run `vp check`; the outer loop runs it after you exit.
If a targeted check fails, inspect the failure, edit the code, and re-run the targeted verification until it passes or you are genuinely blocked.
Return `"status": "slice_complete"` only when the slice-specific targeted verification passes and the task checkbox is updated.
Return `"status": "blocked"` only when you cannot safely continue without human input.
Return `"status": "continue"` only if you made a serious repair attempt but are handing control back because you are at risk of getting stuck or the remaining work is not safe to continue autonomously.
Do not stop after the first failed targeted verification.

Return only JSON matching the supplied schema.
Set "status" to "slice_complete" only if one slice is fully verified and its checkbox is updated.
Set "status" to "continue" if the loop should run again.
Set "status" to "blocked" if human input is required.
EOF
}

run_agent() {
  local iteration="$1"
  local agent_log_file="$OUT_DIR/codex.$iteration.log"
  local agent_stderr_file="$OUT_DIR/codex.$iteration.stderr.log"
  local agent_fifo="$OUT_DIR/codex.$iteration.fifo"

  rm -f "$RESULT_FILE" "$AGENT_TIMEOUT_FILE" "$agent_log_file" "$agent_stderr_file" "$agent_fifo"
  mkfifo "$agent_fifo"
  log "starting Codex iteration $iteration; raw log: $agent_log_file"
  write_status "running_codex" "$iteration" "" "" "Starting Codex agent run." "" "$agent_log_file"

  cat "$agent_fifo" | tee "$agent_log_file" | stream_filter &
  local stream_pid="$!"

  codex exec \
    --dangerously-bypass-approvals-and-sandbox \
    --json \
    --model "$MODEL" \
    -c "model_reasoning_effort=\"$REASONING\"" \
    -c "service_tier=\"$SERVICE_TIER\"" \
    --cd "$ROOT" \
    --output-schema "$SCHEMA_FILE" \
    --output-last-message "$RESULT_FILE" \
    - < "$PROMPT_FILE" >"$agent_fifo" 2>"$agent_stderr_file" &
  local agent_pid="$!"
  write_status "running_codex" "$iteration" "" "" "Codex agent is running." "$agent_pid" "$agent_log_file"

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
  (
    local previous_size=0
    local stalled_seconds=0
    local current_stdout_size=0
    local current_stderr_size=0
    local current_size=0
    local delta=0

    while kill -0 "$agent_pid" >/dev/null 2>&1; do
      sleep "$HEARTBEAT_SECONDS"

      if ! kill -0 "$agent_pid" >/dev/null 2>&1; then
        break
      fi

      if [[ -f "$agent_log_file" ]]; then
        current_stdout_size="$(wc -c < "$agent_log_file" | tr -d ' ')"
      else
        current_stdout_size=0
      fi

      if [[ -f "$agent_stderr_file" ]]; then
        current_stderr_size="$(wc -c < "$agent_stderr_file" | tr -d ' ')"
      else
        current_stderr_size=0
      fi

      current_size=$((current_stdout_size + current_stderr_size))
      delta=$((current_size - previous_size))
      previous_size="$current_size"
      if (( delta > 0 )); then
        stalled_seconds=0
      else
        stalled_seconds=$((stalled_seconds + HEARTBEAT_SECONDS))
      fi
      log "Codex iteration $iteration still running; pid=$agent_pid stdout_bytes=$current_stdout_size stderr_bytes=$current_stderr_size delta_bytes=$delta raw_log=$agent_log_file"
      if (( stalled_seconds >= STALL_TIMEOUT_SECONDS )); then
        if [[ ! -f "$AGENT_TIMEOUT_FILE" ]]; then
          cat > "$AGENT_TIMEOUT_FILE" <<EOF
Codex produced no new log output for ${stalled_seconds} seconds.
The process was terminated to avoid getting stuck in an internal loop or hung tool call.
EOF
        fi
        log "Codex iteration $iteration stalled for ${stalled_seconds}s; terminating pid=$agent_pid"
        kill -TERM "$agent_pid" >/dev/null 2>&1 || true
        sleep 5

        if kill -0 "$agent_pid" >/dev/null 2>&1; then
          kill -KILL "$agent_pid" >/dev/null 2>&1 || true
        fi
        break
      fi
      write_status \
        "running_codex" \
        "$iteration" \
        "" \
        "" \
        "Codex is still running; log_bytes=$current_size delta_bytes=$delta." \
        "$agent_pid" \
        "$agent_log_file"
    done
  ) &
  local heartbeat_pid="$!"
  local agent_status=0

  if wait "$agent_pid"; then
    agent_status=0
  else
    agent_status="$?"
  fi

  kill "$watchdog_pid" >/dev/null 2>&1 || true
  wait "$watchdog_pid" >/dev/null 2>&1 || true
  kill "$heartbeat_pid" >/dev/null 2>&1 || true
  wait "$heartbeat_pid" >/dev/null 2>&1 || true
  wait "$stream_pid" >/dev/null 2>&1 || true
  rm -f "$agent_fifo"

  if [[ -f "$AGENT_TIMEOUT_FILE" ]]; then
    echo "codex exec timed out after ${AGENT_TIMEOUT_SECONDS}s or stalled for ${STALL_TIMEOUT_SECONDS}s; see $AGENT_TIMEOUT_FILE, $agent_log_file, and $agent_stderr_file" >&2
    write_status "timed_out" "$iteration" "" "" "Codex timed out." "$agent_pid" "$agent_log_file"
    return 124
  fi

  if [[ ! -f "$RESULT_FILE" ]]; then
    echo "codex exec exited without writing $RESULT_FILE; see $agent_log_file and $agent_stderr_file" >&2
    write_status "agent_failed" "$iteration" "" "" "Codex exited without a structured result." "$agent_pid" "$agent_log_file"
    return 1
  fi

  log "finished Codex iteration $iteration"
  write_status "agent_finished" "$iteration" "" "" "Codex returned a structured result." "" "$agent_log_file"
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

  log "running vp check; log: $check_log"
  if ! vp check >"$check_log" 2>&1; then
    capture_failure "vp check" "$check_log"
    tail -n 120 "$check_log"
    return 1
  fi
  log "vp check passed"

  log "running vp run test; log: $test_log"
  if ! vp run test >"$test_log" 2>&1; then
    capture_failure "vp run test" "$test_log"
    tail -n 120 "$test_log"
    return 1
  fi
  log "vp run test passed"

  if [[ "$RUN_PACK" == true ]]; then
    log "running vp pack; log: $pack_log"
    if ! vp pack >"$pack_log" 2>&1; then
      capture_failure "vp pack" "$pack_log"
      tail -n 120 "$pack_log"
      return 1
    fi
    log "vp pack passed"
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
write_status "idle" "0" "" "" "codex-auto initialized." "" ""

iteration=1
while :; do
  if [[ -z "$TASK_OVERRIDE" && "$MAX_ITERATIONS" -gt 0 && "$completed_slices" -ge "$MAX_ITERATIONS" ]]; then
    echo "completed $completed_slices slice(s); reached max iterations: $MAX_ITERATIONS"
    write_status "completed" "$iteration" "" "" "Reached the requested completed-slice limit." "" ""
    exit 0
  fi

  build_prompt "$iteration"
  if run_agent "$iteration"; then
    :
  else
    agent_exit="$?"
    exit "$agent_exit"
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
  write_status \
    "verifying" \
    "$iteration" \
    "$slice" \
    "$attempts_for_slice" \
    "Running outer verification for the selected slice." \
    "" \
    ""

  if ! run_checks "$iteration"; then
    printf '%s\n' "$slice" > "$LOCKED_SLICE_FILE"
    LOCKED_SLICE="$slice"
    log "verification failed for $slice; see $CI_ERRORS_FILE"
    write_status \
      "verification_failed" \
      "$iteration" \
      "$slice" \
      "$attempts_for_slice" \
      "Outer verification failed; see ci-errors and per-command logs." \
      "" \
      ""
    if [[ "$attempts_for_slice" -ge "$MAX_ATTEMPTS_PER_SLICE" ]]; then
      echo "slice $slice failed verification $attempts_for_slice time(s); stopping" >&2
      write_status \
        "stopped" \
        "$iteration" \
        "$slice" \
        "$attempts_for_slice" \
        "Stopped after reaching the per-slice verification failure limit." \
        "" \
        ""
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
    LOCKED_SLICE=""
    rm -f "$LOCKED_SLICE_FILE"

    if [[ -n "$TASK_OVERRIDE" ]]; then
      log "completed $slice"
      write_status "completed" "$iteration" "$slice" "$attempts_for_slice" "Completed the requested slice." "" ""
      exit 0
    fi

    log "completed $slice ($completed_slices slice(s) done)"
    write_status \
      "completed" \
      "$iteration" \
      "$slice" \
      "$attempts_for_slice" \
      "Completed slice $completed_slices of ${MAX_ITERATIONS:-0} requested." \
      "" \
      ""
    iteration=$((iteration + 1))
    continue
  fi

  if [[ "$status" == "blocked" ]]; then
    printf '%s\n' "$slice" > "$LOCKED_SLICE_FILE"
    LOCKED_SLICE="$slice"
    echo "blocked: $(jq -r '.summary' "$RESULT_FILE")" >&2
    write_status "blocked" "$iteration" "$slice" "$attempts_for_slice" "Codex reported a blocker." "" ""
    exit 2
  fi

  printf '%s\n' "$slice" > "$LOCKED_SLICE_FILE"
  LOCKED_SLICE="$slice"
  if [[ "$attempts_for_slice" -ge "$MAX_ATTEMPTS_PER_SLICE" ]]; then
    echo "slice $slice returned continue $attempts_for_slice time(s); stopping" >&2
    write_status \
      "stopped" \
      "$iteration" \
      "$slice" \
      "$attempts_for_slice" \
      "Stopped after reaching the per-slice continue limit." \
      "" \
      ""
    exit 3
  fi

  iteration=$((iteration + 1))
done
