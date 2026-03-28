#!/bin/bash
# deps.sh — Dependency validation for AI-DLC
#
# Validates that jq and yq (mikefarah/Go variant) are installed.
# Provides entry-point guard for hooks and guided installation.
#
# Usage:
#   source deps.sh
#   dlc_check_deps   # exits 2 on failure, returns 0 silently on success

# Guard against double-sourcing
if [ -n "${_DLC_DEPS_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_DLC_DEPS_SOURCED=1

# Check that jq is installed
# Returns 0 on success, 1 on failure (prints instructions to stderr)
dlc_require_jq() {
  if command -v jq >/dev/null 2>&1; then
    return 0
  fi
  echo "ai-dlc: 'jq' is required but not found in PATH." >&2
  echo "ai-dlc: Install jq:" >&2
  echo "ai-dlc:   macOS:  brew install jq" >&2
  echo "ai-dlc:   Debian: sudo apt-get install jq" >&2
  echo "ai-dlc:   Other:  https://jqlang.github.io/jq/download/" >&2
  return 1
}

# Check that yq (mikefarah/Go variant) is installed
# Returns 0 on success, 1 on failure (prints instructions to stderr)
dlc_require_yq() {
  if ! command -v yq >/dev/null 2>&1; then
    echo "ai-dlc: 'yq' is required but not found in PATH." >&2
    echo "ai-dlc: Install yq (mikefarah/Go variant):" >&2
    echo "ai-dlc:   macOS:  brew install yq" >&2
    echo "ai-dlc:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  # Verify it's the mikefarah variant (not kislyuk/Python)
  local yq_version
  yq_version=$(yq --version 2>&1 || echo "")
  if [[ "$yq_version" == *"kislyuk"* ]] || [[ "$yq_version" == *"xq"* ]]; then
    echo "ai-dlc: Found Python yq (kislyuk). AI-DLC requires mikefarah/yq (Go variant)." >&2
    echo "ai-dlc: Install the correct yq:" >&2
    echo "ai-dlc:   macOS:  brew install yq" >&2
    echo "ai-dlc:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  if [[ "$yq_version" != *"mikefarah"* ]] && [[ "$yq_version" != *"yq ("* ]]; then
    echo "ai-dlc: Unable to verify yq variant. AI-DLC requires mikefarah/yq (Go variant v4+)." >&2
    echo "ai-dlc: Found: $yq_version" >&2
    echo "ai-dlc: Install the correct yq:" >&2
    echo "ai-dlc:   macOS:  brew install yq" >&2
    echo "ai-dlc:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  return 0
}

# Check both jq and yq — exit 2 on failure, return 0 silently on success
# Intended as an entry-point guard for hooks.
dlc_check_deps() {
  local failed=false
  dlc_require_jq || failed=true
  dlc_require_yq || failed=true
  if [ "$failed" = "true" ]; then
    exit 2
  fi
  return 0
}

# Attempt to install missing dependencies
# On macOS: tries brew install. Otherwise: prints manual instructions.
dlc_auto_install_deps() {
  local os
  os=$(uname -s 2>/dev/null || echo "Unknown")

  if [ "$os" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "ai-dlc: Attempting to install missing dependencies via Homebrew..." >&2
      local to_install=""
      command -v jq >/dev/null 2>&1 || to_install="jq"
      command -v yq >/dev/null 2>&1 || to_install="$to_install yq"
      if [ -n "$to_install" ]; then
        # shellcheck disable=SC2086
        brew install $to_install >&2
        return $?
      fi
      echo "ai-dlc: All dependencies already installed." >&2
      return 0
    else
      echo "ai-dlc: Homebrew not found. Install manually:" >&2
      echo "ai-dlc:   jq: https://jqlang.github.io/jq/download/" >&2
      echo "ai-dlc:   yq: https://github.com/mikefarah/yq#install" >&2
      return 1
    fi
  else
    echo "ai-dlc: Install dependencies manually:" >&2
    echo "ai-dlc:   jq: https://jqlang.github.io/jq/download/" >&2
    echo "ai-dlc:   yq: https://github.com/mikefarah/yq#install" >&2
    return 1
  fi
}
