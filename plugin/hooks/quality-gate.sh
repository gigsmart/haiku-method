#!/bin/bash
# quality-gate.sh - Stop/SubagentStop hook for AI-DLC quality gates
#
# Reads quality_gates from intent.md and current unit frontmatter,
# runs each gate command, and blocks the agent from stopping if any fail.
# Gates are only enforced for building hats (builder, implementer, refactorer).

set -e

# Source foundation libraries
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
source "${PLUGIN_ROOT}/lib/parse.sh"
source "${PLUGIN_ROOT}/lib/state.sh"

# Read stdin payload
INPUT=$(cat)

# Early exit: deps
dlc_check_deps || exit 0

# Early exit: stop_hook_active guard
#
# When a Stop hook blocks the agent, the harness retries with stop_hook_active=true.
# This guard exits 0 on retry — which means ALL quality gates are bypassed on the
# second stop attempt. This is by design: without it, nested subagents would loop
# forever. The implication is that enforcement is one-attempt-only per stop: if the
# builder triggers a second stop in the same session, all gates are skipped. The
# reviewer's ratchet check (step 6) is the complementary enforcement for that gap.
STOP_HOOK_ACTIVE=$(echo "$INPUT" | dlc_json_get "stop_hook_active")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Early exit: no active intent
INTENT_DIR=$(dlc_find_active_intent)
if [ -z "$INTENT_DIR" ]; then
  exit 0
fi

# Early exit: no iteration state
ITERATION_JSON=$(dlc_state_load "$INTENT_DIR" "iteration.json")
if [ -z "$ITERATION_JSON" ]; then
  exit 0
fi

# Validate JSON
if ! echo "$ITERATION_JSON" | dlc_json_validate; then
  exit 0
fi

# Extract iteration fields
HAT=$(echo "$ITERATION_JSON" | dlc_json_get "hat")
STATUS=$(echo "$ITERATION_JSON" | dlc_json_get "status")
CURRENT_UNIT=$(echo "$ITERATION_JSON" | dlc_json_get "currentUnit")

# Early exit: non-building hat
case "$HAT" in
  builder|implementer|refactorer) ;;
  *) exit 0 ;;
esac

# Early exit: completed or blocked status.
# "completed" means the unit is done — no need to enforce gates post-completion.
# "blocked" means the builder hit an escalation blocker and cannot proceed; enforcing
# gates would trap the agent on stop when the unit is intentionally stalled. Gates are
# re-enforced once the unit transitions out of blocked and the builder resumes work.
case "$STATUS" in
  completed|blocked) exit 0 ;;
esac

# Resolve timeout command (macOS compatibility)
TIMEOUT_CMD=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_CMD="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_CMD="gtimeout"
fi

# Load quality gates from a markdown file's frontmatter
# Outputs JSON array of {name, command} objects
load_gates() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "[]"
    return
  fi
  local gates
  gates=$(yq --front-matter=extract -o json '.quality_gates // []' "$file" 2>/dev/null || echo "[]")
  # Ensure we got a valid JSON array
  if ! echo "$gates" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "[]"
    return
  fi
  echo "$gates"
}

# Load intent-level gates
INTENT_GATES=$(load_gates "${INTENT_DIR}/intent.md")

# Load unit-level gates
UNIT_GATES="[]"
if [ -n "$CURRENT_UNIT" ]; then
  UNIT_FILE="${INTENT_DIR}/${CURRENT_UNIT}.md"
  UNIT_GATES=$(load_gates "$UNIT_FILE")
fi

# Merge gates additively.
# jq -s slurps multiple top-level JSON values from stdin as separate inputs —
# INTENT_GATES and UNIT_GATES are two complete JSON arrays, newline-separated.
# jq -s wraps them in an outer array (.[0] and .[1]), then + concatenates them.
# The newline separator is intentional; it is NOT string concatenation.
ALL_GATES=$(jq -s '.[0] + .[1]' <<< "${INTENT_GATES}
${UNIT_GATES}")

GATE_COUNT=$(echo "$ALL_GATES" | jq 'length')
if [ "$GATE_COUNT" -eq 0 ]; then
  exit 0
fi

# Determine repo root for running gate commands
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Run each gate and collect results
#
# Note: gate names are NOT deduplicated — if intent.md and a unit both define a
# gate with the same name (e.g., "tests"), both run. This is intentional: the
# additive merge guarantees no gate is silently dropped. Duplicate names may
# appear in failure output; this is expected and not a bug.
FAILURES="[]"
ALL_PASSED=true

for i in $(seq 0 $((GATE_COUNT - 1))); do
  GATE_NAME=$(echo "$ALL_GATES" | jq -r ".[$i].name // \"gate-$i\"")
  GATE_CMD=$(echo "$ALL_GATES" | jq -r ".[$i].command // empty")

  if [ -z "$GATE_CMD" ]; then
    continue
  fi

  # Run gate command with timeout
  GATE_OUTPUT=""
  GATE_EXIT=0
  if [ -n "$TIMEOUT_CMD" ]; then
    # Pass REPO_ROOT as a positional arg to avoid single-quote injection if the
    # repo path contains a single quote (e.g. /home/user/it's-a-project/).
    GATE_OUTPUT=$($TIMEOUT_CMD 30 bash -c 'cd "$1" && eval "$2"' _ "$REPO_ROOT" "$GATE_CMD" 2>&1) || GATE_EXIT=$?
  else
    # No timeout command available — use background process with kill.
    # Register a trap to clean up both the gate process and the timer subshell
    # if the hook itself is killed (e.g. by CC's 120s hook timeout). Without this
    # trap, the timer subshell ( sleep 30 && kill ... ) becomes an orphan and
    # self-terminates only after the sleep expires — harmless but untidy.
    tmp_out=$(mktemp)
    bg_pid=""
    timer_pid=""
    _gate_cleanup() { kill "$bg_pid" "$timer_pid" 2>/dev/null || true; rm -f "$tmp_out"; }
    trap _gate_cleanup EXIT INT TERM HUP
    bash -c 'cd "$1" && eval "$2"' _ "$REPO_ROOT" "$GATE_CMD" > "$tmp_out" 2>&1 &
    bg_pid=$!
    ( sleep 30 && kill "$bg_pid" 2>/dev/null ) &
    timer_pid=$!
    wait "$bg_pid" 2>/dev/null || GATE_EXIT=$?
    kill "$timer_pid" 2>/dev/null || true
    wait "$timer_pid" 2>/dev/null || true
    trap - EXIT INT TERM HUP  # Remove gate-scoped trap after clean completion
    GATE_OUTPUT=$(cat "$tmp_out")
    rm -f "$tmp_out"
  fi

  # Defensive guard: ensure GATE_EXIT is numeric. Under set -e, if GATE_EXIT is
  # empty (e.g. wait returned a signal-related code on some platforms), the jq
  # tonumber call below would fail and set -e would exit 0 — silently allowing
  # the agent to stop despite a gate failure. Default to 1 if unset or empty.
  GATE_EXIT=${GATE_EXIT:-1}

  if [ "$GATE_EXIT" -ne 0 ]; then
    ALL_PASSED=false
    # Truncate output to 500 characters.
    # Bash string slicing (${var:0:N}) counts Unicode characters, not bytes —
    # safe for multibyte UTF-8 output where head -c 500 would split a char boundary.
    TRUNCATED_OUTPUT="${GATE_OUTPUT:0:500}"
    FAILURES=$(echo "$FAILURES" | jq \
      --arg name "$GATE_NAME" \
      --arg cmd "$GATE_CMD" \
      --arg exit_code "$GATE_EXIT" \
      --arg output "$TRUNCATED_OUTPUT" \
      '. + [{"name": $name, "command": $cmd, "exit_code": ($exit_code | tonumber), "output": $output}]')
  fi
done

# All passed — allow stop
if [ "$ALL_PASSED" = "true" ]; then
  exit 0
fi

# Build failure reason string
REASON="Quality gate(s) failed:"
FAILURE_COUNT=$(echo "$FAILURES" | jq 'length')
for i in $(seq 0 $((FAILURE_COUNT - 1))); do
  F_NAME=$(echo "$FAILURES" | jq -r ".[$i].name")
  F_CMD=$(echo "$FAILURES" | jq -r ".[$i].command")
  F_EXIT=$(echo "$FAILURES" | jq -r ".[$i].exit_code")
  F_OUTPUT=$(echo "$FAILURES" | jq -r ".[$i].output")
  REASON="${REASON}
- ${F_NAME}: command '${F_CMD}' exited ${F_EXIT}"
  if [ -n "$F_OUTPUT" ]; then
    REASON="${REASON}, output: ${F_OUTPUT}"
  fi
done

# Output blocking JSON
# Per CC spec: exit 0 + JSON body = structured block. Explicit exit 0 ensures
# the correct exit code even if jq changes behavior in future versions.
jq -n --arg reason "$REASON" '{"decision": "block", "reason": $reason}'
exit 0
