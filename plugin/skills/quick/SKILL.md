---
name: quick
description: Quick mode for small tasks — skip full elaboration when the task is trivial
---

# Quick Mode

For trivial tasks (fix typos, rename variables, update configs, small refactors touching 1-2 files). If the task is bigger, recommend `/haiku:start` instead.

## Process

1. **Pre-checks:** Reject cowork mode, check for active intent conflicts, validate scope is truly trivial
2. **Create temporary artifacts** in `.haiku/quick/` (gitignored, for hook integration)
3. **Run hat loop** for the specified stage (default: development):
   - Resolve hat sequence from stage definition
   - Each hat runs as a subagent with hat-specific instructions
   - Reviewer rejection loops back to builder (max 3 cycles)
4. **Pre-delivery review** via `/haiku:review`
5. **Create PR** (always delivers via PR, even for small tasks)
6. **Cleanup:** Remove `.haiku/quick/` artifacts

## Guardrails

- MUST NOT create worktrees — work in current directory
- MUST refuse if another active intent exists
- MUST stop and recommend `/haiku:start` if task is not trivial
- 3-cycle review limit — escalate if exceeded
- Single session — no resume capability
