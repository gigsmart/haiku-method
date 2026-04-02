---
status: pending
last_updated: ""
depends_on: [unit-04-studio-infrastructure, unit-06-stage-orchestrator]
branch: ai-dlc/haiku-rebrand/08-persistence-abstraction
discipline: backend
stage: ""
workflow: ""
ticket: ""
---

# unit-08-persistence-abstraction

## Description

Create the persistence abstraction layer that makes H·AI·K·U work beyond git-based projects. Define a persistence interface, implement the git adapter (wrapping existing operations), and implement a filesystem adapter as fallback. The studio's STUDIO.md declares which adapter to use.

## Discipline

backend - Shell library interface, adapter implementations, and studio integration.

## Domain Entities

- `plugin/lib/persistence.sh` — persistence interface (dispatch to adapters)
- `plugin/lib/adapters/git.sh` — git persistence adapter
- `plugin/lib/adapters/filesystem.sh` — filesystem persistence adapter (fallback)
- `plugin/studios/*/STUDIO.md` — `persistence:` field in studio definitions
- `plugin/lib/orchestrator.sh` — stage orchestrator calls persistence interface

## Technical Specification

### Persistence Interface (`plugin/lib/persistence.sh`)

The interface defines five operations that every adapter must implement:

```bash
# Create a workspace for a new intent
# Git: create branch, set up worktree
# Filesystem: create directory structure
persistence_create_workspace() {
  local intent_slug="$1"
  local studio_name="$2"
  _persistence_dispatch "create_workspace" "$@"
}

# Save work (checkpoint)
# Git: stage + commit
# Filesystem: copy to versioned directory / timestamp
persistence_save() {
  local intent_slug="$1"
  local message="$2"
  _persistence_dispatch "save" "$@"
}

# Create a review artifact
# Git: create pull request / draft PR
# Filesystem: create review summary file
persistence_create_review() {
  local intent_slug="$1"
  local stage_name="$2"
  local review_body="$3"
  _persistence_dispatch "create_review" "$@"
}

# Deliver completed work
# Git: merge PR, clean up branch
# Filesystem: move to "delivered" directory
persistence_deliver() {
  local intent_slug="$1"
  _persistence_dispatch "deliver" "$@"
}

# Clean up workspace after delivery
# Git: delete branch, remove worktree
# Filesystem: archive or delete working directory
persistence_cleanup() {
  local intent_slug="$1"
  _persistence_dispatch "cleanup" "$@"
}
```

Dispatch function:

```bash
# Guard variable: tracks which adapter is currently sourced (avoids re-sourcing on every call)
_HKU_ADAPTER_SOURCED=""

# Internal: resolve and call the adapter for the active studio
_persistence_dispatch() {
  local operation="$1"
  shift
  local adapter_type
  adapter_type=$(_persistence_get_adapter_type)
  local adapter_file="${CLAUDE_PLUGIN_ROOT}/lib/adapters/${adapter_type}.sh"

  if [[ ! -f "$adapter_file" ]]; then
    echo "haiku: unknown persistence adapter: ${adapter_type}" >&2
    return 1
  fi

  if [[ "$_HKU_ADAPTER_SOURCED" != "$adapter_type" ]]; then
    source "$adapter_file" || return 1
    _HKU_ADAPTER_SOURCED="$adapter_type"
  fi
  "_persistence_${adapter_type}_${operation}" "$@"
}

# Get the adapter type from the active studio
_persistence_get_adapter_type() {
  local studio_name
  studio_name=$(hku_get_active_studio)
  local studio_file
  studio_file=$(hku_resolve_studio "$studio_name")
  hku_frontmatter_get "$studio_file" "persistence.type" "git"
}
```

### Git Adapter (`plugin/lib/adapters/git.sh`)

Wraps all existing git operations from the current codebase into the persistence interface:

```bash
_persistence_git_create_workspace() {
  local intent_slug="$1"
  local studio_name="$2"
  # Create branch: haiku/{intent_slug}/main
  # Set up worktree (if configured)
  # Initialize .haiku/intents/{intent_slug}/ directory
  # Existing logic from execute/SKILL.md and inject-context.sh
}

_persistence_git_save() {
  local intent_slug="$1"
  local message="$2"
  # git add + commit with message
  # Existing logic from builder hat / execute loop
}

_persistence_git_create_review() {
  local intent_slug="$1"
  local stage_name="$2"
  local review_body="$3"
  # Create PR (or update existing PR) via gh CLI
  # Include stage name in PR title/description
  # Existing logic from execute delivery phase
}

_persistence_git_deliver() {
  local intent_slug="$1"
  # Merge PR (if auto_merge enabled)
  # Or mark as ready for merge
  # Existing logic from execute delivery
}

_persistence_git_cleanup() {
  local intent_slug="$1"
  # Delete branch
  # Remove worktree (if used)
  # Archive intent artifacts
  # Existing logic from cleanup/SKILL.md
}
```

### Filesystem Adapter (`plugin/lib/adapters/filesystem.sh`)

Minimal adapter for non-git projects (content creation, research, etc.):

```bash
_persistence_filesystem_create_workspace() {
  local intent_slug="$1"
  local studio_name="$2"
  # Create .haiku/intents/{intent_slug}/ directory
  # Create workspace directory for deliverables
  mkdir -p ".haiku/intents/${intent_slug}/workspace"
  mkdir -p ".haiku/intents/${intent_slug}/versions"
}

_persistence_filesystem_save() {
  local intent_slug="$1"
  local message="$2"
  # Create timestamped snapshot in versions/
  local version_dir=".haiku/intents/${intent_slug}/versions/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$version_dir"
  cp -r ".haiku/intents/${intent_slug}/workspace/." "$version_dir/"
  echo "$message" > "${version_dir}/COMMIT_MSG"
}

_persistence_filesystem_create_review() {
  local intent_slug="$1"
  local stage_name="$2"
  local review_body="$3"
  # Write review summary to file
  mkdir -p ".haiku/intents/${intent_slug}/reviews"
  echo "$review_body" > ".haiku/intents/${intent_slug}/reviews/${stage_name}-review.md"
}

_persistence_filesystem_deliver() {
  local intent_slug="$1"
  # Move workspace to delivered/
  mv ".haiku/intents/${intent_slug}/workspace" ".haiku/intents/${intent_slug}/delivered"
}

_persistence_filesystem_cleanup() {
  local intent_slug="$1"
  # Archive the intent directory
  # Or delete if user confirms
}
```

### Studio Integration

The STUDIO.md `persistence:` field tells the orchestrator which adapter to use:

```yaml
# Software studio (git-backed)
persistence:
  type: git
  delivery: pull-request

# Ideation studio (filesystem-backed)
persistence:
  type: filesystem
  delivery: local
```

The orchestrator calls `persistence_*` functions instead of directly invoking git commands. This means:

1. `/haiku:new` calls `persistence_create_workspace` instead of `git checkout -b`
2. The build phase calls `persistence_save` instead of `git add && git commit`
3. The review gate calls `persistence_create_review` instead of `gh pr create`
4. Delivery calls `persistence_deliver` instead of `gh pr merge`
5. Cleanup calls `persistence_cleanup` instead of `git branch -D`

### Existing Code Migration

Identify all direct git calls in the orchestrator / execute path and route through persistence:

| Current Location | Current Code | Persistence Call |
|-----------------|-------------|------------------|
| execute/SKILL.md branch creation | `git checkout -b` | `persistence_create_workspace` |
| builder hat commits | `git add && git commit` | `persistence_save` |
| execute delivery PR creation | `gh pr create` | `persistence_create_review` |
| execute delivery merge | `gh pr merge` | `persistence_deliver` |
| cleanup/SKILL.md | `git branch -D` | `persistence_cleanup` |
| inject-context.sh worktree setup | `git worktree add` | `persistence_create_workspace` (worktree variant) |

### Future Adapters (Not in Scope)

The interface supports but this unit does NOT implement:
- `notion.sh` — Notion API persistence for content/marketing studios
- `gdocs.sh` — Google Docs persistence
- `cad.sh` — CAD file versioning for hardware studios

These can be added by dropping an adapter file in `plugin/lib/adapters/` and referencing it in a studio's `persistence.type`.

## Success Criteria

- [ ] `plugin/lib/persistence.sh` exists with all 5 interface functions
- [ ] `_persistence_dispatch` correctly resolves adapter from active studio
- [ ] `plugin/lib/adapters/git.sh` exists and wraps all existing git operations
- [ ] `plugin/lib/adapters/filesystem.sh` exists as a working fallback adapter
- [ ] Git adapter's `create_workspace` creates branches and worktrees correctly
- [ ] Git adapter's `save` does `git add + commit`
- [ ] Git adapter's `create_review` creates PRs via `gh`
- [ ] Git adapter's `deliver` merges or marks PRs ready
- [ ] Git adapter's `cleanup` removes branches and worktrees
- [ ] Filesystem adapter creates versioned snapshots on `save`
- [ ] Studio STUDIO.md `persistence:` field is read correctly
- [ ] Software studio uses git adapter by default
- [ ] Ideation studio uses filesystem adapter by default
- [ ] No direct git calls remain in the orchestrator (all through persistence interface)
- [ ] Existing git-based workflow is functionally identical after the abstraction

## Risks

- **Git operation surface area**: The existing codebase has many subtle git operations (worktree management, branch naming, remote tracking). Wrapping all of them requires tracing every git call in the execute path. Mitigation: trace execution paths end-to-end, not just grep for `git`.
- **Adapter contract drift**: If adapters don't implement the same semantics, studio switching could break. Mitigation: document the contract explicitly and test each adapter independently.
- **Performance**: Adding a dispatch layer adds function call overhead. Mitigation: the overhead is negligible — one extra `source` per operation.

## Boundaries

This unit creates the persistence abstraction and two adapters. It does NOT modify the orchestrator's stage loop logic (unit-06), create stage definitions (unit-05), or handle deployment (unit-09). It assumes the orchestrator already exists and is ready to call persistence functions.
