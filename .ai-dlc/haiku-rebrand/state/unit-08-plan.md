# Unit 08: Persistence Abstraction — Implementation Plan

## Summary

Create a persistence abstraction layer (`plugin/lib/persistence.sh`) with a dispatch mechanism that routes to adapter implementations based on the active studio's `persistence.type` field. Implement two adapters: `git.sh` (wrapping existing git operations) and `filesystem.sh` (fallback for non-git projects). Update the orchestrator to use persistence functions for output persistence, and update SKILL.md agent instructions to reference persistence helpers instead of inline git commands.

## Architecture

```
plugin/lib/persistence.sh          ← Interface + dispatch
plugin/lib/adapters/git.sh         ← Git adapter (wraps existing operations)
plugin/lib/adapters/filesystem.sh  ← Filesystem adapter (fallback)
plugin/lib/orchestrator.sh         ← Sources persistence.sh, uses it in hku_persist_stage_outputs
plugin/lib/studio.sh               ← Already reads persistence.type from STUDIO.md (no changes)
plugin/studios/software/STUDIO.md  ← Already has persistence: {type: git} (no changes)
plugin/studios/ideation/STUDIO.md  ← Already has persistence: {type: filesystem} (no changes)
```

## Trace of Existing Git Operations

All git calls live in SKILL.md files (agent instructions) and hooks, NOT in orchestrator.sh. The orchestrator has zero direct git calls today. Key locations:

| Category | File | Operations |
|---|---|---|
| Workspace creation | `new/SKILL.md` Step 8 | `git checkout -b`, `git add`, `git commit` |
| Workspace creation | `execute/SKILL.md` Step 0 | `git worktree add -B`, mkdir worktrees dir, gitignore update |
| Workspace creation | `execute/SKILL.md` Step 5a | `git worktree add -B` (unit-level worktree) |
| Save/commit | `execute/SKILL.md` Steps 5a-7 | ~15 `git add` + `git commit` pairs for status/hat changes |
| Save/commit | `run/SKILL.md` Step 5 | `git add` + `git commit` for stage results |
| Save/commit | `advance/SKILL.md` | ~10 `git add` + `git commit` pairs |
| Save/commit | `fail/SKILL.md` | `git add -A` + `git commit` |
| Remote tracking | `execute/SKILL.md` Step 0b | `git branch --set-upstream-to`, `git pull --rebase`, `git push -u` |
| PR creation | `execute/SKILL.md` Step 8b | `gh pr create` (unit-level PR) |
| PR creation | `advance/SKILL.md` Step 7 | `gh pr create` (unit + intent PRs) |
| Delivery/merge | `execute/SKILL.md` Step 8c | `git merge --squash` / `--no-ff` |
| Delivery/merge | `advance/SKILL.md` Steps 7-8 | `git merge --squash` / `--no-ff`, `git checkout` |
| Cleanup | `execute/SKILL.md` Step 8c | `git worktree remove`, `git worktree prune` |
| Cleanup | `advance/SKILL.md` Steps 7-8 | `git worktree remove`, `git worktree prune`, `git branch -d` |
| Cleanup | `cleanup/SKILL.md` | `git worktree remove`, `git branch -d`, `git worktree prune` |
| Reconciliation | `inject-context.sh` L128-167 | `git add` + `git commit` for post-merge reconciliation |
| Reconciliation | `enforce-iteration.sh` L142-143 | `git add` + `git commit` for auto-reconciliation |

## Implementation Steps

### Step 1: Create `plugin/lib/persistence.sh` — Interface + Dispatch

Create the persistence interface with five public functions and the dispatch mechanism.

**Functions:**
- `persistence_create_workspace <intent_slug> <studio_name>` — Create workspace (branch/worktree or directory)
- `persistence_save <intent_slug> <message> [files...]` — Save work (commit or snapshot)
- `persistence_create_review <intent_slug> <stage_name> <review_body>` — Create review artifact (PR or file)
- `persistence_deliver <intent_slug>` — Deliver completed work (merge or move)
- `persistence_cleanup <intent_slug>` — Clean up workspace (remove worktree/branch or archive)

**Additional helpers (git-specific but useful for both):**
- `persistence_ensure_tracking <intent_slug>` — Ensure remote tracking (git: push -u; filesystem: no-op)
- `persistence_sync <intent_slug>` — Pull latest (git: pull --rebase; filesystem: no-op)

**Dispatch:**
```bash
_persistence_dispatch() {
  local operation="$1"; shift
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
```

**Adapter type resolution:** Read `persistence.type` from the active studio's STUDIO.md via `hku_load_studio_metadata`. Default to `git` if not set. The `_persistence_get_adapter_type` function accepts an optional intent file parameter for context-specific resolution.

**Source chain:** persistence.sh sources `config.sh` (for `find_repo_root`), `studio.sh` (for `hku_get_active_studio`, `hku_load_studio_metadata`), and `parse.sh` (for frontmatter access). These are already sourced by orchestrator.sh, so the double-source guards will prevent redundant loading.

### Step 2: Create `plugin/lib/adapters/` directory

```bash
mkdir -p plugin/lib/adapters
```

### Step 3: Create `plugin/lib/adapters/git.sh` — Git Adapter

Wraps all existing git operations. Each function maps to one of the 5 persistence operations.

**`_persistence_git_create_workspace`**
- Parameters: `<intent_slug> <studio_name> [--unit <unit_slug>]`
- For intents: Create branch `haiku/{slug}`, optionally set up worktree at `.haiku/worktrees/{slug}`
- For units (when `--unit` flag present): Create unit branch `haiku/{intent_slug}/{unit_slug}` and worktree
- Handles: gitignore entry for `.haiku/worktrees/`, default branch resolution, `git worktree add -B`
- Sources config.sh for `resolve_default_branch`

**`_persistence_git_save`**
- Parameters: `<intent_slug> <message> [files...]`
- If files provided: `git add <files...>` + `git commit -m "<message>"`
- If no files: `git add -A` + `git commit -m "<message>"` (for broader saves like fail/SKILL.md)
- Handles: empty commit case gracefully (no error if nothing to commit)

**`_persistence_git_create_review`**
- Parameters: `<intent_slug> <stage_name> <review_body> [--unit <unit_slug>]`
- For units: `gh pr create --base haiku/{intent_slug}/main --head haiku/{intent_slug}/{unit_slug}`
- For intents: `gh pr create --base {default_branch} --head haiku/{intent_slug}/main`
- Includes: push to remote first (`git push -u origin <branch>`)
- Returns: PR URL

**`_persistence_git_deliver`**
- Parameters: `<intent_slug> [--unit <unit_slug>] [--squash]`
- For units: checkout intent branch, merge unit branch (squash or no-ff based on config)
- For intents: checkout default branch, merge intent branch
- Handles: auto_squash config setting

**`_persistence_git_cleanup`**
- Parameters: `<intent_slug> [--unit <unit_slug>]`
- Remove worktree: `git worktree remove <path>`
- Prune: `git worktree prune`
- Delete branch: `git branch -d <branch>`

**`_persistence_git_ensure_tracking`**
- Parameters: `<intent_slug>`
- `git branch --set-upstream-to=origin/<branch>`
- `git push -u origin <branch>`

**`_persistence_git_sync`**
- Parameters: `<intent_slug>`
- `git pull --rebase`

### Step 4: Create `plugin/lib/adapters/filesystem.sh` — Filesystem Adapter

Minimal adapter for non-git projects (ideation studio, content creation).

**`_persistence_filesystem_create_workspace`**
- Create `.haiku/intents/{slug}/workspace/` and `.haiku/intents/{slug}/versions/`
- No branching or worktrees

**`_persistence_filesystem_save`**
- Create timestamped snapshot: `.haiku/intents/{slug}/versions/{YYYYMMDD-HHMMSS}/`
- Copy workspace contents into snapshot directory
- Write `COMMIT_MSG` file with the message

**`_persistence_filesystem_create_review`**
- Write review summary to `.haiku/intents/{slug}/reviews/{stage_name}-review.md`

**`_persistence_filesystem_deliver`**
- Move workspace to `.haiku/intents/{slug}/delivered/`

**`_persistence_filesystem_cleanup`**
- Archive or remove the intent directory (with confirmation prompt)

**`_persistence_filesystem_ensure_tracking`** — No-op (return 0)

**`_persistence_filesystem_sync`** — No-op (return 0)

### Step 5: Update `plugin/lib/orchestrator.sh`

**Changes:**
1. Add `source "$ORCHESTRATOR_SCRIPT_DIR/persistence.sh"` after existing source lines
2. Update `hku_persist_stage_outputs` to call `persistence_save` after creating directory structure:

```bash
# After output dirs are created, save via persistence
persistence_save "$slug" "haiku: persist stage outputs — ${stage_name}" \
  "${intent_dir}/stages/${stage_name}/" \
  "${intent_dir}/knowledge/" 2>/dev/null || true
```

This is the only orchestrator change — the orchestrator already delegates most git work to SKILL.md agent instructions.

### Step 6: Update SKILL.md Agent Instructions

These files are agent instructions (not executed shell). Update them to reference persistence functions instead of inline git commands. This is a find-and-replace effort in the bash code blocks within each SKILL.md.

**`plugin/skills/start/SKILL.md` — Step 8 (Git Setup)**

Replace:
```bash
git checkout -b haiku/{slug}
git add .haiku/intents/{slug}/
git commit -m "haiku: new intent — {slug}"
```

With:
```bash
source "$CLAUDE_PLUGIN_ROOT/lib/persistence.sh"
persistence_create_workspace "{slug}" "{studio_name}"
persistence_save "{slug}" "haiku: new intent — {slug}" ".haiku/intents/{slug}/"
```

**`plugin/skills/run/SKILL.md` — Step 5 (Commit stage results)**

Replace:
```bash
git add .haiku/intents/{slug}/stages/{stage_name}/
git commit -m "haiku: complete stage — {stage_name}"
```

With:
```bash
source "$CLAUDE_PLUGIN_ROOT/lib/persistence.sh"
persistence_save "{slug}" "haiku: complete stage — {stage_name}" ".haiku/intents/{slug}/stages/{stage_name}/"
```

**`plugin/skills/execute/SKILL.md`** — Multiple locations:

1. **Step 0 (worktree setup):** Replace `git worktree add -B` with `persistence_create_workspace` call
2. **Step 0b (remote tracking):** Replace `git push -u` / `git pull --rebase` with `persistence_ensure_tracking` + `persistence_sync`
3. **Step 5a (unit worktree):** Replace `git worktree add -B` with `persistence_create_workspace --unit`
4. **Status commits throughout:** Replace `git add` + `git commit` with `persistence_save`
5. **Step 8b (PR creation):** Replace `gh pr create` with `persistence_create_review`
6. **Step 8c (merge + cleanup):** Replace `git merge` + `git worktree remove` with `persistence_deliver` + `persistence_cleanup`

**`plugin/skills/execute/subskills/advance/SKILL.md`** — Multiple locations:

1. **Status commits:** Replace with `persistence_save`
2. **PR creation (Step 7):** Replace with `persistence_create_review`
3. **Merge (Steps 7-8):** Replace with `persistence_deliver`
4. **Worktree cleanup:** Replace with `persistence_cleanup`

**`plugin/skills/execute/subskills/fail/SKILL.md`:**

Replace `git add -A && git commit` with `persistence_save`

**`plugin/skills/cleanup/SKILL.md`:**

Replace `git worktree remove`, `git branch -d`, `git worktree prune` with `persistence_cleanup` calls.

### Step 7: Update Hooks (if in scope)

The hooks have a few git operations that could use persistence:

- `inject-context.sh` L163-164: Post-merge reconciliation `git add` + `git commit` → `persistence_save`
- `enforce-iteration.sh` L142-143: Auto-reconciliation `git add` + `git commit` → `persistence_save`

**Note:** Hooks run in shell directly (not as agent instructions), so they would need to source persistence.sh. This is straightforward since they already source other libs. However, hooks are git-aware by nature (they detect branch state), so the persistence abstraction here is lower priority. Consider wrapping only the `git add` + `git commit` pairs (save operations) and leaving the branch detection as-is.

### Step 8: Verify Success Criteria

Run through each criterion:

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

## Execution Order

| Step | Files | Dependency |
|---|---|---|
| 1 | `plugin/lib/persistence.sh` | None |
| 2 | `plugin/lib/adapters/` (dir) | None |
| 3 | `plugin/lib/adapters/git.sh` | Step 1 (interface contract) |
| 4 | `plugin/lib/adapters/filesystem.sh` | Step 1 (interface contract) |
| 5 | `plugin/lib/orchestrator.sh` | Steps 1-4 |
| 6a | `plugin/skills/start/SKILL.md` | Step 1 |
| 6b | `plugin/skills/run/SKILL.md` | Step 1 |
| 6c | `plugin/skills/execute/SKILL.md` | Steps 1, 3 |
| 6d | `plugin/skills/execute/subskills/advance/SKILL.md` | Steps 1, 3 |
| 6e | `plugin/skills/execute/subskills/fail/SKILL.md` | Step 1 |
| 6f | `plugin/skills/cleanup/SKILL.md` | Steps 1, 3 |
| 7 | `plugin/hooks/inject-context.sh`, `enforce-iteration.sh` | Step 1 |
| 8 | Verification | All above |

Steps 3 and 4 can be done in parallel. Steps 6a-6f can be done in parallel. Step 7 is optional/low-priority.

## Risks & Mitigations

1. **Git operation surface area is large** — The execute/SKILL.md alone has ~30 distinct git calls. Mitigation: The git adapter wraps categories of operations (save, create_workspace, etc.), not individual git commands. Each adapter function handles the full sequence internally.

2. **SKILL.md files are agent instructions, not executed code** — Changing bash snippets in SKILL.md changes how agents behave. Mitigation: Keep changes minimal — replace `git add` + `git commit` pairs with `persistence_save` calls while preserving surrounding logic.

3. **Adapter contract drift** — Filesystem adapter has simpler semantics than git. Mitigation: Document the contract explicitly in persistence.sh header comments. The filesystem adapter should succeed silently for operations that don't apply (e.g., `ensure_tracking` is a no-op).

4. **Performance** — One extra `source` per first call. Mitigation: The `_HKU_ADAPTER_SOURCED` guard prevents re-sourcing. Negligible overhead.

## Out of Scope

- Future adapters (notion.sh, gdocs.sh, cad.sh)
- Modifying the stage loop logic (unit-06)
- Creating new stage definitions (unit-05)
- Deployment configuration (unit-09)
- Changes to the website or paper (this is purely a plugin/backend change)
