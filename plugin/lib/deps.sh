#!/bin/bash
# deps.sh — Dependency validation for H·AI·K·U
#
# Validates that jq and yq (mikefarah/Go variant) are installed.
# Provides entry-point guard for hooks and guided installation.
#
# Usage:
#   source deps.sh
#   hku_check_deps   # exits 2 on failure, returns 0 silently on success

# Guard against double-sourcing
if [ -n "${_HKU_DEPS_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_DEPS_SOURCED=1

# Check that jq is installed
# Returns 0 on success, 1 on failure (prints instructions to stderr)
hku_require_jq() {
  if command -v jq >/dev/null 2>&1; then
    return 0
  fi
  echo "haiku: 'jq' is required but not found in PATH." >&2
  echo "haiku: Install jq:" >&2
  echo "haiku:   macOS:  brew install jq" >&2
  echo "haiku:   Debian: sudo apt-get install jq" >&2
  echo "haiku:   Other:  https://jqlang.github.io/jq/download/" >&2
  return 1
}

# Check that yq (mikefarah/Go variant) is installed
# Returns 0 on success, 1 on failure (prints instructions to stderr)
hku_require_yq() {
  if ! command -v yq >/dev/null 2>&1; then
    echo "haiku: 'yq' is required but not found in PATH." >&2
    echo "haiku: Install yq (mikefarah/Go variant):" >&2
    echo "haiku:   macOS:  brew install yq" >&2
    echo "haiku:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  # Verify it's the mikefarah variant (not kislyuk/Python)
  local yq_version
  yq_version=$(yq --version 2>&1 || echo "")
  if [[ "$yq_version" == *"kislyuk"* ]] || [[ "$yq_version" == *"xq"* ]]; then
    echo "haiku: Found Python yq (kislyuk). H·AI·K·U requires mikefarah/yq (Go variant)." >&2
    echo "haiku: Install the correct yq:" >&2
    echo "haiku:   macOS:  brew install yq" >&2
    echo "haiku:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  if [[ "$yq_version" != *"mikefarah"* ]] && [[ "$yq_version" != *"yq ("* ]]; then
    echo "haiku: Unable to verify yq variant. H·AI·K·U requires mikefarah/yq (Go variant v4+)." >&2
    echo "haiku: Found: $yq_version" >&2
    echo "haiku: Install the correct yq:" >&2
    echo "haiku:   macOS:  brew install yq" >&2
    echo "haiku:   Linux:  https://github.com/mikefarah/yq#install" >&2
    return 1
  fi

  return 0
}

# Check both jq and yq — exit 2 on failure, return 0 silently on success
# Intended as an entry-point guard for hooks.
hku_check_deps() {
  local failed=false
  hku_require_jq || failed=true
  hku_require_yq || failed=true
  if [ "$failed" = "true" ]; then
    exit 2
  fi
  return 0
}

# Attempt to install missing dependencies
# On macOS: tries brew install. Otherwise: prints manual instructions.
hku_auto_install_deps() {
  local os
  os=$(uname -s 2>/dev/null || echo "Unknown")

  if [ "$os" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      echo "haiku: Attempting to install missing dependencies via Homebrew..." >&2
      local to_install=""
      command -v jq >/dev/null 2>&1 || to_install="jq"
      command -v yq >/dev/null 2>&1 || to_install="$to_install yq"
      if [ -n "$to_install" ]; then
        # shellcheck disable=SC2086
        brew install $to_install >&2
        return $?
      fi
      echo "haiku: All dependencies already installed." >&2
      return 0
    else
      echo "haiku: Homebrew not found. Install manually:" >&2
      echo "haiku:   jq: https://jqlang.github.io/jq/download/" >&2
      echo "haiku:   yq: https://github.com/mikefarah/yq#install" >&2
      return 1
    fi
  else
    echo "haiku: Install dependencies manually:" >&2
    echo "haiku:   jq: https://jqlang.github.io/jq/download/" >&2
    echo "haiku:   yq: https://github.com/mikefarah/yq#install" >&2
    return 1
  fi
}
