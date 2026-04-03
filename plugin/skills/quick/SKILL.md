---
description: Quick mode for small tasks — skip full elaboration/planning when the task is trivial
user-invocable: true
argument-hint: "[stage-name] <task description>"
---

# Quick Mode

You are running **Quick Mode** — a streamlined path for trivial tasks that skips full elaboration and unit decomposition. The user has described a small task inline and you will execute it through a stage-based hat sequence using subagents, producing disciplined work without the overhead of full `/haiku:elaborate`.

---

## When to Use

Tasks that would take a human less than a few minutes:

- Fix typos
- Rename a variable
- Add a missing import
- Update a config value
- Fix a lint error
- Adjust a constant or string literal
- Small refactors touching 1-2 files

## When NOT to Use

Anything that needs multi-unit decomposition, touches multiple subsystems, or involves architectural decisions. If you are unsure, tell the user and suggest `/haiku:elaborate` instead.

---

## Step 1: Parse Arguments

The user invokes quick mode with an optional stage name and a task description:

```
/haiku:quick fix the typo in README.md
/haiku:quick security sanitize user input in api/handler.ts
/haiku:quick design create a loading spinner component
```

**Argument parsing:**

1. If no arguments were provided, ask the user what they need done (single question, not a multi-phase interview).
2. Read the first word of the argument string.
3. Discover available stages — list stage directories from the software studio:
   ```bash
   source "${CLAUDE_PLUGIN_ROOT}/lib/stage.sh"
   # Built-in stages
   for stage_dir in "${CLAUDE_PLUGIN_ROOT}/studios/software/stages/"*/; do
     [ -d "$stage_dir" ] || continue
     echo "$(basename "$stage_dir")"
   done
   ```
   Build a list of all known stage names.
4. If the first word matches a known stage name (case-sensitive), use that stage and treat the remaining words as the task description.
5. If the first word does NOT match any stage name, use the `development` stage and treat the **entire** argument string as the task description.

Store `STAGE_NAME` (e.g. `"development"`, `"security"`, `"design"`) and `TASK_DESCRIPTION`.

---

## Step 2: Pre-checks

Run these three checks in order. If any fails, stop immediately.

### 2a: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /haiku:quick cannot run in cowork mode."
  echo "Quick mode requires a full Claude Code CLI session with file system access."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately. Do NOT proceed.

### 2b: Active Intent Conflict

Check for conflicting H·AI·K·U state:

1. **Orphaned quick artifacts:** If `.haiku/quick/intent.md` exists, a previous quick mode session did not clean up. Offer the user a choice:
   - Clean up the orphaned artifacts (`rm -rf .haiku/quick/`) and continue
   - Abort so they can inspect the state
2. **Active intent conflict:** Scan for any `.haiku/intents/*/intent.md` with `status: active`. If one exists (and it's not `.haiku/quick/`), stop and tell the user:
   > An active intent already exists: `{intent-slug}`. Quick mode cannot run concurrently with an active intent.
   > Use `/haiku:execute` to continue the existing intent, or complete/close it first.

### 2c: Scope Validation

Before executing, do a quick sanity check:

1. **Read the relevant file(s)** mentioned in the task description.
2. **Confirm the change is trivial** — if the task turns out to require multi-file architectural changes, new test infrastructure, or design decisions, STOP and tell the user:
   > This task looks bigger than a quick fix. Consider using `/haiku:elaborate` for proper planning.
3. If the task is genuinely trivial, proceed.

---

## Step 3: Create Quick Artifacts

Create temporary `.haiku/quick/` state so that the existing hook system (`subagent-context.sh`) can inject hat context into subagents.

### 3a: Gitignore

Add `.haiku/quick/` to `.gitignore` if not already present:

```bash
if ! grep -q '\.haiku/quick/' .gitignore 2>/dev/null; then
  echo '.haiku/quick/' >> .gitignore
fi
```

**Track whether the line was added** so it can be removed during cleanup.

### 3b: Intent File

Create `.haiku/quick/intent.md`:

```markdown
---
studio: software
active_stage: {STAGE_NAME}
status: active
quality_gates: []
---

# Quick: {TASK_DESCRIPTION}

Quick mode task. Temporary artifact — will be removed after completion.
```

### 3c: Iteration State

Create `.haiku/quick/state/iteration.json`:

```json
{
  "hat": "{first hat in stage}",
  "iteration": 1,
  "status": "active"
}
```

The `hat` field is set to the first hat in the resolved stage's hat sequence.

---

## Step 4: Hat Loop (CORE)

Resolve the hat sequence from the stage definition. For `development`, this is `["planner", "builder", "reviewer"]`.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"
STAGE_HATS=$(hku_get_hat_sequence "$STAGE_NAME" "software")
```

Execute each hat in order by spawning a subagent.

### For each hat in the stage:

#### A. Update iteration state

Write the current hat to `.haiku/quick/state/iteration.json` so hooks pick it up:

```json
{
  "hat": "{current-hat}",
  "iteration": 1,
  "status": "active"
}
```

#### B. Display hat transition

```
## {Hat Name} Phase ({N} of {total})
```

#### C. Spawn subagent

Use the `Agent()` tool to spawn a subagent for this hat phase. The `subagent-context.sh` hook automatically injects hat context (hat instructions, workflow state, intent) into the subagent prompt.

**Subagent prompt template:**

```
You are executing a quick-mode task under the {hat-name} hat.

Task: {TASK_DESCRIPTION}

{hat-specific instructions — see section D below}

Work directly in the current working directory. Do NOT create worktrees.
Do NOT read or execute the advance or fail skill definitions directly — just complete your work and report results.
```

**Hat context injection (always explicit):** Always inject hat context directly into the subagent prompt — do not rely on hooks firing for Agent-spawned subagents. Resolve hat instructions from the stage:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"
HAT_INSTRUCTIONS=$(hku_resolve_hat_instructions "{hat-name}" "$STAGE_NAME" "software")
```

If hat instructions are found, append them to the subagent prompt as additional context under a `## Hat Instructions` heading. This makes hat injection deterministic regardless of whether `subagent-context.sh` fires.

#### D. Hat-specific subagent instructions

Tailor the subagent prompt based on hat archetype:

| Archetype | Hats | Subagent Instructions |
|-----------|------|----------------------|
| **Planning** | planner, observer, hypothesizer | Analyze the task and create a brief plan. Output your plan as text. Do NOT make code changes or commits. |
| **Building** | builder, implementer, refactorer, designer, blue-team | Implement the change. Make the smallest correct change. Commit your work with a conventional commit message. |
| **Testing** | test-writer, acceptance-test-writer, experimenter | Write or update tests as needed. Commit your work with a conventional commit message. |
| **Reviewing** | reviewer, analyst | Review the changes made so far. Output exactly one of: `Decision: APPROVED` or `Decision: REQUEST CHANGES` followed by findings. Do NOT modify code. |
| **Attacking** | red-team | Analyze the changes for security issues. Report findings. Do NOT modify code. |

#### E. Process subagent result

After each subagent returns, process its result based on archetype:

- **Planning hats:** No commit expected. Capture the plan output for subsequent hats.
- **Building/Testing hats:** Verify a commit was produced. If no commit, log a warning but continue.
- **Reviewing hats:** Parse the result for `Decision: APPROVED` or `Decision: REQUEST CHANGES`.
  - If **APPROVED**: Continue to the next hat (or finish if this is the last hat).
  - If **REQUEST CHANGES**: Loop back to the most recent building-archetype hat in the stage. See rejection loop below.
- **Attacking hats:** Capture findings. Continue to the next hat.

#### F. Reviewer rejection loop

When a reviewer rejects:

1. Increment a rejection counter (starts at 0).
2. If rejection count < 3: Loop back to the most recent building-archetype hat. The building subagent receives the reviewer's findings as additional context.
3. If rejection count >= 3: Stop the loop and tell the user:
   > Quick mode hit the review cycle limit (3 attempts). This task may be more complex than expected.
   > Consider using `/haiku:elaborate` for proper planning and decomposition.
4. After the builder re-implements, resume the hat sequence from the builder's position (i.e., advance to the reviewer again).

---

## Step 5: Pre-Delivery Review

After the hat loop completes successfully (reviewer approved or no reviewer in stage), run the pre-delivery code review to catch issues before they hit external CI or review bots.

**Invoke `/haiku:review`:**

```
Skill("haiku:review")
```

The review skill:
1. Diffs against the current branch's upstream (or default branch)
2. Reads REVIEW.md + CLAUDE.md for project-specific review rules
3. Spawns parallel specialized agents (correctness, security, performance, architecture, test quality)
4. Auto-fixes HIGH findings in a loop (up to 3 iterations)
5. Returns a result: `approved`, `needs_attention`, or `aborted`

**Handle the result:**
- **`approved`**: Proceed to Step 6 (delivery).
- **`needs_attention`**: The review skill already asked the user how to proceed. If they chose "Proceed anyway", continue. If "Let me fix manually" or "Abort", skip to Step 7 (cleanup) without creating a PR.
- **`aborted`**: Skip to Step 7 (cleanup) without creating a PR.

---

## Step 6: Delivery (PR Creation)

Quick mode **always delivers via PR**. This ensures all changes go through the standard merge process regardless of task size.

### 6a: Ensure branch is ready

```bash
# Get the current branch
CURRENT_BRANCH=$(git branch --show-current)
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# If on the default branch, create a feature branch from the commits
if [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ]; then
  # Determine how many commits were added by quick mode
  COMMIT_COUNT=$(git rev-list --count "origin/${DEFAULT_BRANCH}..HEAD" 2>/dev/null || echo "0")
  if [ "$COMMIT_COUNT" -gt 0 ]; then
    BRANCH_NAME="quick/$(echo "${TASK_DESCRIPTION}" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '-' | head -c 50 | sed 's/-$//')"
    git checkout -b "$BRANCH_NAME"
  else
    echo "No commits to deliver."
    # Skip to cleanup
  fi
fi

# Push to remote
git push -u origin "$(git branch --show-current)"
```

### 6b: Create PR

```bash
BRANCH=$(git branch --show-current)

gh pr create \
  --title "$(git log -1 --format='%s')" \
  --base "$DEFAULT_BRANCH" \
  --head "$BRANCH" \
  --body "$(cat <<EOF
## Summary

Quick mode task: ${TASK_DESCRIPTION}

## Changes

$(git diff --stat "${DEFAULT_BRANCH}...HEAD")

## Review

Pre-delivery review: **passed** (multi-agent review)

---
*Created via \`/haiku:quick\` with pre-delivery review*
EOF
)"
```

Display the PR URL to the user.

---

## Step 7: Cleanup

Run cleanup after delivery (or if delivery was skipped), regardless of outcome. If the session was interrupted mid-loop, the orphaned artifact check in Step 2b will handle cleanup on the next run.

1. Remove the temporary quick artifacts:
   ```bash
   rm -rf .haiku/quick/
   ```
2. If a `.haiku/quick/` gitignore entry was added in Step 3a, remove it:
   ```bash
   sed -i.bak '/\.haiku\/quick\//d' .gitignore && rm -f .gitignore.bak
   ```
   If `.gitignore` is now unchanged from its original state (the only modification was the quick entry), do not commit the gitignore change. If other gitignore changes exist, leave them.

---

## Step 8: Completion Report

Output a brief summary:

```
## Quick Mode Complete

**Task:** {TASK_DESCRIPTION}
**Stage:** {STAGE_NAME} ({hat1} -> {hat2} -> ... -> {hatN})
**Changed:** {file(s) modified}
**Review cycles:** {count}
**Pre-delivery review:** {passed | skipped | needs attention}
**PR:** {PR_URL or "not created"}
**Result:** {APPROVED | cycle limit reached | completed without reviewer}
```

---

## Guardrails

- **Temporary state only.** Quick mode creates `.haiku/quick/` artifacts purely for hook integration. They are always cleaned up — never committed, never persisted.
- **No worktrees.** Work happens in the current working directory on the current branch. Quick mode does NOT create git worktrees.
- **Subagent delegation.** Each hat phase is executed by a spawned subagent, not by the orchestrator directly. This keeps hat context clean and isolated.
- **3-cycle limit.** If the reviewer rejects 3 times, quick mode stops and recommends `/haiku:elaborate`. Quick mode is not for tasks that need extensive iteration.
- **Always delivers via PR.** Quick mode creates a feature branch (if on default branch) and opens a PR. All changes go through the merge process.
- **Pre-delivery review is mandatory.** `/haiku:review` runs after the hat loop — the same multi-agent review that runs for full intents. Issues are fixed locally before the PR is created.
- **Scope escape hatch.** If at any point during execution you realize the task is not trivial, stop and recommend `/haiku:elaborate`. Do not silently expand scope.
- **Conflict guard.** Quick mode refuses to start if another active intent exists. Only one intent can be active at a time.
- **Empty quality gates.** Quick artifacts use `quality_gates: []` — no harness-enforced gates. Verification is handled by the hat sequence itself.
- **Single session.** Quick mode runs to completion in one session. There is no resume capability — if interrupted, clean up orphaned artifacts and start over.
- **Cowork rejection.** Quick mode cannot run in cowork mode (`CLAUDE_CODE_IS_COWORK=1`).
