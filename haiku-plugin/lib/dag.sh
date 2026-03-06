#!/bin/bash
# dag.sh - DAG resolution functions for unit dependencies
#
# Units are stored as unit-NN-slug.md files with YAML frontmatter:
# ---
# status: pending  # pending | in_progress | completed | blocked
# depends_on: [unit-01-setup, unit-03-session]
# ---
#
# All functions work from filesystem alone - no git branch queries required.

# Source storage abstraction
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=storage.sh
source "$SCRIPT_DIR/storage.sh"

# Fast YAML extraction for simple scalar values (avoids subprocess)
# Usage: _yaml_get_simple "field" "default" < file
_yaml_get_simple() {
  local field="$1" default="$2"
  local in_frontmatter=false value=""
  while IFS= read -r line; do
    [[ "$line" == "---" ]] && { $in_frontmatter && break || in_frontmatter=true; continue; }
    $in_frontmatter || continue
    if [[ "$line" =~ ^${field}:\ *(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      break
    fi
  done
  echo "${value:-$default}"
}

# Fast extraction of YAML array values (for depends_on)
# Usage: _yaml_get_array "field" < file
# Returns space-separated values
_yaml_get_array() {
  local field="$1"
  local in_frontmatter=false in_array=false result=""
  while IFS= read -r line; do
    [[ "$line" == "---" ]] && { $in_frontmatter && break || in_frontmatter=true; continue; }
    $in_frontmatter || continue
    # Check for inline array: depends_on: [unit-01, unit-02]
    if [[ "$line" =~ ^${field}:\ *\[(.+)\]$ ]]; then
      result="${BASH_REMATCH[1]}"
      result="${result//,/ }"
      result="${result//\"/}"
      result="${result//\'/}"
      result=$(echo "$result" | tr -s ' ')
      break
    fi
    # Check for array start: depends_on:
    if [[ "$line" =~ ^${field}:\ *$ ]]; then
      in_array=true
      continue
    fi
    # Check for array items: - unit-01
    if $in_array; then
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(.+)$ ]]; then
        local item="${BASH_REMATCH[1]}"
        item="${item//\"/}"
        item="${item//\'/}"
        result="$result $item"
      elif [[ ! "$line" =~ ^[[:space:]] ]]; then
        break
      fi
    fi
  done
  echo "${result# }"
}

# Parse unit status from frontmatter
# Usage: parse_unit_status <unit_file>
parse_unit_status() {
  local unit_file="$1"
  if [ ! -f "$unit_file" ]; then
    echo "pending"
    return
  fi
  _yaml_get_simple "status" "pending" < "$unit_file"
}

# Parse unit dependencies from frontmatter
# Usage: parse_unit_deps <unit_file>
parse_unit_deps() {
  local unit_file="$1"
  if [ ! -f "$unit_file" ]; then
    echo ""
    return
  fi
  _yaml_get_array "depends_on" < "$unit_file"
}

# Check if all dependencies of a unit are completed
# Returns 0 (true) if all deps completed, 1 (false) otherwise
# Usage: are_deps_completed <intent_dir> <unit_file>
are_deps_completed() {
  local intent_dir="$1"
  local unit_file="$2"

  local deps
  deps=$(parse_unit_deps "$unit_file")

  [ -z "$deps" ] && return 0

  for dep in $deps; do
    [ -z "$dep" ] && continue
    local dep_file="$intent_dir/$dep.md"
    local dep_status
    dep_status=$(parse_unit_status "$dep_file")

    if [ "$dep_status" != "completed" ]; then
      return 1
    fi
  done

  return 0
}

# Check dependency status for a specific unit and output formatted report
# Returns 0 if all deps met, 1 if blocked
# Usage: get_unit_dep_status <intent_dir> <unit_name>
get_unit_dep_status() {
  local intent_dir="$1"
  local unit_name="$2"
  local unit_file="$intent_dir/$unit_name.md"

  if [ ! -f "$unit_file" ]; then
    echo "Error: Unit file not found: $unit_file" >&2
    return 1
  fi

  local deps
  deps=$(parse_unit_deps "$unit_file")

  [ -z "$deps" ] && return 0

  local has_blocking=false
  local table_rows=""

  for dep in $deps; do
    [ -z "$dep" ] && continue
    local dep_file="$intent_dir/$dep.md"
    local dep_status
    dep_status=$(parse_unit_status "$dep_file")

    if [ "$dep_status" != "completed" ]; then
      has_blocking=true
      table_rows="${table_rows}| $dep | $dep_status (blocking) |\n"
    else
      table_rows="${table_rows}| $dep | $dep_status |\n"
    fi
  done

  if [ "$has_blocking" = "true" ]; then
    echo "| Dependency | Status |"
    echo "|------------|--------|"
    printf "%b" "$table_rows"
    return 1
  fi

  return 0
}

# Find ready units (pending + all deps completed)
# Returns unit names (without .md) one per line
# Usage: find_ready_units <intent_dir>
find_ready_units() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    return
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    [ "$unit_status" != "pending" ] && continue

    if are_deps_completed "$intent_dir" "$unit_file"; then
      basename "$unit_file" .md
    fi
  done
}

# Find in-progress units
# Usage: find_in_progress_units <intent_dir>
find_in_progress_units() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    return
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    if [ "$unit_status" = "in_progress" ]; then
      basename "$unit_file" .md
    fi
  done
}

# Find blocked units
# Returns "unit-name:dep1,dep2" format one per line
# Usage: find_blocked_units <intent_dir>
find_blocked_units() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    return
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    [ "$unit_status" != "pending" ] && continue

    local deps
    deps=$(parse_unit_deps "$unit_file")
    [ -z "$deps" ] && continue

    local incomplete_deps=""
    for dep in $deps; do
      [ -z "$dep" ] && continue
      local dep_file="$intent_dir/$dep.md"
      local dep_status
      dep_status=$(parse_unit_status "$dep_file")

      if [ "$dep_status" != "completed" ]; then
        if [ -n "$incomplete_deps" ]; then
          incomplete_deps="$incomplete_deps,$dep"
        else
          incomplete_deps="$dep"
        fi
      fi
    done

    if [ -n "$incomplete_deps" ]; then
      echo "$(basename "$unit_file" .md):$incomplete_deps"
    fi
  done
}

# Find completed units
# Usage: find_completed_units <intent_dir>
find_completed_units() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    return
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    if [ "$unit_status" = "completed" ]; then
      basename "$unit_file" .md
    fi
  done
}

# Get unit status summary as markdown table
# Usage: get_dag_status_table <intent_dir>
get_dag_status_table() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    echo "No units found."
    return
  fi

  local has_units=false
  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] && has_units=true && break
  done

  if [ "$has_units" = "false" ]; then
    echo "No units found."
    return
  fi

  echo "| Unit | Status | Blocked By |"
  echo "|------|--------|------------|"

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local name
    name=$(basename "$unit_file" .md)
    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    local blockers=""
    local deps
    deps=$(parse_unit_deps "$unit_file")

    if [ -n "$deps" ]; then
      for dep in $deps; do
        [ -z "$dep" ] && continue
        local dep_file="$intent_dir/$dep.md"
        local dep_status
        dep_status=$(parse_unit_status "$dep_file")

        if [ "$dep_status" != "completed" ]; then
          if [ -n "$blockers" ]; then
            blockers="$blockers, $dep"
          else
            blockers="$dep"
          fi
        fi
      done
    fi

    echo "| $name | $unit_status | $blockers |"
  done
}

# Get DAG summary counts
# Usage: get_dag_summary <intent_dir>
# Returns: pending:N in_progress:N completed:N blocked:N ready:N
get_dag_summary() {
  local intent_dir="$1"

  local pending=0 in_progress=0 completed=0 blocked=0 ready=0

  if [ ! -d "$intent_dir" ]; then
    echo "pending:0 in_progress:0 completed:0 blocked:0 ready:0"
    return
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    case "$unit_status" in
      pending)
        pending=$((pending + 1))
        if are_deps_completed "$intent_dir" "$unit_file"; then
          ready=$((ready + 1))
        else
          blocked=$((blocked + 1))
        fi
        ;;
      in_progress)
        in_progress=$((in_progress + 1))
        ;;
      completed)
        completed=$((completed + 1))
        ;;
      blocked)
        blocked=$((blocked + 1))
        ;;
    esac
  done

  echo "pending:$pending in_progress:$in_progress completed:$completed blocked:$blocked ready:$ready"
}

# Check if DAG is complete (all units completed)
# Returns 0 if complete, 1 if not
# Usage: is_dag_complete <intent_dir>
is_dag_complete() {
  local intent_dir="$1"

  if [ ! -d "$intent_dir" ]; then
    return 1
  fi

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local unit_status
    unit_status=$(parse_unit_status "$unit_file")

    if [ "$unit_status" != "completed" ]; then
      return 1
    fi
  done

  return 0
}

# Determine recommended starting hat based on unit states
# Usage: get_recommended_hat <intent_dir> [workflow_name]
get_recommended_hat() {
  local intent_dir="$1"
  local workflow_name="${2:-default}"

  # Get workflow hats from workflows.yml
  local hats_file="${CLAUDE_PLUGIN_ROOT}/workflows.yml"
  local hats=""

  if command -v han &>/dev/null && [ -f "$hats_file" ]; then
    hats=$(han parse yaml "${workflow_name}.hats" < "$hats_file" 2>/dev/null | sed 's/^- //' | tr '\n' ' ')
  fi

  [ -z "$hats" ] && hats="planner executor reviewer"

  read -ra hat_array <<< "$hats"
  local num_hats=${#hat_array[@]}

  # No units? Go to planner
  local unit_count=0
  for f in "$intent_dir"/unit-*.md; do
    [ -f "$f" ] && unit_count=$((unit_count + 1))
  done

  if [ "$unit_count" -eq 0 ]; then
    if [ "$num_hats" -ge 2 ]; then
      echo "${hat_array[1]}"
    else
      echo "${hat_array[0]}"
    fi
    return
  fi

  local summary
  summary=$(get_dag_summary "$intent_dir")

  local completed in_progress pending ready
  completed=$(echo "$summary" | sed -n 's/.*completed:\([0-9]*\).*/\1/p')
  in_progress=$(echo "$summary" | sed -n 's/.*in_progress:\([0-9]*\).*/\1/p')
  pending=$(echo "$summary" | sed -n 's/.*pending:\([0-9]*\).*/\1/p')
  ready=$(echo "$summary" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')

  # All completed? Go to last hat (reviewer)
  if [ "${pending:-0}" -eq 0 ] && [ "${in_progress:-0}" -eq 0 ]; then
    echo "${hat_array[$((num_hats - 1))]}"
    return
  fi

  # In progress or ready? Go to executor (3rd hat, index 2)
  if [ "${in_progress:-0}" -gt 0 ] || [ "${ready:-0}" -gt 0 ]; then
    if [ "$num_hats" -ge 3 ]; then
      echo "${hat_array[2]}"
    else
      echo "${hat_array[$((num_hats - 1))]}"
    fi
    return
  fi

  # Everything blocked? Go to planner
  if [ "$num_hats" -ge 2 ]; then
    echo "${hat_array[1]}"
  else
    echo "${hat_array[0]}"
  fi
}

# Update unit status in file
# Usage: update_unit_status <unit_file> <new_status>
update_unit_status() {
  local unit_file="$1"
  local new_status="$2"

  if [ ! -f "$unit_file" ]; then
    echo "Error: Unit file not found: $unit_file" >&2
    return 1
  fi

  # Validate status value
  case "$new_status" in
    pending|in_progress|completed|blocked)
      ;;
    *)
      echo "Error: Invalid status '$new_status'. Must be: pending, in_progress, completed, or blocked" >&2
      return 1
      ;;
  esac

  if command -v han &>/dev/null; then
    han parse yaml-set status "$new_status" < "$unit_file" > "$unit_file.tmp" && mv "$unit_file.tmp" "$unit_file"
  else
    # Fallback: sed-based replacement
    sed -i.bak "s/^status:.*$/status: $new_status/" "$unit_file"
    rm -f "$unit_file.bak"
  fi
}

# Validate DAG structure (check for cycles and missing deps)
# Usage: validate_dag <intent_dir>
validate_dag() {
  local intent_dir="$1"
  local errors=""

  if [ ! -d "$intent_dir" ]; then
    echo "Error: Intent directory not found: $intent_dir"
    return 1
  fi

  local all_units=""
  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue
    local name
    name=$(basename "$unit_file" .md)
    all_units="$all_units $name"
  done

  for unit_file in "$intent_dir"/unit-*.md; do
    [ -f "$unit_file" ] || continue

    local name
    name=$(basename "$unit_file" .md)
    local deps
    deps=$(parse_unit_deps "$unit_file")

    [ -z "$deps" ] && continue

    for dep in $deps; do
      [ -z "$dep" ] && continue

      if ! echo "$all_units" | grep -q "\b$dep\b"; then
        errors="${errors}Error: $name depends on non-existent unit: $dep\n"
      fi

      if [ "$dep" = "$name" ]; then
        errors="${errors}Error: $name has self-dependency\n"
      fi
    done
  done

  if [ -n "$errors" ]; then
    printf "%b" "$errors"
    return 1
  fi

  return 0
}
