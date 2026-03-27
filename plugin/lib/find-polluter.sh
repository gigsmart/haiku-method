#!/bin/bash
# find-polluter.sh — Binary search to find which test pollutes state
# Usage: find-polluter.sh <failing-test> [test-command]
#
# When a test passes in isolation but fails when run with the full suite,
# another test is polluting shared state. This script bisects the test
# list to find the polluter in O(log n) runs.

set -euo pipefail

# --- Arguments ----------------------------------------------------------------

FAILING_TEST="${1:?Usage: find-polluter.sh <failing-test> [test-command]}"
TEST_CMD="${2:-npm test}"

# --- Helpers ------------------------------------------------------------------

log()  { printf '\033[1;34m[find-polluter]\033[0m %s\n' "$*" >&2; }
pass() { printf '\033[1;32m[PASS]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; }

# Run the failing test after a given set of candidate tests.
# Returns 0 when the failing test *fails* (pollution detected).
run_with_candidates() {
  local candidates_file="$1"
  local tmp_suite
  tmp_suite=$(mktemp)

  # Build a suite: candidates first, then the failing test
  cat "$candidates_file" > "$tmp_suite"
  echo "$FAILING_TEST" >> "$tmp_suite"

  log "Running failing test after $(wc -l < "$candidates_file" | tr -d ' ') candidate(s)…"

  # Try jest-style --testPathPattern first; fall back to passing file list
  if echo "$TEST_CMD" | grep -qiE 'jest|vitest'; then
    local pattern
    pattern=$(paste -sd '|' "$tmp_suite")
    if $TEST_CMD --testPathPattern "$pattern" --no-coverage 2>/dev/null; then
      rm -f "$tmp_suite"
      return 1  # test passed — no pollution in this subset
    else
      rm -f "$tmp_suite"
      return 0  # test failed — polluter is in this subset
    fi
  else
    # Generic: run test command with file list appended
    # shellcheck disable=SC2086
    if $TEST_CMD $(cat "$tmp_suite" | tr '\n' ' ') 2>/dev/null; then
      rm -f "$tmp_suite"
      return 1
      else
      rm -f "$tmp_suite"
      return 0
    fi
  fi
}

# --- Gather test list ---------------------------------------------------------

log "Gathering test list…"

TESTS_FILE=$(mktemp)

if echo "$TEST_CMD" | grep -qiE 'jest|vitest'; then
  $TEST_CMD --listTests 2>/dev/null | grep -v "^$" | sort > "$TESTS_FILE"
else
  find . -name "*.test.*" -o -name "*.spec.*" | sort > "$TESTS_FILE"
fi

# Remove the failing test itself from the candidate list
CANDIDATES_FILE=$(mktemp)
grep -vF "$FAILING_TEST" "$TESTS_FILE" > "$CANDIDATES_FILE" || true
rm -f "$TESTS_FILE"

TOTAL=$(wc -l < "$CANDIDATES_FILE" | tr -d ' ')
log "Found $TOTAL candidate tests (excluding the failing test)."

if [ "$TOTAL" -eq 0 ]; then
  log "No candidate tests found. Nothing to bisect."
  rm -f "$CANDIDATES_FILE"
  exit 1
fi

# --- Confirm pollution exists -------------------------------------------------

log "Verifying the failing test actually fails with the full suite…"
if ! run_with_candidates "$CANDIDATES_FILE"; then
  pass "Test passes even with the full suite — no pollution detected."
  rm -f "$CANDIDATES_FILE"
  exit 0
fi
fail "Confirmed: test fails with the full suite. Starting bisection."

# --- Binary search ------------------------------------------------------------

bisect() {
  local candidates_file="$1"
  local count
  count=$(wc -l < "$candidates_file" | tr -d ' ')

  if [ "$count" -eq 1 ]; then
    echo "$(cat "$candidates_file")"
    return
  fi

  local mid=$(( count / 2 ))
  local first_half
  local second_half
  first_half=$(mktemp)
  second_half=$(mktemp)

  head -n "$mid" "$candidates_file" > "$first_half"
  tail -n +"$(( mid + 1 ))" "$candidates_file" > "$second_half"

  log "Bisecting: testing first half ($mid tests)…"
  if run_with_candidates "$first_half"; then
    fail "Polluter is in the first half."
    rm -f "$second_half"
    bisect "$first_half"
    rm -f "$first_half"
  else
    pass "First half is clean. Polluter is in the second half."
    rm -f "$first_half"
    bisect "$second_half"
    rm -f "$second_half"
  fi
}

POLLUTER=$(bisect "$CANDIDATES_FILE")
rm -f "$CANDIDATES_FILE"

echo ""
printf '\033[1;33m>>> Polluting test found: %s\033[0m\n' "$POLLUTER"
echo "$POLLUTER"
