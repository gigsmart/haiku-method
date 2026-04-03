---
title: Persistence
description: How H·AI·K·U stores work and delivers results — git and filesystem adapters
order: 33
---

H·AI·K·U uses **persistence adapters** to manage workspaces, save progress, create reviews, and deliver completed work. The adapter is declared by the studio, so different types of work use different storage strategies.

## Persistence Interface

Every adapter implements these operations:

| Operation | Description |
|-----------|-------------|
| `create_workspace` | Set up an isolated workspace for the intent |
| `save` | Persist current state (commit, snapshot, etc.) |
| `create_review` | Create a review artifact (PR, diff report, etc.) |
| `deliver` | Finalize and deliver the completed work |
| `cleanup` | Remove temporary resources after delivery |

## Git Adapter

Used by the **software studio** by default. Work happens in git branches and worktrees, and delivery is via pull request.

### How It Works

1. **create_workspace** — Creates a git branch (`haiku/{intent-slug}`) and a worktree (`.haiku/worktrees/{intent-slug}`) for isolated work
2. **save** — Commits changes to the intent branch with structured commit messages referencing the unit
3. **create_review** — Opens a pull request against the base branch with intent context and completion criteria summary
4. **deliver** — Merges the pull request (or marks it ready for human merge)
5. **cleanup** — Removes the worktree and cleans up temporary git state

### Branch Naming

```
haiku/{intent-slug}                    # Intent branch
haiku/{intent-slug}/{unit-slug}        # Unit worktree branch (merged into intent)
```

### Worktree Management

Each unit gets its own worktree for isolation. Worktrees are created in `.haiku/worktrees/` and cleaned up after delivery. Use `/haiku:cleanup` to remove orphaned worktrees.

### Configuration

The git adapter is selected automatically when the studio's persistence type is `git`:

```yaml
# STUDIO.md
persistence:
  type: git
  delivery: pull-request
```

## Filesystem Adapter

Used by the **ideation studio** by default. Work is stored as local files with version snapshots, and delivery is local (no git integration required).

### How It Works

1. **create_workspace** — Creates an intent directory under `.haiku/intents/{slug}/`
2. **save** — Copies current state to a timestamped snapshot in the intent directory
3. **create_review** — Generates a diff report between the current and previous snapshots
4. **deliver** — Marks the deliverable as final and copies to the output location
5. **cleanup** — Removes intermediate snapshots (preserves final deliverable)

### When to Use

The filesystem adapter is appropriate when:

- The project isn't in a git repository
- The work produces documents, research, or analysis (not code)
- Delivery is local consumption rather than merge/deploy
- You want to avoid git branch overhead for non-code work

### Configuration

```yaml
# STUDIO.md
persistence:
  type: filesystem
  delivery: local
```

## How Studios Declare Persistence

Each studio's `STUDIO.md` frontmatter includes a `persistence` block:

```yaml
persistence:
  type: git          # git | filesystem
  delivery: pull-request  # pull-request | local
```

The type determines which adapter is used. The delivery field describes how completed work reaches its audience.

## Custom Adapters

To create a custom persistence adapter for a custom studio:

1. Define the persistence type in your studio's `STUDIO.md`
2. Implement the adapter operations as shell functions in `.haiku/studios/{name}/persistence.sh`
3. Each function receives the intent slug and relevant context as arguments

Example skeleton:

```bash
#!/bin/bash
# .haiku/studios/my-studio/persistence.sh

my_studio_create_workspace() {
  local intent_slug="$1"
  # Create workspace...
}

my_studio_save() {
  local intent_slug="$1"
  # Save state...
}

my_studio_deliver() {
  local intent_slug="$1"
  # Deliver work...
}

my_studio_cleanup() {
  local intent_slug="$1"
  # Clean up...
}
```

## Next Steps

- [Studios](/docs/studios/) — Named lifecycle templates
- [Stages](/docs/stages/) — The stage-based model
- [Core Concepts](/docs/concepts/) — Intents, units, and bolts
