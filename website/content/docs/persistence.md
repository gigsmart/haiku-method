---
title: Persistence
description: How H·AI·K·U stores work and delivers results — automatic environment detection
order: 33
---

H·AI·K·U automatically detects the environment and chooses the appropriate persistence strategy. If you're in a git repository, state changes are committed and pushed. If not, state lives as files on disk. Studios don't configure persistence — it's environment-driven.

## How It Works

On startup, the MCP runs `git rev-parse --git-dir` to detect whether the current directory is inside a git repository. The result is cached for the session.

| Environment | Behavior |
|-------------|----------|
| Git repository | Commit + push after every state change, branch isolation for intents and units |
| No git | Files on disk in `.haiku/`, no version control, units work in-place |

## Git Mode

When running inside a git repository, every lifecycle state change triggers:

1. `git add .haiku/` — stage the state changes
2. `git commit` — atomic state snapshot
3. `git push` — sync to remote (push failures are non-fatal)

### Branch Naming

```
haiku/{intent-slug}/main              # Intent branch (pushed)
haiku/{intent-slug}/{unit-slug}       # Unit worktree branch (local only, merged into intent)
```

### Worktree Management

Each unit gets its own worktree for isolation. Worktrees are created in `.haiku/worktrees/` and cleaned up after delivery. Unit branches are never pushed — only the intent branch goes to remote.

### Pull Request Delivery

At intent completion, H·AI·K·U can create a PR from the intent branch to the default branch (configurable via `providers.git.config` in `.haiku/settings.yml`).

### Configuration

Git provider settings live in `.haiku/settings.yml`:

```yaml
providers:
  git:
    config:
      auto_push: true       # Push after every commit (default: true)
      auto_pr: true          # Create PR at intent completion (default: true)
      default_branch: main   # Base branch for PRs
      remote: origin         # Git remote name
```

## Filesystem Mode

When not in a git repository, H·AI·K·U stores all state as files in `.haiku/intents/{slug}/`:

- No commits, pushes, branches, or worktrees
- Units work in-place in the main tree
- All lifecycle operations still function — elaborate, execute, review, gate
- Delivery is local (no PR creation)

This is appropriate when:

- The project isn't in a git repository
- The work produces documents, research, or analysis (not code)
- You want to try H·AI·K·U without git setup

## Next Steps

- [Studios](/docs/studios/) — Named lifecycle templates
- [Stages](/docs/stages/) — The stage-based model
- [Core Concepts](/docs/concepts/) — Intents, units, and bolts
