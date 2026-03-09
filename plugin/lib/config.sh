#!/bin/bash
# config.sh - AI-DLC Configuration System (Shell Version)
#
# Provides configuration loading with precedence:
# 1. Intent frontmatter (highest priority)
# 2. Repo settings (.ai-dlc/settings.yml)
# 3. Built-in defaults (lowest priority)
#
# Usage:
#   source config.sh
#   config=$(get_ai_dlc_config "$intent_dir")
#   change_strategy=$(echo "$config" | jq -r '.change_strategy')

# Default configuration values
AI_DLC_DEFAULT_CHANGE_STRATEGY="unit"
AI_DLC_DEFAULT_ELABORATION_REVIEW="true"
AI_DLC_DEFAULT_BRANCH="auto"

# Detect which VCS is being used
# Usage: detect_vcs [directory]
# Returns: 'git' | 'jj' | ''
detect_vcs() {
  local dir="${1:-.}"

  # Check for jj first (it can coexist with git)
  if jj root --ignore-working-copy -R "$dir" >/dev/null 2>&1; then
    echo "jj"
    return
  fi

  # Check for git
  if git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
    echo "git"
    return
  fi

  # No VCS found
  echo ""
}

# Find repository root directory
# Usage: find_repo_root [directory]
# Returns: repo root path or empty string
find_repo_root() {
  local dir="${1:-.}"
  local vcs
  vcs=$(detect_vcs "$dir")

  case "$vcs" in
    jj)
      jj root --ignore-working-copy -R "$dir" 2>/dev/null
      ;;
    git)
      git -C "$dir" rev-parse --show-toplevel 2>/dev/null
      ;;
    *)
      echo ""
      ;;
  esac
}

# Resolve 'auto' default branch to actual branch name
# Usage: resolve_default_branch <config_value> [directory]
# Returns: resolved branch name
resolve_default_branch() {
  local config_value="$1"
  local dir="${2:-.}"

  if [ "$config_value" != "auto" ]; then
    echo "$config_value"
    return
  fi

  # Try to get from origin/HEAD
  local head_ref
  head_ref=$(git -C "$dir" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null)
  if [ -n "$head_ref" ]; then
    # Extract branch name from refs/remotes/origin/main
    basename "$head_ref"
    return
  fi

  # Fallback: check if main exists
  if git -C "$dir" rev-parse --verify main >/dev/null 2>&1; then
    echo "main"
    return
  fi

  # Fallback: check if master exists
  if git -C "$dir" rev-parse --verify master >/dev/null 2>&1; then
    echo "master"
    return
  fi

  # Ultimate fallback
  echo "main"
}

# Load repo settings from .ai-dlc/settings.yml
# Usage: load_repo_settings [repo_root]
# Returns: JSON object with git/jj config or '{}'
load_repo_settings() {
  local repo_root="${1:-$(find_repo_root)}"
  local settings_file="$repo_root/.ai-dlc/settings.yml"

  if [ ! -f "$settings_file" ]; then
    echo "{}"
    return
  fi

  # Parse YAML to JSON
  han parse yaml --json < "$settings_file" 2>/dev/null || echo "{}"
}

# Load intent overrides from intent.md frontmatter
# Usage: load_intent_overrides <intent_dir>
# Returns: JSON object with git/jj config or '{}'
load_intent_overrides() {
  local intent_dir="$1"
  local intent_file="$intent_dir/intent.md"

  if [ ! -f "$intent_file" ]; then
    echo "{}"
    return
  fi

  # Extract git/jj keys from frontmatter
  local git_config jj_config
  git_config=$(han parse yaml git --json < "$intent_file" 2>/dev/null || echo "null")
  jj_config=$(han parse yaml jj --json < "$intent_file" 2>/dev/null || echo "null")

  # Build result object
  local result="{}"
  if [ "$git_config" != "null" ] && [ -n "$git_config" ]; then
    result=$(echo "$result" | jq --argjson git "$git_config" '. + {git: $git}')
  fi
  if [ "$jj_config" != "null" ] && [ -n "$jj_config" ]; then
    result=$(echo "$result" | jq --argjson jj "$jj_config" '. + {jj: $jj}')
  fi

  echo "$result"
}

# Get merged AI-DLC configuration
# Usage: get_ai_dlc_config [intent_dir] [repo_root]
# Returns: JSON object with complete VcsConfig
get_ai_dlc_config() {
  local intent_dir="${1:-}"
  local repo_root="${2:-$(find_repo_root)}"
  local vcs
  vcs=$(detect_vcs "$repo_root")
  [ -z "$vcs" ] && vcs="git"

  # Start with defaults as JSON
  local config
  config=$(cat <<EOF
{
  "change_strategy": "$AI_DLC_DEFAULT_CHANGE_STRATEGY",
  "elaboration_review": $AI_DLC_DEFAULT_ELABORATION_REVIEW,
  "default_branch": "$AI_DLC_DEFAULT_BRANCH"
}
EOF
)

  # Layer 1: Repo settings
  if [ -n "$repo_root" ]; then
    local repo_settings
    repo_settings=$(load_repo_settings "$repo_root")
    local vcs_settings
    vcs_settings=$(echo "$repo_settings" | jq -c ".$vcs // {}")
    if [ "$vcs_settings" != "{}" ] && [ "$vcs_settings" != "null" ]; then
      config=$(echo "$config" "$vcs_settings" | jq -s '.[0] * .[1]')
    fi
  fi

  # Layer 2: Intent overrides (highest priority)
  if [ -n "$intent_dir" ] && [ -d "$intent_dir" ]; then
    local intent_overrides
    intent_overrides=$(load_intent_overrides "$intent_dir")
    local intent_vcs_settings
    intent_vcs_settings=$(echo "$intent_overrides" | jq -c ".$vcs // {}")
    if [ "$intent_vcs_settings" != "{}" ] && [ "$intent_vcs_settings" != "null" ]; then
      config=$(echo "$config" "$intent_vcs_settings" | jq -s '.[0] * .[1]')
    fi
  fi

  # Resolve 'auto' default_branch
  local default_branch
  default_branch=$(echo "$config" | jq -r '.default_branch')
  if [ "$default_branch" = "auto" ]; then
    local resolved_branch
    resolved_branch=$(resolve_default_branch "auto" "$repo_root")
    config=$(echo "$config" | jq --arg branch "$resolved_branch" '.default_branch = $branch')
  fi

  echo "$config"
}

# Export config as environment variables
# Usage: export_ai_dlc_config [intent_dir] [repo_root]
# Sets: AI_DLC_CHANGE_STRATEGY, AI_DLC_ELABORATION_REVIEW, AI_DLC_DEFAULT_BRANCH, etc.
export_ai_dlc_config() {
  local intent_dir="${1:-}"
  local repo_root="${2:-}"
  local config
  config=$(get_ai_dlc_config "$intent_dir" "$repo_root")

  export AI_DLC_CHANGE_STRATEGY
  AI_DLC_CHANGE_STRATEGY=$(echo "$config" | jq -r '.change_strategy')

  export AI_DLC_ELABORATION_REVIEW
  AI_DLC_ELABORATION_REVIEW=$(echo "$config" | jq -r '.elaboration_review')

  export AI_DLC_DEFAULT_BRANCH
  AI_DLC_DEFAULT_BRANCH=$(echo "$config" | jq -r '.default_branch')

  export AI_DLC_AUTO_MERGE
  AI_DLC_AUTO_MERGE=$(echo "$config" | jq -r '.auto_merge // "false"')

  export AI_DLC_AUTO_SQUASH
  AI_DLC_AUTO_SQUASH=$(echo "$config" | jq -r '.auto_squash // "false"')

  export AI_DLC_VCS
  AI_DLC_VCS=$(detect_vcs "$repo_root")
}

# Get a specific config value
# Usage: get_config_value <key> [intent_dir] [repo_root]
# Example: get_config_value change_strategy "$intent_dir"
get_config_value() {
  local key="$1"
  local intent_dir="${2:-}"
  local repo_root="${3:-}"
  local config
  config=$(get_ai_dlc_config "$intent_dir" "$repo_root")

  echo "$config" | jq -r ".$key // empty"
}

# ============================================================================
# Quality Gates Configuration
# ============================================================================

# Load quality gates from .ai-dlc/settings.yml
# Usage: load_quality_gates [repo_root]
# Returns: JSON object with gate configs or '{}' if none configured
load_quality_gates() {
  local repo_root="${1:-$(find_repo_root)}"
  local settings
  settings=$(load_repo_settings "$repo_root")

  if [ "$settings" = "{}" ] || [ -z "$settings" ]; then
    echo "{}"
    return
  fi

  local gates
  gates=$(echo "$settings" | jq -c '.quality_gates // {}' 2>/dev/null || echo "{}")
  echo "$gates"
}

# Run quality gates from settings
# Usage: run_quality_gates [repo_root]
# Returns: 0 if all gates pass (or none configured), 1 if any fail
run_quality_gates() {
  local repo_root="${1:-$(find_repo_root)}"
  local gates
  gates=$(load_quality_gates "$repo_root")

  if [ "$gates" = "{}" ] || [ "$gates" = "null" ]; then
    # No quality gates configured - use default backpressure behavior
    return 0
  fi

  local failed=false

  # Iterate over each gate
  for gate_name in $(echo "$gates" | jq -r 'keys[]' 2>/dev/null); do
    local enabled command
    enabled=$(echo "$gates" | jq -r ".[\"$gate_name\"].enabled // true" 2>/dev/null)
    command=$(echo "$gates" | jq -r ".[\"$gate_name\"].command // empty" 2>/dev/null)

    [ "$enabled" = "false" ] && continue
    [ -z "$command" ] && continue

    echo "Running quality gate: $gate_name"
    if ! eval "$command"; then
      echo "Quality gate FAILED: $gate_name"
      failed=true
    fi
  done

  if [ "$failed" = "true" ]; then
    return 1
  fi

  return 0
}

# ============================================================================
# Provider Configuration
# ============================================================================

# Provider type -> MCP tool hint mapping
# Usage: _provider_mcp_hint <provider_type>
# Returns: MCP tool glob pattern or CLI command
_provider_mcp_hint() {
  local ptype="$1"
  case "$ptype" in
    notion)       echo 'mcp__*notion*' ;;
    confluence)   echo 'mcp__*confluence*' ;;
    google-docs)  echo 'mcp__*google*docs*' ;;
    jira)         echo 'mcp__*jira*' ;;
    linear)       echo 'mcp__*linear*' ;;
    github-issues) echo 'gh issue' ;;
    gitlab-issues) echo 'mcp__*gitlab*' ;;
    figma)        echo 'mcp__*figma*' ;;
    slack)        echo 'mcp__*slack*' ;;
    teams)        echo 'mcp__*teams*' ;;
    discord)      echo 'mcp__*discord*' ;;
    github)       echo 'gh' ;;
    gitlab)       echo 'mcp__*gitlab*' ;;
    bitbucket)    echo 'mcp__*bitbucket*' ;;
    github-actions) echo 'gh run' ;;
    gitlab-ci)    echo 'mcp__*gitlab*' ;;
    jenkins)      echo 'mcp__*jenkins*' ;;
    circleci)     echo 'mcp__*circleci*' ;;
    *)            echo '' ;;
  esac
}

# Load and merge provider instructions from three tiers
# Usage: load_provider_instructions <category> <type> [inline_instructions]
# Returns: Merged instruction text
load_provider_instructions() {
  local category="$1"  # ticketing, spec, design, comms
  local type="$2"      # jira, notion, figma, slack, etc.
  local inline_instructions="$3"  # from settings.yml, may be empty
  local merged=""

  # Tier 1: Built-in default
  local builtin="${CLAUDE_PLUGIN_ROOT}/providers/${category}.md"
  if [[ -f "$builtin" ]]; then
    local body
    body=$(awk '/^---$/{n++; next} n>=2' "$builtin")
    merged="${body}"
  fi

  # Tier 2: Inline instructions from settings.yml
  if [[ -n "$inline_instructions" ]]; then
    merged="${merged}

### Project-Specific Instructions (from settings.yml)
${inline_instructions}"
  fi

  # Tier 3: Project override from .ai-dlc/providers/{type}.md
  local repo_root
  repo_root=$(find_repo_root 2>/dev/null || echo "")
  if [[ -n "$repo_root" ]]; then
    local override="${repo_root}/.ai-dlc/providers/${type}.md"
    if [[ -f "$override" ]]; then
      local override_body
      override_body=$(awk '/^---$/{n++; next} n>=2' "$override")
      merged="${merged}

### Project Override (from .ai-dlc/providers/${type}.md)
${override_body}"
    fi
  fi

  printf '%s' "$merged"
}

# Detect VCS hosting platform from git remote
# Usage: detect_vcs_hosting [directory]
# Returns: github | gitlab | bitbucket | ''
detect_vcs_hosting() {
  local dir="${1:-.}"
  local remote_url
  remote_url=$(git -C "$dir" remote get-url origin 2>/dev/null || echo "")
  [ -z "$remote_url" ] && return

  case "$remote_url" in
    *github.com*)    echo "github" ;;
    *gitlab.com*)    echo "gitlab" ;;
    *bitbucket.org*) echo "bitbucket" ;;
    *)               echo "" ;;
  esac
}

# Detect CI/CD system from repo files
# Usage: detect_ci_cd [directory]
# Returns: github-actions | gitlab-ci | jenkins | circleci | ''
detect_ci_cd() {
  local dir="${1:-.}"

  if [ -d "$dir/.github/workflows" ]; then
    echo "github-actions"
  elif [ -f "$dir/.gitlab-ci.yml" ]; then
    echo "gitlab-ci"
  elif [ -f "$dir/Jenkinsfile" ]; then
    echo "jenkins"
  elif [ -d "$dir/.circleci" ]; then
    echo "circleci"
  else
    echo ""
  fi
}

# Detect project maturity based on commit count and source file count
# Usage: detect_project_maturity [directory]
# Returns: greenfield | early | established
detect_project_maturity() {
  local dir="${1:-.}"

  # Guard: shallow clone — commit count is unreliable
  local is_shallow
  is_shallow=$(git -C "$dir" rev-parse --is-shallow-repository 2>/dev/null || echo "false")

  local commit_count=0
  if [ "$is_shallow" != "true" ]; then
    commit_count=$(git -C "$dir" rev-list --count HEAD 2>/dev/null || echo "0")
  fi

  # Count source files excluding scaffolding
  # Excludes: *.md, *.json, *.yml, *.yaml, *.lock, *.toml, LICENSE*, Dockerfile*,
  #           .github/*, .gitlab-ci*, .circleci/*, .ai-dlc/*
  local source_file_count
  source_file_count=$(git -C "$dir" ls-files 2>/dev/null \
    | grep -cvE '\.(md|json|ya?ml|lock|toml)$|^LICENSE|^Dockerfile|^\.github/|^\.gitlab-ci|^\.circleci/|^\.ai-dlc/' \
    2>/dev/null || true)
  : "${source_file_count:=0}"

  # Shallow clone: use source file count only
  if [ "$is_shallow" = "true" ]; then
    if [ "$source_file_count" -le 5 ]; then
      echo "greenfield"
    elif [ "$source_file_count" -le 20 ]; then
      echo "early"
    else
      echo "established"
    fi
    return
  fi

  # Full repo heuristics
  if [ "$commit_count" -le 3 ]; then
    echo "greenfield"
  elif [ "$commit_count" -le 20 ]; then
    if [ "$source_file_count" -le 5 ]; then
      echo "greenfield"
    else
      echo "early"
    fi
  else
    echo "established"
  fi
}

# Load provider configuration with fallback chain
# Usage: load_providers [repo_root]
# Returns: JSON object with all provider categories
load_providers() {
  local repo_root="${1:-$(find_repo_root)}"
  local result='{"spec":null,"ticketing":null,"design":null,"comms":null,"vcsHosting":null,"ciCd":null}'

  # Source 1: Declared providers from settings.yml
  if [ -n "$repo_root" ]; then
    local settings
    settings=$(load_repo_settings "$repo_root")
    if [ "$settings" != "{}" ] && [ -n "$settings" ]; then
      local providers
      providers=$(echo "$settings" | jq -c '.providers // {}')
      if [ "$providers" != "{}" ] && [ "$providers" != "null" ]; then
        for key in spec ticketing design comms; do
          local val
          val=$(echo "$providers" | jq -c ".$key // null")
          if [ "$val" != "null" ]; then
            result=$(echo "$result" | jq --argjson v "$val" ".$key = \$v")
          fi
        done
      fi
    fi
  fi

  # Source 2: Cached providers from MCP discovery
  local cached
  cached=$(han keep load providers.json --quiet 2>/dev/null || echo "")
  if [ -n "$cached" ] && [ "$cached" != "null" ]; then
    for key in spec ticketing design comms; do
      local current
      current=$(echo "$result" | jq -c ".$key")
      if [ "$current" = "null" ]; then
        local cached_val
        cached_val=$(echo "$cached" | jq -c ".$key // null")
        if [ "$cached_val" != "null" ]; then
          result=$(echo "$result" | jq --argjson v "$cached_val" ".$key = \$v")
        fi
      fi
    done
  fi

  # Source 3: Auto-detect VCS hosting and CI/CD
  local vcs_hosting ci_cd
  vcs_hosting=$(detect_vcs_hosting "$repo_root")
  ci_cd=$(detect_ci_cd "$repo_root")

  if [ -n "$vcs_hosting" ]; then
    result=$(echo "$result" | jq --arg v "$vcs_hosting" '.vcsHosting = $v')
  fi
  if [ -n "$ci_cd" ]; then
    result=$(echo "$result" | jq --arg v "$ci_cd" '.ciCd = $v')
  fi

  echo "$result"
}

# Format providers as markdown for hook injection
# Usage: format_providers_markdown [repo_root]
# Returns: Markdown string with provider table
format_providers_markdown() {
  local repo_root="${1:-$(find_repo_root)}"
  local providers
  providers=$(load_providers "$repo_root")

  # Check if anything is configured
  local has_any=false
  for key in spec ticketing design comms vcsHosting ciCd; do
    local val
    val=$(echo "$providers" | jq -r ".$key // empty")
    if [ -n "$val" ] && [ "$val" != "null" ]; then
      has_any=true
      break
    fi
  done

  if [ "$has_any" = "false" ]; then
    echo "### Project Providers"
    echo ""
    echo "No providers configured. Use \`ToolSearch\` to discover available MCP tools, or configure providers in \`.ai-dlc/settings.yml\`."
    return
  fi

  echo "### Project Providers"
  echo ""
  echo "| Category | Provider | MCP Hint |"
  echo "|----------|----------|----------|"

  # VCS Hosting (auto-detected)
  local vcs_host
  vcs_host=$(echo "$providers" | jq -r '.vcsHosting // empty')
  if [ -n "$vcs_host" ]; then
    local hint
    hint=$(_provider_mcp_hint "$vcs_host")
    echo "| VCS Hosting | $vcs_host | \`$hint\` |"
  fi

  # CI/CD (auto-detected)
  local ci_cd
  ci_cd=$(echo "$providers" | jq -r '.ciCd // empty')
  if [ -n "$ci_cd" ]; then
    local hint
    hint=$(_provider_mcp_hint "$ci_cd")
    echo "| CI/CD | $ci_cd | \`$hint\` |"
  fi

  # Declared providers
  local categories="spec:Spec ticketing:Ticketing design:Design comms:Comms"
  for entry in $categories; do
    local key="${entry%%:*}"
    local label="${entry##*:}"
    local ptype
    ptype=$(echo "$providers" | jq -r ".$key.type // empty")
    if [ -n "$ptype" ]; then
      local hint
      hint=$(_provider_mcp_hint "$ptype")
      echo "| $label | $ptype | \`$hint\` |"
    else
      echo "| $label | — | Not configured |"
    fi
  done

  echo ""
  echo "> **Tip:** Configure providers in \`.ai-dlc/settings.yml\` under \`providers:\` to enable automatic ticket sync and spec references."

  # Provider Instructions section - merged from three tiers
  local has_instructions=false
  local category_map="ticketing:ticketing:Ticketing spec:spec:Spec design:design:Design comms:comms:Comms"
  local instructions_output=""

  for entry in $category_map; do
    local key="${entry%%:*}"
    local rest="${entry#*:}"
    local category="${rest%%:*}"
    local label="${rest##*:}"
    local ptype
    ptype=$(echo "$providers" | jq -r ".$key.type // empty")
    if [ -n "$ptype" ]; then
      local inline
      inline=$(echo "$providers" | jq -r ".$key.instructions // empty")
      local merged
      merged=$(load_provider_instructions "$category" "$ptype" "$inline")
      if [ -n "$merged" ]; then
        has_instructions=true
        instructions_output="${instructions_output}
#### ${label} (${ptype})
${merged}
"
      fi
    fi
  done

  if [ "$has_instructions" = "true" ]; then
    echo ""
    echo "### Provider Instructions"
    printf '%s' "$instructions_output"
  fi
}
