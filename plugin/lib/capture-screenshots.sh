#!/bin/bash
# capture-screenshots.sh — Screenshot capture dispatcher for AI-DLC
#
# Routes to the correct capture provider based on --provider flag.
# See capture-interface.md for the full input/output contract.
#
# Usage:
#   capture-screenshots.sh --provider playwright --output-dir ./screenshots --url http://localhost:3000
#   capture-screenshots.sh --provider manual --output-dir ./screenshots --input-dir ./images

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse --provider flag (default: playwright)
PROVIDER="playwright"
PASSTHROUGH_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      PROVIDER="$2"
      shift 2
      ;;
    --help)
      echo "Usage: capture-screenshots.sh [--provider <name>] [provider-args...]"
      echo ""
      echo "Options:"
      echo "  --provider <name>  Capture provider (default: playwright)"
      echo ""
      echo "Available providers:"
      for p in "$SCRIPT_DIR"/capture-*.sh; do
        pname="$(basename "$p" .sh)"
        pname="${pname#capture-}"
        # Skip the dispatcher itself
        [ "$pname" = "screenshots" ] && continue
        echo "  $pname"
      done
      echo ""
      echo "See capture-interface.md for full documentation."
      exit 0
      ;;
    *)
      PASSTHROUGH_ARGS+=("$1")
      shift
      ;;
  esac
done

# Locate provider script
PROVIDER_SCRIPT="$SCRIPT_DIR/capture-${PROVIDER}.sh"

if [ ! -f "$PROVIDER_SCRIPT" ]; then
  echo "ai-dlc: capture provider not found: $PROVIDER" >&2
  echo "ai-dlc: available providers:" >&2
  for p in "$SCRIPT_DIR"/capture-*.sh; do
    pname="$(basename "$p" .sh)"
    pname="${pname#capture-}"
    [ "$pname" = "screenshots" ] && continue
    echo "ai-dlc:   $pname" >&2
  done
  exit 2
fi

# Execute provider with passthrough arguments
exec bash "$PROVIDER_SCRIPT" "${PASSTHROUGH_ARGS[@]}"
