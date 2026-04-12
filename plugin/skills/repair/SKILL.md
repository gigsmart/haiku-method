---
name: repair
description: Scan intents for metadata issues, auto-apply safe fixes, push to all intent branches, and open PRs for merged branches
---

# Repair

Call `haiku_repair` to scan intents for metadata issues. The MCP tool auto-applies the fixes it can do mechanically; remaining issues need agent or user attention.

## Default Behavior (Git Repo)

In a git repository, `haiku_repair` (with no arguments) scans **every** intent branch (`haiku/<slug>/main`) sequentially via temporary worktrees. For each branch:

1. Scans the intent for metadata issues
2. Auto-applies safe fixes (title trim, legacy field rename, missing-field defaults, studio alias migration)
3. Commits the fixes with a `repair: ...` message
4. Pushes the commit to `origin/<branch>`
5. If the branch was already merged into mainline (`main` or `master`), opens a PR/MR back to mainline carrying the repair commit
6. Reports any remaining issues that need agent attention

The loop is sequential because some fixes may require user input — the agent processes branches one at a time and can pause for interaction.

## Args

- `intent: <slug>` — repair a single intent in the current working directory only (skips multi-branch mode)
- `apply: false` — scan without applying fixes (returns the issue report only)
- `skip_branches: true` — force cwd-only mode even in a git repo

## Auto-Applied Fixes (Mechanical)

The MCP tool applies these without asking — they have no judgment component:

- **Overlong/multiline titles** — trimmed to a one-liner using `deriveIntentTitle`; the full original description is preserved as a paragraph in the body
- **Legacy `created` field** → renamed to `created_at`
- **Missing `created_at`** — defaulted from file mtime
- **Missing `mode`** — defaulted to `continuous`
- **Stages mismatch** — updated to match the studio's stage definition
- **Legacy `studio: software`** → migrated to `application-development` (the canonical name); aliases continue to resolve

## Issues Returned to Agent (Need Judgment)

These come back as remaining issues — handle them interactively:

- **Missing `studio`** — needs the user to pick one
- **Missing `status`** — needs to be inferred from state files or asked
- **Invalid `active_stage`** — needs review of stage progression
- **Stage `state.json` invalid status** — needs the right status set
- **Unit filename pattern violations** — rename units explicitly
- **Unit missing `inputs:`** — declare upstream artifact paths

## Workflow

1. Call `haiku_repair` (no args) — scans every branch, applies what it can, pushes, opens PRs
2. Read the multi-branch report
3. For each branch with **remaining issues**, address them in the worktree path noted in the report (or check out the branch locally)
4. Commit your manual fixes and push
5. If a branch is now clean and was already merged, open a PR/MR back to mainline manually

## Checks Performed

- Missing/invalid intent fields (title, studio, stages, status, mode)
- Overlong / multiline titles (titles must be ≤80 chars, single line)
- Stage state consistency and active_stage validity
- Unit file naming convention (`unit-NN-slug.md`)
- Unit required fields (type, status)
- **Unit inputs validation** — every unit must have a non-empty `inputs:` field declaring upstream artifacts it references. Units without inputs will block execution.
