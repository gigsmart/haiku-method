#!/bin/bash
# design-blueprint.sh — Design blueprint generation for AI-DLC
#
# Reads archetype data from plugin/data/archetypes.json, applies parameter
# adjustments via linear interpolation, and writes a design-blueprint.md
# file with YAML frontmatter and full body.
#
# Usage:
#   source design-blueprint.sh
#   dlc_generate_design_blueprint "my-intent" "brutalist" '{"density":60,"expressiveness":80,"shape_language":10,"color_mood":30}'

# Guard against double-sourcing
if [ -n "${_DLC_DESIGN_BLUEPRINT_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_DESIGN_BLUEPRINT_SOURCED=1

# Source foundation libraries
BLUEPRINT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck source=deps.sh
source "$BLUEPRINT_SCRIPT_DIR/deps.sh"
# shellcheck source=parse.sh
source "$BLUEPRINT_SCRIPT_DIR/parse.sh"

# Validate jq dependency (required for archetype JSON processing)
dlc_require_jq || return 1

# Resolve path to archetypes.json relative to this script
_DLC_ARCHETYPES_JSON="${BLUEPRINT_SCRIPT_DIR}/../data/archetypes.json"

# Linear interpolation: map a 0-100 parameter value to a target range
# Usage: _lerp <value_0_100> <min_output> <max_output>
# Returns: integer result
_lerp() {
  local val="$1" out_min="$2" out_max="$3"
  awk -v v="$val" -v lo="$out_min" -v hi="$out_max" \
    'BEGIN { printf "%d", lo + (hi - lo) * (v / 100) }'
}

# Linear interpolation returning one decimal place
# Usage: _lerp_float <value_0_100> <min_output> <max_output>
# Returns: float with 1 decimal
_lerp_float() {
  local val="$1" out_min="$2" out_max="$3"
  awk -v v="$val" -v lo="$out_min" -v hi="$out_max" \
    'BEGIN { printf "%.1f", lo + (hi - lo) * (v / 100) }'
}

# Clamp a value between min and max
# Usage: _clamp <value> <min> <max>
_clamp() {
  local val="$1" cmin="$2" cmax="$3"
  awk -v v="$val" -v lo="$cmin" -v hi="$cmax" \
    'BEGIN { if (v < lo) print lo; else if (v > hi) print hi; else print v }'
}

# Shift a hex color warmer or cooler
# Usage: _shift_color_mood <hex_color> <mood_0_100>
# At 0: desaturate (shift toward gray)
# At 50: no change
# At 100: warm shift (boost red, reduce blue)
_shift_color_mood() {
  local hex="$1" mood="$2"

  # Pass through non-hex values (transparent, inherit, etc.)
  if [[ "$hex" != \#* ]]; then
    echo "$hex"
    return
  fi

  # Strip # prefix
  hex="${hex#\#}"

  # Parse RGB components
  local r g b
  r=$(printf "%d" "0x${hex:0:2}" 2>/dev/null || echo "128")
  g=$(printf "%d" "0x${hex:2:2}" 2>/dev/null || echo "128")
  b=$(printf "%d" "0x${hex:4:2}" 2>/dev/null || echo "128")

  awk -v r="$r" -v g="$g" -v b="$b" -v mood="$mood" '
  BEGIN {
    if (mood < 50) {
      # Desaturate: blend toward gray
      factor = mood / 50
      gray = (r * 0.299 + g * 0.587 + b * 0.114)
      r = int(gray + (r - gray) * factor + 0.5)
      g = int(gray + (g - gray) * factor + 0.5)
      b = int(gray + (b - gray) * factor + 0.5)
    } else if (mood > 50) {
      # Warm shift: boost red channel, reduce blue
      shift = (mood - 50) / 50
      r = int(r + (255 - r) * shift * 0.15 + 0.5)
      b = int(b - b * shift * 0.1 + 0.5)
    }
    # Clamp
    if (r < 0) r = 0; if (r > 255) r = 255
    if (g < 0) g = 0; if (g > 255) g = 255
    if (b < 0) b = 0; if (b > 255) b = 255
    printf "#%02x%02x%02x\n", r, g, b
  }'
}

# Generate expressiveness guidelines modifier text
# Usage: _expressiveness_modifier <value_0_100>
_expressiveness_modifier() {
  local val="$1"
  if [ "$val" -le 20 ]; then
    echo "Strictly minimal — no decorative elements, animations, or visual flourishes. Every element must serve a direct functional purpose."
  elif [ "$val" -le 40 ]; then
    echo "Restrained — subtle hover states and transitions are acceptable, but avoid decorative gradients, shadows, or non-functional visual elements."
  elif [ "$val" -le 60 ]; then
    echo "Balanced — moderate use of shadows, transitions, and visual hierarchy aids. Decorative elements should reinforce meaning, not distract."
  elif [ "$val" -le 80 ]; then
    echo "Expressive — use gradients, shadows, animations, and visual flourishes to create personality. Bold color choices and dynamic hover states encouraged."
  else
    echo "Maximally expressive — embrace bold gradients, playful animations, decorative accents, and strong visual personality. Delight and surprise the user."
  fi
}

# Write knowledge file for design decisions
# Usage: _dlc_blueprint_write_knowledge <intent_dir> <knowledge_key> <content>
# Writes to .ai-dlc/{intent-slug}/knowledge/{key}.md
_dlc_blueprint_write_knowledge() {
  local intent_dir="$1"
  local key="$2"
  local content="$3"
  local knowledge_dir="${intent_dir}/knowledge"

  mkdir -p "$knowledge_dir" 2>/dev/null || {
    echo "ai-dlc: _dlc_blueprint_write_knowledge: cannot create knowledge directory: $knowledge_dir" >&2
    return 1
  }

  local filepath="${knowledge_dir}/${key}.md"
  local tmp="${filepath}.tmp.$$"
  printf '%s' "$content" > "$tmp" && mv "$tmp" "$filepath"
}

# Generate a design blueprint from archetype and parameters
#
# Usage: dlc_generate_design_blueprint <intent_slug> <archetype_id> <parameters_json>
#
# Parameters JSON shape: {"density": 60, "expressiveness": 80, "shape_language": 10, "color_mood": 30}
#
# Writes:
#   .ai-dlc/{intent_slug}/design-blueprint.md — full blueprint
#   .ai-dlc/{intent_slug}/knowledge/design.md — knowledge seed
dlc_generate_design_blueprint() {
  local intent_slug="$1"
  local archetype_id="$2"
  local params_json="$3"

  # Validate inputs
  if [ -z "$intent_slug" ] || [ -z "$archetype_id" ] || [ -z "$params_json" ]; then
    echo "ai-dlc: dlc_generate_design_blueprint: usage: dlc_generate_design_blueprint <intent_slug> <archetype_id> <parameters_json>" >&2
    return 1
  fi

  # Check archetypes data file exists
  if [ ! -f "$_DLC_ARCHETYPES_JSON" ]; then
    echo "ai-dlc: dlc_generate_design_blueprint: archetypes.json not found at $_DLC_ARCHETYPES_JSON" >&2
    return 1
  fi

  # Validate archetype exists
  local archetype
  archetype=$(jq -r --arg id "$archetype_id" '.archetypes[] | select(.id == $id)' "$_DLC_ARCHETYPES_JSON" 2>/dev/null)
  if [ -z "$archetype" ] || [ "$archetype" = "null" ]; then
    echo "ai-dlc: dlc_generate_design_blueprint: unknown archetype '$archetype_id'" >&2
    echo "ai-dlc: available archetypes: $(jq -r '.archetypes[].id' "$_DLC_ARCHETYPES_JSON" | tr '\n' ', ')" >&2
    return 1
  fi

  # Extract base tokens
  local archetype_name archetype_desc
  archetype_name=$(echo "$archetype" | jq -r '.name')
  archetype_desc=$(echo "$archetype" | jq -r '.description')

  local base_color_primary base_color_bg base_color_accent base_color_text base_color_muted
  base_color_primary=$(echo "$archetype" | jq -r '.tokens.color_primary')
  base_color_bg=$(echo "$archetype" | jq -r '.tokens.color_background')
  base_color_accent=$(echo "$archetype" | jq -r '.tokens.color_accent')
  base_color_text=$(echo "$archetype" | jq -r '.tokens.color_text')
  base_color_muted=$(echo "$archetype" | jq -r '.tokens.color_muted')

  local font_heading font_body
  font_heading=$(echo "$archetype" | jq -r '.tokens.font_heading')
  font_body=$(echo "$archetype" | jq -r '.tokens.font_body')

  local base_border_color
  base_border_color=$(echo "$archetype" | jq -r '.tokens.border_color')

  local layout_guidelines typography_guidelines component_guidelines
  layout_guidelines=$(echo "$archetype" | jq -r '.layout_guidelines')
  typography_guidelines=$(echo "$archetype" | jq -r '.typography_guidelines')
  component_guidelines=$(echo "$archetype" | jq -r '.component_guidelines')

  # Extract parameters
  local density expressiveness shape_language color_mood
  density=$(echo "$params_json" | jq -r '.density // 50')
  expressiveness=$(echo "$params_json" | jq -r '.expressiveness // 50')
  shape_language=$(echo "$params_json" | jq -r '.shape_language // 50')
  color_mood=$(echo "$params_json" | jq -r '.color_mood // 50')

  # Clamp parameters to 0-100
  density=$(_clamp "$density" 0 100)
  expressiveness=$(_clamp "$expressiveness" 0 100)
  shape_language=$(_clamp "$shape_language" 0 100)
  color_mood=$(_clamp "$color_mood" 0 100)

  # === Apply parameter adjustments ===

  # Density (0=airy, 100=packed): interpolates spacing and font size
  local spacing_unit spacing_section font_size_base line_height
  spacing_unit="$(_lerp "$density" 12 4)px"
  spacing_section="$(_lerp "$density" 80 16)px"
  font_size_base="$(_lerp "$density" 18 12)px"
  line_height="$(_lerp_float "$density" 1.8 1.2)"

  # Shape Language (0=sharp, 100=rounded): border-radius and border-width
  local border_radius border_width
  border_radius="$(_lerp "$shape_language" 0 20)px"
  border_width="$(_lerp_float "$shape_language" 3.0 1.0)"
  # Round border_width to nearest integer
  border_width="$(echo "$border_width" | awk '{printf "%d", $1 + 0.5}')px"

  # Color Mood (0=cool, 100=warm): shift colors
  local color_primary color_bg color_accent color_text color_muted color_border
  color_primary=$(_shift_color_mood "$base_color_primary" "$color_mood")
  color_bg=$(_shift_color_mood "$base_color_bg" "$color_mood")
  color_accent=$(_shift_color_mood "$base_color_accent" "$color_mood")
  color_text=$(_shift_color_mood "$base_color_text" "$color_mood")
  color_muted=$(_shift_color_mood "$base_color_muted" "$color_mood")
  color_border=$(_shift_color_mood "$base_border_color" "$color_mood")

  # Expressiveness: modifies guidelines text
  local expressiveness_note
  expressiveness_note=$(_expressiveness_modifier "$expressiveness")

  # Determine shadow based on archetype base + shape language
  local shadow
  local base_shadow
  base_shadow=$(echo "$archetype" | jq -r '.tokens.shadow')
  if [ "$base_shadow" = "none" ]; then
    shadow="none"
  else
    shadow="$base_shadow"
  fi

  # Determine intent directory
  local repo_root intent_dir
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  intent_dir="${repo_root}/.ai-dlc/${intent_slug}"

  if [ ! -d "$intent_dir" ]; then
    echo "ai-dlc: dlc_generate_design_blueprint: intent directory not found: $intent_dir" >&2
    echo "ai-dlc: creating directory..." >&2
    mkdir -p "$intent_dir"
  fi

  local generated_at
  generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Write design-blueprint.md
  local blueprint_file="${intent_dir}/design-blueprint.md"
  cat > "$blueprint_file" <<BLUEPRINT
---
archetype: ${archetype_id}
archetype_name: "${archetype_name}"
parameters:
  density: ${density}
  expressiveness: ${expressiveness}
  shape_language: ${shape_language}
  color_mood: ${color_mood}
generated: "${generated_at}"
---

# Design Blueprint: ${archetype_name}

${archetype_desc}

## CSS Tokens

| Token | Value |
|---|---|
| \`--color-primary\` | \`${color_primary}\` |
| \`--color-background\` | \`${color_bg}\` |
| \`--color-accent\` | \`${color_accent}\` |
| \`--color-text\` | \`${color_text}\` |
| \`--color-muted\` | \`${color_muted}\` |
| \`--color-border\` | \`${color_border}\` |
| \`--font-heading\` | \`${font_heading}\` |
| \`--font-body\` | \`${font_body}\` |
| \`--font-size-base\` | \`${font_size_base}\` |
| \`--line-height\` | \`${line_height}\` |
| \`--border-radius\` | \`${border_radius}\` |
| \`--border-width\` | \`${border_width}\` |
| \`--shadow\` | \`${shadow}\` |
| \`--spacing-unit\` | \`${spacing_unit}\` |
| \`--spacing-section\` | \`${spacing_section}\` |

## Layout Guidelines

${layout_guidelines}

## Typography

${typography_guidelines}

## Component Guidelines

${component_guidelines}

## Expressiveness

${expressiveness_note}

## Color Palette

The color palette is based on the **${archetype_name}** archetype, adjusted for a color mood of **${color_mood}** (0=cool/desaturated, 100=warm/vibrant).

- **Primary:** \`${color_primary}\` — main brand color, used for primary actions and key UI elements
- **Background:** \`${color_bg}\` — page and container backgrounds
- **Accent:** \`${color_accent}\` — secondary highlights, CTAs, and decorative elements
- **Text:** \`${color_text}\` — body text and headings
- **Muted:** \`${color_muted}\` — secondary text, labels, and disabled states
- **Border:** \`${color_border}\` — dividers, input borders, and card outlines
BLUEPRINT

  echo "ai-dlc: design blueprint written to ${blueprint_file}" >&2

  # Seed knowledge
  local knowledge_content
  knowledge_content="# Design Direction

## Archetype: ${archetype_name}

${archetype_desc}

## Parameters

- **Density:** ${density}/100 (${density} = $([ "$density" -le 30 ] && echo "airy" || ([ "$density" -le 70 ] && echo "moderate" || echo "packed")))
- **Expressiveness:** ${expressiveness}/100 (${expressiveness} = $([ "$expressiveness" -le 30 ] && echo "strict" || ([ "$expressiveness" -le 70 ] && echo "balanced" || echo "expressive")))
- **Shape Language:** ${shape_language}/100 (${shape_language} = $([ "$shape_language" -le 30 ] && echo "sharp" || ([ "$shape_language" -le 70 ] && echo "mixed" || echo "rounded")))
- **Color Mood:** ${color_mood}/100 (${color_mood} = $([ "$color_mood" -le 30 ] && echo "cool" || ([ "$color_mood" -le 70 ] && echo "neutral" || echo "warm")))

## Key Design Tokens

- Primary: \`${color_primary}\`, Accent: \`${color_accent}\`, Background: \`${color_bg}\`
- Font heading: \`${font_heading}\`
- Font body: \`${font_body}\`
- Border radius: \`${border_radius}\`, Spacing unit: \`${spacing_unit}\`

## Guidelines Summary

**Layout:** ${layout_guidelines}

**Typography:** ${typography_guidelines}

**Components:** ${component_guidelines}

**Expressiveness:** ${expressiveness_note}
"

  _dlc_blueprint_write_knowledge "$intent_dir" "design" "$knowledge_content"
  echo "ai-dlc: knowledge seeded to ${intent_dir}/knowledge/design.md" >&2

  return 0
}
