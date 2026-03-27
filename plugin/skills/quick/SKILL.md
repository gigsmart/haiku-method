---
description: Quick mode for small tasks — skip full elaboration/planning when the task is trivial
user-invocable: true
argument-hint: "<task description>"
---

# Quick Mode

You are running **Quick Mode** — a streamlined path for trivial tasks that skips full elaboration, discovery, and unit decomposition. The user has described a small task inline and you will execute it directly.

---

## When to Use

Tasks that would take a human less than a few minutes:
- Fix typos
- Rename a variable
- Add a missing import
- Update a config value
- Fix a lint error
- Adjust a constant or string literal

## When NOT to Use

Anything that needs planning, touches multiple subsystems, or involves architectural decisions. If you are unsure, tell the user and suggest `/elaborate` instead.

---

## Flow

### Step 1: Parse Task Description

The user invokes quick mode with an inline task description:

```
/quick fix the typo in README.md
/quick rename `oldVar` to `newVar` in src/utils.ts
/quick add missing `os` import in lib/config.sh
```

Extract the task description from the argument. If no argument was provided, ask the user what they need done (single question, not a multi-phase interview).

### Step 2: Pre-check — Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /quick cannot run in cowork mode."
  echo "Quick mode requires a full Claude Code CLI session with file system access."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately. Do NOT proceed.

### Step 3: Validate Scope

Before executing, do a quick sanity check:

1. **Read the relevant file(s)** mentioned in the task description.
2. **Confirm the change is trivial** — if the task turns out to require multi-file architectural changes, new test infrastructure, or design decisions, STOP and tell the user:
   > This task looks bigger than a quick fix. Consider using `/elaborate` for proper planning.
3. If the task is genuinely trivial, proceed.

### Step 4: Execute the Change

Make the change directly. No formal intent spec, no unit files, no worktree — just edit the file(s) in the current working directory.

**Guidelines:**
- Make the smallest correct change that satisfies the task description.
- Do NOT refactor surrounding code unless the task explicitly asks for it.
- Do NOT add new features beyond what was requested.
- Preserve existing code style and conventions.

### Step 5: Verify

Run a lightweight verification:

1. **If tests exist and are relevant:** run them and confirm they pass.
2. **If a linter/formatter is configured:** run it on the changed file(s).
3. **If neither applies:** review the diff to confirm no regressions (no syntax errors, no broken imports, no accidental deletions).

```bash
# Show the diff for review
git diff
```

If verification fails, fix the issue and re-verify. Do NOT leave broken code.

### Step 6: Commit

Stage and commit the change with a clear, conventional commit message:

```bash
git add <changed-files>
git commit -m "<type>: <concise description of the change>"
```

Use the appropriate conventional commit type (`fix`, `chore`, `docs`, `style`, `refactor`, etc.) based on what was changed.

### Step 7: Report

Output a brief summary:

```
## Quick Mode Complete

**Task:** <original task description>
**Changed:** <file(s) modified>
**Verification:** <tests passed | linter clean | diff reviewed>
```

Done. No follow-up phases, no elaboration artifacts, no state files.

---

## Guardrails

- **Single commit.** Quick mode produces exactly one commit. If the task needs multiple commits, it is not a quick task.
- **No state files.** Quick mode does NOT create `.ai-dlc/` directories, intent files, unit files, or any elaboration artifacts.
- **No worktrees.** Work happens in the current working directory on the current branch.
- **No subagents.** The current agent handles everything directly.
- **Scope escape hatch.** If at any point during execution you realize the task is not trivial, stop and recommend `/elaborate`. Do not silently expand scope.
