#!/bin/bash
# git.sh — Git persistence adapter for H·AI·K·U
#
# Wraps git operations (branch, commit, merge, PR, worktree) behind the
# persistence interface. This adapter is used when studio persistence.type
# is "git" (the default for the software studio).
#
# All functions follow the naming convention: _persistence_git_<operation>

# Guard against double-sourcing
if [ -n "${_HKU_ADAPTER_GIT_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_ADAPTER_GIT_SOURCED=1

# ============================================================================
# Create Workspace
# ============================================================================

# Create workspace: branch + optional worktree
# Usage: _persistence_git_create_workspace <intent_slug> <studio_name> [--unit <unit_slug>]
_persistence_git_create_workspace() {
  local intent_slug="$1"
  local studio_name="$2"
  shift 2

  local unit_slug=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --unit) unit_slug="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local repo_root
  repo_root=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
  repo_root="${repo_root:-$(git rev-parse --show-toplevel 2>/dev/null)}"

  # Resolve default branch
  local default_branch
  default_branch=$(resolve_default_branch "auto" "$repo_root")

  if [ -n "$unit_slug" ]; then
    # Unit-level workspace
    local unit_branch="haiku/${intent_slug}/${unit_slug}"
    local unit_worktree="${repo_root}/.haiku/worktrees/${intent_slug}-${unit_slug}"

    mkdir -p "${repo_root}/.haiku/worktrees"
    git worktree add -B "$unit_branch" "$unit_worktree" "haiku/${intent_slug}/main" 2>/dev/null || true
  else
    # Intent-level workspace
    local intent_branch="haiku/${intent_slug}/main"
    local intent_worktree="${repo_root}/.haiku/worktrees/${intent_slug}"

    mkdir -p "${repo_root}/.haiku/worktrees"

    # Ensure .haiku/worktrees/ is gitignored (added to .gitignore, committed by user or next explicit commit)
    if ! grep -q '\.haiku/worktrees/' "${repo_root}/.gitignore" 2>/dev/null; then
      echo '.haiku/worktrees/' >> "${repo_root}/.gitignore"
      echo "haiku: added .haiku/worktrees/ to .gitignore (will be included in next commit)" >&2
    fi

    if [ ! -d "$intent_worktree" ]; then
      git worktree add -B "$intent_branch" "$intent_worktree" "$default_branch" 2>/dev/null || true
    fi

    # Also create the intent branch from current branch if no worktree needed
    if [ -z "$intent_worktree" ] || [ ! -d "$intent_worktree" ]; then
      git checkout -b "$intent_branch" 2>/dev/null || git checkout "$intent_branch" 2>/dev/null || true
    fi
  fi
}

# ============================================================================
# Save
# ============================================================================

# Save work: git add + commit
# Usage: _persistence_git_save <intent_slug> <message> [files...]
_persistence_git_save() {
  local intent_slug="$1"
  local message="$2"
  shift 2

  if [ $# -gt 0 ]; then
    # Add specific files
    git add "$@" 2>/dev/null || true
  else
    # Add all changes
    git add -A 2>/dev/null || true
  fi

  # Commit (allow empty commit to fail silently)
  git commit -m "$message" 2>/dev/null || true
}

# ============================================================================
# Create Review
# ============================================================================

# Create review: push + PR
# Usage: _persistence_git_create_review <intent_slug> <stage_name> <review_body> [--unit <unit_slug>]
_persistence_git_create_review() {
  local intent_slug="$1"
  local stage_name="$2"
  local review_body="$3"
  shift 3

  local unit_slug=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --unit) unit_slug="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local default_branch
  default_branch=$(resolve_default_branch "auto")

  if [ -n "$unit_slug" ]; then
    # Unit-level PR
    local unit_branch="haiku/${intent_slug}/${unit_slug}"
    git push -u origin "$unit_branch" 2>/dev/null || true

    gh pr create \
      --base "haiku/${intent_slug}/main" \
      --head "$unit_branch" \
      --title "unit: ${unit_slug}" \
      --body "$review_body" 2>&1 || echo "PR may already exist for $unit_branch"
  else
    # Intent-level PR
    local intent_branch="haiku/${intent_slug}/main"
    git push -u origin "$intent_branch" 2>/dev/null || true

    gh pr create \
      --base "$default_branch" \
      --head "$intent_branch" \
      --title "intent: ${intent_slug}" \
      --body "$review_body" 2>&1 || echo "PR may already exist for $intent_branch"
  fi
}

# ============================================================================
# Deliver
# ============================================================================

# Deliver: merge branch
# Usage: _persistence_git_deliver <intent_slug> [--unit <unit_slug>] [--squash]
_persistence_git_deliver() {
  local intent_slug="$1"
  shift

  local unit_slug=""
  local squash=false
  while [ $# -gt 0 ]; do
    case "$1" in
      --unit) unit_slug="$2"; shift 2 ;;
      --squash) squash=true; shift ;;
      *) shift ;;
    esac
  done

  local default_branch
  default_branch=$(resolve_default_branch "auto")

  if [ -n "$unit_slug" ]; then
    # Merge unit branch into intent branch
    local unit_branch="haiku/${intent_slug}/${unit_slug}"
    git checkout "haiku/${intent_slug}/main" 2>/dev/null || {
      echo "haiku: git adapter: failed to checkout haiku/${intent_slug}/main — aborting merge of ${unit_slug}" >&2
      return 1
    }

    if [ "$squash" = "true" ]; then
      git merge --squash "$unit_branch" 2>/dev/null || true
      git commit -m "unit: ${unit_slug} completed" 2>/dev/null || true
    else
      git merge --no-ff "$unit_branch" -m "Merge ${unit_slug} into intent branch" 2>/dev/null || true
    fi
  else
    # Merge intent branch into default branch
    local intent_branch="haiku/${intent_slug}/main"
    git checkout "$default_branch" 2>/dev/null || true

    if [ "$squash" = "true" ]; then
      git merge --squash "$intent_branch" 2>/dev/null || true
      git commit -m "intent: ${intent_slug} completed" 2>/dev/null || true
    else
      git merge --no-ff "$intent_branch" -m "Merge intent ${intent_slug}" 2>/dev/null || true
    fi
  fi
}

# ============================================================================
# Cleanup
# ============================================================================

# Cleanup: remove worktree + branch
# Usage: _persistence_git_cleanup <intent_slug> [--unit <unit_slug>]
_persistence_git_cleanup() {
  local intent_slug="$1"
  shift

  local unit_slug=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --unit) unit_slug="$2"; shift 2 ;;
      *) shift ;;
    esac
  done

  local repo_root
  repo_root=$(git worktree list --porcelain 2>/dev/null | head -1 | sed 's/^worktree //')
  repo_root="${repo_root:-$(git rev-parse --show-toplevel 2>/dev/null)}"

  if [ -n "$unit_slug" ]; then
    local unit_worktree="${repo_root}/.haiku/worktrees/${intent_slug}-${unit_slug}"
    local unit_branch="haiku/${intent_slug}/${unit_slug}"

    if [ -d "$unit_worktree" ]; then
      git worktree remove "$unit_worktree" 2>/dev/null || true
    fi
    git worktree prune 2>/dev/null || true
    git branch -d "$unit_branch" 2>/dev/null || true
  else
    local intent_worktree="${repo_root}/.haiku/worktrees/${intent_slug}"
    local intent_branch="haiku/${intent_slug}/main"

    if [ -d "$intent_worktree" ]; then
      git worktree remove "$intent_worktree" 2>/dev/null || true
    fi
    git worktree prune 2>/dev/null || true
    git branch -d "$intent_branch" 2>/dev/null || true
  fi
}

# ============================================================================
# Tracking & Sync
# ============================================================================

# Ensure remote tracking
# Usage: _persistence_git_ensure_tracking <intent_slug>
_persistence_git_ensure_tracking() {
  local intent_slug="$1"
  local intent_branch="haiku/${intent_slug}/main"

  if git remote get-url origin &>/dev/null; then
    git branch --set-upstream-to=origin/"$intent_branch" 2>/dev/null || true
    git push -u origin "$intent_branch" 2>/dev/null || true
  fi
}

# Pull latest
# Usage: _persistence_git_sync <intent_slug>
_persistence_git_sync() {
  local intent_slug="$1"

  if git remote get-url origin &>/dev/null; then
    git pull --rebase 2>/dev/null || true
  fi
}
