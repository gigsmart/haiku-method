---
description: (Internal) Advance to the next hat in the AI-DLC workflow
user-invocable: false
---

## Name

`ai-dlc:advance` - Move to the next hat in the AI-DLC workflow sequence.

## Synopsis

```
/advance
```

## Description

**Internal command** - Called by the AI during `/execute`, not directly by users.

Advances to the next hat in the workflow sequence. For example, in the default workflow:
- planner -> builder (plan ready, now implement)
- builder -> reviewer (bolt complete, now review)

**When at the last hat (reviewer)**, `/advance` handles completion automatically:
- If all units complete -> Mark intent as complete
- If more units ready -> Loop back to builder for next unit
- If blocked (no ready units) -> Alert user, human intervention required

## Implementation

### Step 1: Load Current State

```bash
# Intent-level state is stored on current branch (intent branch)
STATE=$(han keep load iteration.json --quiet)
```

### Step 2: Verify Hard Gate and Determine Next Hat (or Handle Completion)

Before advancing, check the hard gate for the current transition:

```bash
# Hard gate verification — block advancement if gate conditions are not met
CURRENT_HAT=$(echo "$STATE" | han parse json hat -r)

case "$CURRENT_HAT" in
  planner)
    # PLAN_APPROVED gate: plan must exist and cover all criteria
    PLAN=$(han keep load plan.md --quiet 2>/dev/null || echo "")
    if [ -z "$PLAN" ]; then
      echo "## HARD GATE: PLAN_APPROVED"
      echo ""
      echo "Cannot advance to builder — no plan found in han keep."
      echo "The planner must save a plan before advancement."
      exit 1
    fi
    ;;
  builder)
    # TESTS_PASS gate: quality gates must pass before review
    if command -v npm &>/dev/null && [ -f "package.json" ]; then
      if ! npm test --if-present 2>/dev/null; then
        echo "## HARD GATE: TESTS_PASS"
        echo ""
        echo "Cannot advance to reviewer — quality gates are not passing."
        echo "Fix failing tests/lint/types before requesting review."
        exit 1
      fi
    fi
    # Additional quality checks (lint, typecheck) if configured
    if command -v npm &>/dev/null && [ -f "package.json" ]; then
      npm run lint --if-present 2>/dev/null || {
        echo "## HARD GATE: TESTS_PASS"
        echo ""
        echo "Cannot advance to reviewer — lint is failing."
        echo "Fix lint errors before requesting review."
        exit 1
      }
      npm run typecheck --if-present 2>/dev/null || npm run type-check --if-present 2>/dev/null || true
    fi
    ;;
  reviewer)
    # CRITERIA_MET gate: each criterion must have PASS with evidence
    # This is verified by the reviewer hat itself — if the reviewer calls /advance,
    # it means criteria were evaluated. The structured completion marker is checked here.
    REVIEW_RESULT=$(han keep load review-result.json --quiet 2>/dev/null || echo "")
    if [ -n "$REVIEW_RESULT" ]; then
      ALL_PASS=$(echo "$REVIEW_RESULT" | han parse json allPass -r --default "false" 2>/dev/null || echo "false")
      if [ "$ALL_PASS" != "true" ]; then
        echo "## HARD GATE: CRITERIA_MET"
        echo ""
        echo "Cannot advance — not all criteria have PASS status with evidence."
        echo "Review the failing criteria and address them before advancing."
        exit 1
      fi
    fi
    ;;
esac
```

Then determine the next hat:

```javascript
// Resolve workflow for this unit: per-unit workflow takes priority, then intent-level fallback
const currentUnit = state.currentUnit;
const unitWorkflow = (currentUnit && state.unitStates?.[currentUnit]?.workflow)
  || state.workflow
  || ["planner", "builder", "reviewer"];
const currentIndex = unitWorkflow.indexOf(state.hat);
const nextIndex = currentIndex + 1;

if (nextIndex >= unitWorkflow.length) {
  // At last hat - check DAG status to determine next action
  // See Steps 2b-2d below
}

const nextHat = unitWorkflow[nextIndex];
```

### Step 2b: Last Hat Logic (Completion/Loop/Block)

When at the last hat (typically reviewer), check the DAG to determine next action:

```bash
# Source the DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Get intent directory
INTENT_SLUG=$(han keep load intent-slug --quiet)
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"

# Mark current unit as completed
CURRENT_UNIT=$(echo "$ITERATION_JSON" | han parse json currentUnit -r --default "")
if [ -n "$CURRENT_UNIT" ] && [ -f "$INTENT_DIR/${CURRENT_UNIT}.md" ]; then
  update_unit_status "$INTENT_DIR/${CURRENT_UNIT}.md" "completed"
  # Commit the status change so it persists across sessions
  git add "$INTENT_DIR/${CURRENT_UNIT}.md"
  git commit -m "status: mark ${CURRENT_UNIT} as completed"
fi
```

### Step 2c: Handle Targeted Unit Completion

When `targetUnit` is set in state and matches the just-completed unit, handle early exit:

```bash
TARGET_UNIT=$(echo "$STATE" | han parse json targetUnit -r --default "")
if [ -n "$TARGET_UNIT" ] && [ "$TARGET_UNIT" = "$CURRENT_UNIT" ]; then
  # Clear targetUnit from state
  STATE=$(echo "$STATE" | han parse json --set "targetUnit=")
  han keep save iteration.json "$STATE"

  echo "## Targeted Unit Complete: ${CURRENT_UNIT}"
  echo ""
  echo "The targeted unit has finished its workflow."
  echo ""
  echo "**Next steps:**"
  echo "- Run \`/execute\` to continue with the next ready unit"
  echo "- Run \`/execute <unit-name>\` to target another specific unit"
  echo "- Run \`/advance\` if all units are complete"
  exit 0
fi
```

### Step 2d: Merge Unit Branch on Completion

After marking a unit as completed, merge behavior depends on `change_strategy`:

```bash
# Load config for merge settings
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
AUTO_MERGE=$(echo "$CONFIG" | jq -r '.auto_merge // "true"')
AUTO_SQUASH=$(echo "$CONFIG" | jq -r '.auto_squash // "false"')
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

# Resolve effective change strategy: per-unit override takes priority over intent-level
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
UNIT_CHANGE_STRATEGY=""
if [ -n "$CURRENT_UNIT" ] && [ -f "$INTENT_DIR/${CURRENT_UNIT}.md" ]; then
  UNIT_CHANGE_STRATEGY=$(parse_unit_change_strategy "$INTENT_DIR/${CURRENT_UNIT}.md")
fi
CHANGE_STRATEGY="${UNIT_CHANGE_STRATEGY:-$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')}"

UNIT_SLUG="${CURRENT_UNIT#unit-}"
UNIT_BRANCH="ai-dlc/${INTENT_SLUG}/${UNIT_SLUG}"

if [ "$CHANGE_STRATEGY" = "unit" ]; then
  # Unit strategy: open a PR/MR for the unit branch directly to the default branch
  git push -u origin "$UNIT_BRANCH" 2>/dev/null || true

  # Get this unit's ticket reference (if any) for the PR body
  UNIT_TICKET=$(han parse yaml ticket -r --default "" < "$INTENT_DIR/${CURRENT_UNIT}.md" 2>/dev/null || echo "")
  TICKET_LINE=""
  if [ -n "$UNIT_TICKET" ]; then
    TICKET_LINE="Closes ${UNIT_TICKET}"
  fi

  gh pr create \
    --base "$DEFAULT_BRANCH" \
    --head "$UNIT_BRANCH" \
    --title "unit: ${CURRENT_UNIT}" \
    --body "$(cat <<EOF
## Unit: ${CURRENT_UNIT}

Part of intent: ${INTENT_SLUG}

${TICKET_LINE}

---
*Built with [AI-DLC](https://ai-dlc.dev)*
EOF
)" 2>/dev/null || echo "PR may already exist for $UNIT_BRANCH"

  # Clean up local unit worktree after PR is pushed (work is on remote now)
  UNIT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
  if [ -d "$UNIT_WORKTREE" ]; then
    git worktree remove "$UNIT_WORKTREE" 2>/dev/null || true
    echo "Cleaned up unit worktree for ${CURRENT_UNIT}"
  fi
  # Keep the branch — it backs the open PR

elif [ "$AUTO_MERGE" = "true" ]; then
  # Intent/trunk strategy: merge unit branch into intent branch
  # Ensure we're on the intent branch
  git checkout "ai-dlc/${INTENT_SLUG}/main"

  # Merge unit branch
  if [ "$AUTO_SQUASH" = "true" ]; then
    git merge --squash "$UNIT_BRANCH"
    git commit -m "unit: ${CURRENT_UNIT} completed"
  else
    git merge --no-ff "$UNIT_BRANCH" -m "Merge ${CURRENT_UNIT} into intent branch"
  fi

  # Clean up unit worktree and branch after merge into intent
  UNIT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
  if [ -d "$UNIT_WORKTREE" ]; then
    git worktree remove "$UNIT_WORKTREE" 2>/dev/null || true
    echo "Cleaned up unit worktree for ${CURRENT_UNIT}"
  fi
  git branch -d "ai-dlc/${INTENT_SLUG}/${UNIT_SLUG}" 2>/dev/null || true
  echo "Cleaned up unit branch for ${CURRENT_UNIT}"
fi
```

```bash
# Get DAG summary
DAG_SUMMARY=$(get_dag_summary "$INTENT_DIR")
ALL_COMPLETE=$(echo "$DAG_SUMMARY" | han parse json allComplete -r)
READY_COUNT=$(echo "$DAG_SUMMARY" | han parse json readyCount -r)
```

```javascript
if (dagSummary.allComplete) {
  // ALL UNITS COMPLETE - Check if integration validation should run
  // Skip integration for:
  //   - Single-unit intents (reviewer already validated it)
  //   - ALL units effectively use "unit" strategy (each reviewed individually via per-unit MR)
  // Hybrid check: iterate all units to see if any use non-unit strategy
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done
UNIT_COUNT=$(ls -1 "$INTENT_DIR"/unit-*.md 2>/dev/null | wc -l)
SKIP_INTEGRATOR=false
[ "$UNIT_COUNT" -le 1 ] && SKIP_INTEGRATOR=true
[ "$ALL_UNIT_STRATEGY" = "true" ] && SKIP_INTEGRATOR=true
```

```javascript
  if (!skipIntegrator && !state.integratorComplete) {
    // Run integration validation on the intent branch
    // See Step 2e below
    return runIntegration();
  }
  // Integration passed or skipped - Mark intent as done
  state.status = "complete";
  // han keep save iteration.json '<updated JSON>'
```

```bash
# Update intent.md frontmatter status so it persists in git (not just ephemeral han keep)
han parse yaml-set status "complete" < "$INTENT_DIR/intent.md" > "$INTENT_DIR/intent.md.tmp" && mv "$INTENT_DIR/intent.md.tmp" "$INTENT_DIR/intent.md"
git add "$INTENT_DIR/intent.md"
git commit -m "status: mark intent ${INTENT_SLUG} as complete"
```

```javascript
  // Output completion summary (see Step 5)
  return completionSummary;
}

if (dagSummary.readyCount > 0) {
  // MORE UNITS READY - Loop back to builder
  state.hat = workflow[2] || "builder";  // Reset to builder (index 2 in default workflow)
  state.currentUnit = null;  // Will be set by /execute when it picks next unit
  // han keep save iteration.json '<updated JSON>'
  return `Unit completed. ${dagSummary.readyCount} more unit(s) ready. Continuing construction...`;
}

// BLOCKED - No ready units, human must intervene
return `All remaining units are blocked. Human intervention required.

Blocked units:
${dagSummary.blockedUnits.join('\n')}

Review blockers and unblock units to continue.`;
```

### Step 2e: Spawn Newly Unblocked Units (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled and completing a unit unblocks new units:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set and `readyCount > 0` after completing a unit:

1. Read `teamName` from `iteration.json`
2. For each newly ready unit:
   - Initialize `unitStates.{unit}.hat = "planner"` and `unitStates.{unit}.retries = 0`
   - Create unit worktree
   - Mark unit as `in_progress`
   - Spawn planner teammate via Task with `team_name` and `name`
3. Save updated state to `iteration.json`

This replaces the sequential "loop back to builder" behavior when Agent Teams is active. Instead of the lead picking up the next unit sequentially, newly unblocked units are spawned as parallel teammates immediately.

**Without Agent Teams:** The existing behavior (reset hat to builder, let `/execute` pick next unit) continues unchanged.

### Step 2f: Integration Validation (When All Units Complete)

When `dagSummary.allComplete` is true and `state.integratorComplete` is not true, run integration validation instead of marking the intent complete.

**Integration is NOT a per-unit hat** — it does not appear in the workflow sequence. It runs once on the merged intent branch after all units pass their per-unit workflows. It is implemented as the internal `/integrate` skill (see `plugin/skills/integrate/SKILL.md`).

1. Set state to indicate integration is running:

```bash
STATE=$(echo "$STATE" | han parse json --set "hat=integrator")
han keep save iteration.json "$STATE"
```

2. Spawn the integrate skill as a subagent on the **intent worktree** (not a unit worktree):

```javascript
Task({
  subagent_type: "general-purpose",
  description: `integrate: ${intentSlug}`,
  prompt: `
    Run the /integrate skill for intent ${intentSlug}.

    ## CRITICAL: Work on Intent Branch
    **Worktree path:** .ai-dlc/worktrees/${intentSlug}/
    **Branch:** ai-dlc/${intentSlug}/main

    You MUST:
    1. cd .ai-dlc/worktrees/${intentSlug}/
    2. Verify you're on the intent branch (not a unit branch)
    3. This branch contains ALL merged unit work

    ## Intent-Level Success Criteria
    ${intentCriteria}

    ## Completed Units
    ${completedUnitsList}

    Verify that all units work together and intent-level criteria are met.
    Report ACCEPT or REJECT with specific details.
  `
})
```

3. Handle integration result:

**If ACCEPT:**
```bash
STATE=$(echo "$STATE" | han parse json --set "integratorComplete=true" --set "status=complete")
han keep save iteration.json "$STATE"

# Update intent.md frontmatter status so it persists in git (not just ephemeral han keep)
han parse yaml-set status "complete" < "$INTENT_DIR/intent.md" > "$INTENT_DIR/intent.md.tmp" && mv "$INTENT_DIR/intent.md.tmp" "$INTENT_DIR/intent.md"
git add "$INTENT_DIR/intent.md"
git commit -m "status: mark intent ${INTENT_SLUG} as complete"

# Proceed to Step 5 (completion summary)
```

**If REJECT:**

The integration result specifies which units need rework. For each rejected unit:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
INTENT_WORKFLOW_HATS=$(echo "$STATE" | han parse json workflow)

# Re-queue each rejected unit
for UNIT_FILE in $REJECTED_UNITS; do
  update_unit_status "$UNIT_FILE" "pending"

  # Reset hat to first hat of this unit's workflow (per-unit or intent-level fallback)
  UNIT_NAME=$(basename "$UNIT_FILE" .md)
  UNIT_WORKFLOW=$(echo "$STATE" | han parse json "unitStates.${UNIT_NAME}.workflow" 2>/dev/null || echo "")
  [ -z "$UNIT_WORKFLOW" ] || [ "$UNIT_WORKFLOW" = "null" ] && UNIT_WORKFLOW="$INTENT_WORKFLOW_HATS"
  FIRST_HAT=$(echo "$UNIT_WORKFLOW" | jq -r '.[0]')
  STATE=$(echo "$STATE" | han parse json \
    --set "unitStates.${UNIT_NAME}.hat=${FIRST_HAT}" \
    --set "unitStates.${UNIT_NAME}.retries=0" \
    --set "unitStates.${UNIT_NAME}.workflow=${UNIT_WORKFLOW}")
done

# Reset integration state
GLOBAL_FIRST_HAT=$(echo "$INTENT_WORKFLOW_HATS" | jq -r '.[0]')
STATE=$(echo "$STATE" | han parse json --set "hat=${GLOBAL_FIRST_HAT}" --set "integratorComplete=false")
han keep save iteration.json "$STATE"

# Output: "Integration rejected. Re-queued units: {list}. Run /execute to continue."
```

The re-queued units will be picked up on the next `/execute` cycle through the normal DAG-based unit selection.

### Step 3: Update State

```bash
# Increment iteration counter
ITERATION=$(echo "$STATE" | han parse json iteration -r --default 1)
ITERATION=$((ITERATION + 1))

# Safety cap: prevent infinite loops
MAX_ITERATIONS=50
if [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
  echo "## Safety Limit Reached"
  echo ""
  echo "Construction has reached ${MAX_ITERATIONS} iterations without completing."
  echo "This likely indicates poorly specified criteria or a systematic issue."
  echo ""
  echo "**Action required:** Review the intent and unit specs, then run \`/execute\` to resume."
  STATE=$(echo "$STATE" | han parse json --set "status=blocked" --set "iteration=$ITERATION")
  han keep save iteration.json "$STATE"
  exit 0
fi

# Update hat and signal SessionStart to increment iteration
# Intent-level state saved to current branch (intent branch)
# state.hat = nextHat, state.iteration = ITERATION
han keep save iteration.json '<updated JSON with hat and iteration>'
```

### Step 4: Confirm (Normal Advancement)

Output:
```
Advanced to **{nextHat}** hat. Continuing construction...
```

### Step 5: Completion Summary (When All Units Done)

When `/advance` completes the intent (all units done), output:

```
## Intent Complete!

**Total iterations:** {iteration count}
**Workflow:** {workflowName} ({workflowHats})

### What Was Built
{Summary from intent}

### Units Completed
{List of completed units}

### Criteria Satisfied
{List of completion criteria}

### Merge to Default Branch

The intent branch is ready to merge:

```bash
# Load merge config
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')
```

```
Intent branch ready: ai-dlc/{intent-slug}/main → ${DEFAULT_BRANCH}

Create PR: gh pr create --base ${DEFAULT_BRANCH} --head ai-dlc/{intent-slug}/main
```

### Completion Announcements

If the intent has configured `announcements` in its frontmatter, generate each format:

```bash
ANNOUNCEMENTS=$(han parse yaml announcements < "$INTENT_DIR/intent.md" 2>/dev/null || echo "[]")
```

For each configured format, generate the announcement artifact in `.ai-dlc/{intent-slug}/`:

| Format | File | Content |
|--------|------|---------|
| `changelog` | `CHANGELOG-entry.md` | Conventional changelog entry (Added/Changed/Fixed sections) |
| `release-notes` | `release-notes.md` | User-facing feature summary in plain language |
| `social-posts` | `social-posts.md` | Platform-optimized snippets (Twitter/LinkedIn ready) |
| `blog-draft` | `blog-draft.md` | Long-form announcement with context, examples, and impact |

Generate each from the intent's Problem/Solution, completed units, and success criteria. Commit the announcement artifacts:

```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "announce: generate completion announcements for ${INTENT_SLUG}"
```

Skip this step if `announcements` is empty or `[]`.

**Gate on change strategy.** The delivery prompt only applies to intent-level strategy. With unit strategy, each unit already has its own PR.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
CHANGE_STRATEGY=$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')

ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$CHANGE_STRATEGY}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done
```

**If ALL units use unit strategy** (`ALL_UNIT_STRATEGY=true`): Skip the delivery prompt. Each unit already has its own PR. Clean up the intent worktree and output:

```bash
# Clean up intent worktree — all unit PRs are on the remote
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || true
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
fi
```

```
All unit PRs have been created during construction. Review and merge them individually.

To clean up:
  /reset
```

**If intent strategy** (or hybrid with non-unit units): Ask the user how to deliver using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "How would you like to deliver this intent?",
    "header": "Delivery",
    "options": [
      {"label": "Open PR/MR for delivery", "description": "Create a pull/merge request to merge into the default branch"},
      {"label": "I'll handle it", "description": "Just show me the branch details"}
    ],
    "multiSelect": false
  }]
}
```

### If PR/MR:

1. Push intent branch to remote (if not already):

```bash
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
git push -u origin "$INTENT_BRANCH" 2>/dev/null || true
```

2. Collect ticket references from all units:

```bash
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

TICKET_REFS=""
for unit_file in "$INTENT_DIR"/unit-*.md; do
  [ -f "$unit_file" ] || continue
  TICKET=$(han parse yaml ticket -r --default "" < "$unit_file" 2>/dev/null || echo "")
  if [ -n "$TICKET" ]; then
    TICKET_REFS="${TICKET_REFS}\nCloses ${TICKET}"
  fi
done
```

3. Create PR/MR:

```bash
gh pr create \
  --title "${INTENT_TITLE}" \
  --base "$DEFAULT_BRANCH" \
  --head "$INTENT_BRANCH" \
  --body "$(cat <<EOF
## Summary
${PROBLEM_SECTION}

${SOLUTION_SECTION}

## Test Plan
${SUCCESS_CRITERIA_AS_CHECKLIST}

## Changes
${COMPLETED_UNITS_AS_CHANGE_LIST}

$(printf "%b" "${TICKET_REFS}")

---
*Built with [AI-DLC](https://ai-dlc.dev)*
EOF
)"
```

4. Clean up intent worktree after PR is pushed (work is on remote now):

```bash
# Clean up intent worktree after PR is pushed
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || true
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
fi
# Keep the branch — it backs the open PR
```

5. Output the PR URL.

### If manual:

```
Intent branch ready: ai-dlc/{intent-slug}/main → ${DEFAULT_BRANCH}

To merge:
  git checkout ${DEFAULT_BRANCH}
  git merge --no-ff ai-dlc/{intent-slug}/main

To create PR manually:
  gh pr create --base ${DEFAULT_BRANCH} --head ai-dlc/{intent-slug}/main

To clean up:
  /reset
```

Clean up intent worktree since all work is committed and pushed:

```bash
# Clean up intent worktree — work is committed on the branch
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || true
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
fi
# Keep the branch — user may create a PR from it
```
