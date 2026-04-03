#!/bin/bash
# capture-playwright.sh — Playwright screenshot capture provider for AI-DLC
#
# Captures screenshots using headless Chromium via Playwright.
# Supports both URL mode (live server) and static HTML mode (file://).
#
# Usage:
#   capture-playwright.sh --url http://localhost:3000 --routes /,/about --output-dir ./out
#   capture-playwright.sh --static ./mockup.html --output-dir ./out

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
URL=""
STATIC=""
ROUTES="/"
OUTPUT_DIR=""
BREAKPOINTS="375,768,1280"
PREFIX=""
WAIT_FOR=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)        URL="$2"; shift 2 ;;
    --static)     STATIC="$2"; shift 2 ;;
    --routes)     ROUTES="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --breakpoints) BREAKPOINTS="$2"; shift 2 ;;
    --prefix)     PREFIX="$2"; shift 2 ;;
    --wait-for)   WAIT_FOR="$2"; shift 2 ;;
    --help)
      echo "Usage: capture-playwright.sh [options]"
      echo ""
      echo "Options:"
      echo "  --url <base-url>       Base URL to capture (mutually exclusive with --static)"
      echo "  --static <path>        Local HTML file to capture via file:// protocol"
      echo "  --routes <spec>        Comma-separated routes to capture (default: /)"
      echo "  --output-dir <path>    Directory to write screenshots and manifest"
      echo "  --breakpoints <widths> Comma-separated viewport widths (default: 375,768,1280)"
      echo "  --prefix <string>      Filename prefix for screenshots"
      echo "  --wait-for <selector>  CSS selector to wait for before capture"
      exit 0
      ;;
    *)
      echo "ai-dlc: capture-playwright: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate: either --url or --static must be provided
if [ -z "$URL" ] && [ -z "$STATIC" ]; then
  echo "ai-dlc: capture-playwright: either --url or --static must be provided" >&2
  exit 1
fi

if [ -n "$URL" ] && [ -n "$STATIC" ]; then
  echo "ai-dlc: capture-playwright: --url and --static are mutually exclusive" >&2
  exit 1
fi

# Validate --output-dir
if [ -z "$OUTPUT_DIR" ]; then
  echo "ai-dlc: capture-playwright: --output-dir is required" >&2
  exit 1
fi

# Validate --static file exists
if [ -n "$STATIC" ] && [ ! -f "$STATIC" ]; then
  echo "ai-dlc: capture-playwright: static file not found: $STATIC" >&2
  exit 1
fi

# Check Node.js availability
if ! command -v node >/dev/null 2>&1; then
  echo "ai-dlc: capture-playwright: node is required but not found in PATH" >&2
  exit 3
fi

# Check Playwright availability
if ! node -e "require('playwright')" 2>/dev/null; then
  echo "ai-dlc: capture-playwright: playwright is not installed" >&2
  echo "ai-dlc: install with: npm install playwright" >&2
  exit 3
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Resolve static path to absolute
if [ -n "$STATIC" ]; then
  STATIC="$(cd "$(dirname "$STATIC")" && pwd)/$(basename "$STATIC")"
fi

# Build args JSON for the worker
ARGS_JSON=$(node -e "
  console.log(JSON.stringify({
    url: process.argv[1] || null,
    static: process.argv[2] || null,
    routes: process.argv[3],
    outputDir: process.argv[4],
    breakpoints: process.argv[5],
    prefix: process.argv[6] || '',
    waitFor: process.argv[7] || null
  }));
" "$URL" "$STATIC" "$ROUTES" "$OUTPUT_DIR" "$BREAKPOINTS" "$PREFIX" "$WAIT_FOR")

# Invoke the worker
node "$SCRIPT_DIR/capture-playwright-worker.js" "$ARGS_JSON"
exit $?
