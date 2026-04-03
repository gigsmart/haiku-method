#!/bin/bash
# capture-manual.sh — Manual screenshot capture provider for AI-DLC
#
# Validates and copies pre-captured screenshots from an input directory
# to the output directory with correct naming convention and manifest.
#
# Usage:
#   capture-manual.sh --input-dir ./my-screenshots --output-dir ./out
#   capture-manual.sh --input-dir ./my-screenshots --output-dir ./out --breakpoints 375,768,1280

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Defaults
INPUT_DIR=""
OUTPUT_DIR=""
BREAKPOINTS="375,768,1280"
PREFIX=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --input-dir)   INPUT_DIR="$2"; shift 2 ;;
    --output-dir)  OUTPUT_DIR="$2"; shift 2 ;;
    --breakpoints) BREAKPOINTS="$2"; shift 2 ;;
    --prefix)      PREFIX="$2"; shift 2 ;;
    --help)
      echo "Usage: capture-manual.sh [options]"
      echo ""
      echo "Options:"
      echo "  --input-dir <path>     Directory containing pre-captured images (required)"
      echo "  --output-dir <path>    Directory to write screenshots and manifest (required)"
      echo "  --breakpoints <widths> Comma-separated viewport widths (default: 375,768,1280)"
      echo "  --prefix <string>      Filename prefix for screenshots"
      exit 0
      ;;
    *)
      echo "ai-dlc: capture-manual: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validate required arguments
if [ -z "$INPUT_DIR" ]; then
  echo "ai-dlc: capture-manual: --input-dir is required" >&2
  exit 1
fi

if [ -z "$OUTPUT_DIR" ]; then
  echo "ai-dlc: capture-manual: --output-dir is required" >&2
  exit 1
fi

if [ ! -d "$INPUT_DIR" ]; then
  echo "ai-dlc: capture-manual: input directory not found: $INPUT_DIR" >&2
  exit 1
fi

# Find image files in input directory
IMAGE_FILES=()
while IFS= read -r -d '' file; do
  IMAGE_FILES+=("$file")
done < <(find "$INPUT_DIR" -maxdepth 1 -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.webp" \) -print0 | sort -z)

if [ ${#IMAGE_FILES[@]} -eq 0 ]; then
  echo "ai-dlc: capture-manual: no image files found in: $INPUT_DIR" >&2
  exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Breakpoint name mapping
breakpoint_name() {
  local width="$1"
  case "$width" in
    375)  echo "mobile" ;;
    768)  echo "tablet" ;;
    1280) echo "desktop" ;;
    *)    echo "$width" ;;
  esac
}

# Parse breakpoints
IFS=',' read -ra BP_ARRAY <<< "$BREAKPOINTS"

# Copy images and build manifest entries
SCREENSHOTS_JSON="[]"
COPIED=0

for img in "${IMAGE_FILES[@]}"; do
  filename="$(basename "$img")"
  ext="${filename##*.}"
  name="${filename%.*}"

  # Try to extract breakpoint and view from filename patterns:
  #   {breakpoint-name}-{view}.png  (e.g., mobile-home.png)
  #   {width}-{view}.png            (e.g., 375-home.png)
  #   Otherwise, copy as-is and infer from order
  MATCHED=false

  for bp in "${BP_ARRAY[@]}"; do
    bp_name="$(breakpoint_name "$bp")"

    # Match pattern: {breakpoint-name}-{view}
    if [[ "$name" == ${bp_name}-* ]]; then
      view="${name#${bp_name}-}"
      out_filename="${PREFIX}${bp_name}-${view}.${ext}"
      cp "$img" "$OUTPUT_DIR/$out_filename"
      SCREENSHOTS_JSON=$(echo "$SCREENSHOTS_JSON" | jq --argjson bp "$bp" --arg view "$view" --arg path "$out_filename" \
        '. + [{"breakpoint": $bp, "view": $view, "path": $path}]')
      MATCHED=true
      COPIED=$((COPIED + 1))
      echo "  copied: $filename -> $out_filename"
      break
    fi

    # Match pattern: {width}-{view}
    if [[ "$name" == ${bp}-* ]]; then
      view="${name#${bp}-}"
      out_filename="${PREFIX}${bp_name}-${view}.${ext}"
      cp "$img" "$OUTPUT_DIR/$out_filename"
      SCREENSHOTS_JSON=$(echo "$SCREENSHOTS_JSON" | jq --argjson bp "$bp" --arg view "$view" --arg path "$out_filename" \
        '. + [{"breakpoint": $bp, "view": $view, "path": $path}]')
      MATCHED=true
      COPIED=$((COPIED + 1))
      echo "  copied: $filename -> $out_filename"
      break
    fi
  done

  # If no pattern matched, copy with original name
  if [ "$MATCHED" = "false" ]; then
    out_filename="${PREFIX}${filename}"
    cp "$img" "$OUTPUT_DIR/$out_filename"
    # Use first breakpoint as default, filename as view
    bp="${BP_ARRAY[0]}"
    SCREENSHOTS_JSON=$(echo "$SCREENSHOTS_JSON" | jq --argjson bp "$bp" --arg view "$name" --arg path "$out_filename" \
      '. + [{"breakpoint": $bp, "view": $view, "path": $path}]')
    COPIED=$((COPIED + 1))
    echo "  copied: $filename -> $out_filename (unmatched pattern)"
  fi
done

if [ "$COPIED" -eq 0 ]; then
  echo "ai-dlc: capture-manual: no images were copied" >&2
  exit 1
fi

# Parse breakpoints as JSON array
BP_JSON=$(echo "$BREAKPOINTS" | tr ',' '\n' | jq -s '.')

# Write manifest
MANIFEST=$(jq -n \
  --arg provider "manual" \
  --arg captured_at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  --argjson breakpoints "$BP_JSON" \
  --argjson screenshots "$SCREENSHOTS_JSON" \
  '{provider: $provider, captured_at: $captured_at, breakpoints: $breakpoints, screenshots: $screenshots}')

echo "$MANIFEST" > "$OUTPUT_DIR/manifest.json"
echo "  manifest: $OUTPUT_DIR/manifest.json"
echo "ai-dlc: capture-manual: copied $COPIED image(s)"
