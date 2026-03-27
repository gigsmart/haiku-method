#!/bin/bash
# context-monitor.sh — Warn at context budget thresholds
#
# Fires on PostToolUse. Checks remaining context capacity and
# injects warnings at 35% and 25% remaining.
#
# Uses debouncing to avoid spamming: only warns once per threshold
# per session (tracked via temp file).

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract conversation stats if available
# Claude Code provides token usage in the hook payload
TOTAL_TOKENS=$(echo "$INPUT" | han parse json total_tokens -r --default "0" 2>/dev/null || echo "0")
MAX_TOKENS=$(echo "$INPUT" | han parse json max_tokens -r --default "200000" 2>/dev/null || echo "200000")

# Skip if we can't determine usage
[ "$TOTAL_TOKENS" = "0" ] && exit 0

# Calculate remaining percentage
REMAINING=$(( (MAX_TOKENS - TOTAL_TOKENS) * 100 / MAX_TOKENS ))

# Debounce file
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
DEBOUNCE_FILE="/tmp/context-monitor-${SESSION_ID}"

# Check thresholds
if [ "$REMAINING" -le 25 ]; then
  if ! grep -q "25" "$DEBOUNCE_FILE" 2>/dev/null; then
    echo "25" >> "$DEBOUNCE_FILE"
    cat >&2 <<'WARN'
⚠️ CONTEXT CRITICAL (≤25% remaining)

**You MUST:**
1. Commit all working changes NOW
2. Save state to `han keep`
3. Complete current task or signal handoff
4. Do NOT start new tasks

Quality degrades severely at low context. Wrap up.
WARN
    exit 2
  fi
elif [ "$REMAINING" -le 35 ]; then
  if ! grep -q "35" "$DEBOUNCE_FILE" 2>/dev/null; then
    echo "35" >> "$DEBOUNCE_FILE"
    cat >&2 <<'WARN'
⚠️ CONTEXT WARNING (≤35% remaining)

**Recommended:**
- Finish current task, avoid starting new ones
- Commit working changes frequently
- Consider saving state for session handoff
- Keep responses concise
WARN
    exit 2
  fi
fi
