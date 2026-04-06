---
description: "Deprecated: git commits are now automatic — no manual cleanup needed"
disable-model-invocation: true
---

## Deprecation Notice

> **This command is deprecated.** Git commits are now handled automatically by the MCP server. Manual worktree cleanup is no longer needed.

`/haiku:cleanup` used to remove orphaned and merged H·AI·K·U worktrees. The new MCP-based workflow commits changes automatically and does not leave orphaned worktrees.

If you need to reset H·AI·K·U state, use `/haiku:reset` instead.
