---
description: Quick mode for small tasks — skip full elaboration/planning when the task is trivial
user-invocable: true
argument-hint: "[workflow-name] <task description>"
---

# Quick Mode

You are running **Quick Mode** — a streamlined path for trivial tasks that skips full elaboration and unit decomposition. The user has described a small task inline and you will execute it through a hat-based workflow using subagents, producing disciplined work without the overhead of full `/ai-dlc:elaborate`.

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

Anything that needs multi-unit decomposition, touches multiple subsystems, or involves architectural decisions. If you are unsure, tell the user and suggest `/ai-dlc:elaborate` instead.

---

## Step 1: Parse Arguments

The user invokes quick mode with an optional workflow name and a task description:

```
/ai-dlc:quick fix the typo in README.md
/ai-dlc:quick tdd add input validation to parseConfig
/ai-dlc:quick adversarial sanitize user input in api/handler.ts
```

**Argument parsing:**

1. If no arguments were provided, ask the user what they need done (single question, not a multi-phase interview).
2. Read the first word of the argument string.
3. Resolve workflows — load workflow definitions from two sources:
   ```bash
   PLUGIN_WORKFLOWS="${CLAUDE_PLUGIN_ROOT}/workflows.yml"
   PROJECT_WORKFLOWS=".ai-dlc/workflows.yml"
   ```
   Project workflows with the same name **fully replace** plugin workflows (not merge — replace). Build a merged map of all known workflow names.
4. If the first word matches a known workflow name (case-sensitive), use that workflow and treat the remaining words as the task description.
5. If the first word does NOT match any workflow name, use the `default` workflow and treat the **entire** argument string as the task description.

Store `WORKFLOW_NAME` (e.g. `"default"`, `"tdd"`, `"adversarial"`) and `TASK_DESCRIPTION`.

---

## Step 2: Pre-checks

Run these three checks in order. If any fails, stop immediately.

### 2a: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /ai-dlc:quick cannot run in cowork mode."
  echo "Quick mode requires a full Claude Code CLI session with file system access."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately. Do NOT proceed.

### 2b: Active Intent Conflict

Check for conflicting AI-DLC state:

1. **Orphaned quick artifacts:** If `.ai-dlc/quick/intent.md` exists, a previous quick mode session did not clean up. Offer the user a choice:
   - Clean up the orphaned artifacts (`rm -rf .ai-dlc/quick/`) and continue
   - Abort so they can inspect the state
2. **Active intent conflict:** Scan for any `.ai-dlc/*/intent.md` with `status: active`. If one exists (and it's not `.ai-dlc/quick/`), stop and tell the user:
   > An active intent already exists: `{intent-slug}`. Quick mode cannot run concurrently with an active intent.
   > Use `/ai-dlc:execute` to continue the existing intent, or complete/close it first.

### 2c: Scope Validation

Before executing, do a quick sanity check:

1. **Read the relevant file(s)** mentioned in the task description.
2. **Confirm the change is trivial** — if the task turns out to require multi-file architectural changes, new test infrastructure, or design decisions, STOP and tell the user:
   > This task looks bigger than a quick fix. Consider using `/ai-dlc:elaborate` for proper planning.
3. If the task is genuinely trivial, proceed.

---

## Step 3: Create Quick Artifacts

Create temporary `.ai-dlc/quick/` state so that the existing hook system (`subagent-context.sh`) can inject hat context into subagents.

### 3a: Gitignore

Add `.ai-dlc/quick/` to `.gitignore` if not already present:

```bash
if ! grep -q '\.ai-dlc/quick/' .gitignore 2>/dev/null; then
  echo '.ai-dlc/quick/' >> .gitignore
fi
```

**Track whether the line was added** so it can be removed during cleanup.

### 3b: Intent File

Create `.ai-dlc/quick/intent.md`:

```markdown
---
workflow: {WORKFLOW_NAME}
status: active
quality_gates: []
---

# Quick: {TASK_DESCRIPTION}

Quick mode task. Temporary artifact — will be removed after completion.
```

### 3c: Iteration State

Create `.ai-dlc/quick/state/iteration.json`:

```json
{
  "hat": "{first hat in workflow}",
  "iteration": 1,
  "status": "active",
  "workflowName": "{WORKFLOW_NAME}",
  "workflow": ["{hat1}", "{hat2}", "{hat3}"]
}
```

The `hat` field is set to the first hat in the resolved workflow sequence.

---

## Step 4: Hat Loop (CORE)

Resolve the hat sequence from the workflow definition. For `default`, this is `["planner", "builder", "reviewer"]`.

Execute each hat in order by spawning a subagent.

### For each hat in the workflow:

#### A. Update iteration state

Write the current hat to `.ai-dlc/quick/state/iteration.json` so hooks pick it up:

```json
{
  "hat": "{current-hat}",
  "iteration": 1,
  "status": "active",
  "workflowName": "{WORKFLOW_NAME}",
  "workflow": ["{hat1}", "{hat2}", "{hat3}"]
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
Do NOT use /ai-dlc:advance or /ai-dlc:fail — just complete your work and report results.
```

**Hook fallback (F003):** If hooks don't fire for Agent calls from skills, manually inject hat context into the subagent prompt. Read the hat file directly:

```bash
HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/{hat-name}.md"
[ -f ".ai-dlc/hats/{hat-name}.md" ] && HAT_FILE=".ai-dlc/hats/{hat-name}.md"
```

If the hat file exists, read its contents and append them to the subagent prompt as additional context under a `## Hat Instructions` heading.

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
  - If **REQUEST CHANGES**: Loop back to the most recent building-archetype hat in the workflow. See rejection loop below.
- **Attacking hats:** Capture findings. Continue to the next hat.

#### F. Reviewer rejection loop

When a reviewer rejects:

1. Increment a rejection counter (starts at 0).
2. If rejection count < 3: Loop back to the most recent building-archetype hat. The building subagent receives the reviewer's findings as additional context.
3. If rejection count >= 3: Stop the loop and tell the user:
   > Quick mode hit the review cycle limit (3 attempts). This task may be more complex than expected.
   > Consider using `/ai-dlc:elaborate` for proper planning and decomposition.
4. After the builder re-implements, resume the workflow from the builder's position (i.e., advance to the reviewer again).

---

## Step 5: Cleanup

**This step ALWAYS runs**, whether the hat loop succeeded, failed, or was interrupted.

1. Remove the temporary quick artifacts:
   ```bash
   rm -rf .ai-dlc/quick/
   ```
2. If a `.ai-dlc/quick/` gitignore entry was added in Step 3a, remove it:
   ```bash
   sed -i '' '/\.ai-dlc\/quick\//d' .gitignore
   ```
   If `.gitignore` is now unchanged from its original state (the only modification was the quick entry), do not commit the gitignore change. If other gitignore changes exist, leave them.

---

## Step 6: Completion Report

Output a brief summary:

```
## Quick Mode Complete

**Task:** {TASK_DESCRIPTION}
**Workflow:** {WORKFLOW_NAME} ({hat1} -> {hat2} -> ... -> {hatN})
**Changed:** {file(s) modified}
**Review cycles:** {count}
**Result:** {APPROVED | cycle limit reached | completed without reviewer}
```

---

## Guardrails

- **Temporary state only.** Quick mode creates `.ai-dlc/quick/` artifacts purely for hook integration. They are always cleaned up — never committed, never persisted.
- **No worktrees.** Work happens in the current working directory on the current branch. Quick mode does NOT create git worktrees.
- **Subagent delegation.** Each hat phase is executed by a spawned subagent, not by the orchestrator directly. This keeps hat context clean and isolated.
- **3-cycle limit.** If the reviewer rejects 3 times, quick mode stops and recommends `/ai-dlc:elaborate`. Quick mode is not for tasks that need extensive iteration.
- **Scope escape hatch.** If at any point during execution you realize the task is not trivial, stop and recommend `/ai-dlc:elaborate`. Do not silently expand scope.
- **Conflict guard.** Quick mode refuses to start if another active intent exists. Only one intent can be active at a time.
- **Empty quality gates.** Quick artifacts use `quality_gates: []` — no harness-enforced gates. Verification is handled by the hat workflow itself.
- **Single session.** Quick mode runs to completion in one session. There is no resume capability — if interrupted, clean up orphaned artifacts and start over.
- **Cowork rejection.** Quick mode cannot run in cowork mode (`CLAUDE_CODE_IS_COWORK=1`).
