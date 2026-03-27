#!/bin/bash
# state.sh — File-based state persistence for AI-DLC
# Complement to han keep: persists state as readable markdown files

# Write state file with lockfile protection
# Usage: write_state_file <intent_dir> <filename> <content>
write_state_file() {
  local intent_dir="$1" filename="$2" content="$3"
  local filepath="${intent_dir}/${filename}"
  local lockfile="${filepath}.lock"

  # Acquire lock (timeout 10s)
  local timeout=10
  while [ -f "$lockfile" ] && [ "$timeout" -gt 0 ]; do
    sleep 1; timeout=$((timeout - 1))
  done
  echo $$ > "$lockfile"

  echo "$content" > "$filepath"
  rm -f "$lockfile"
}

# Read state file
# Usage: read_state_file <intent_dir> <filename>
read_state_file() {
  local intent_dir="$1" filename="$2"
  cat "${intent_dir}/${filename}" 2>/dev/null || echo ""
}

# Update a section in a markdown state file (e.g., STATE.md)
# Finds the section header and replaces content until the next header or EOF
# Usage: update_state_section <intent_dir> <section_name> <content>
update_state_section() {
  local intent_dir="$1" section_name="$2" content="$3"
  local filepath="${intent_dir}/STATE.md"
  local lockfile="${filepath}.lock"

  # Acquire lock (timeout 10s)
  local timeout=10
  while [ -f "$lockfile" ] && [ "$timeout" -gt 0 ]; do
    sleep 1; timeout=$((timeout - 1))
  done
  echo $$ > "$lockfile"

  if [ ! -f "$filepath" ]; then
    # File doesn't exist — create with just this section
    printf "# State\n\n## %s\n%s\n" "$section_name" "$content" > "$filepath"
    rm -f "$lockfile"
    return
  fi

  # Build the updated file:
  # 1. Everything before the target section header
  # 2. The new section header + content
  # 3. Everything from the next same-level header onward
  local tmp="${filepath}.tmp.$$"
  local in_section=false
  local found=false

  while IFS= read -r line; do
    if [[ "$line" == "## ${section_name}" ]]; then
      # Start of our target section — write new content
      echo "## ${section_name}"
      echo "$content"
      in_section=true
      found=true
      continue
    fi

    if $in_section && [[ "$line" =~ ^##\  ]]; then
      # Hit the next section header — stop skipping
      in_section=false
    fi

    if ! $in_section; then
      echo "$line"
    fi
  done < "$filepath" > "$tmp"

  # If section wasn't found, append it
  if ! $found; then
    echo "" >> "$tmp"
    echo "## ${section_name}" >> "$tmp"
    echo "$content" >> "$tmp"
  fi

  mv "$tmp" "$filepath"
  rm -f "$lockfile"
}
