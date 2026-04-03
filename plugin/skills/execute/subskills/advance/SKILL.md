---
description: (Internal) Advance to the next hat in the H·AI·K·U workflow
user-invocable: false
---

## Name

`haiku:advance` - Move to the next hat in the H·AI·K·U stage hat sequence.

## Synopsis

```
/haiku:advance
```

## Description

**Internal command** - Called by the AI during `/haiku:execute`, not directly by users.

Advances to the next hat in the stage's hat sequence. For example, in the development stage:
- planner -> builder (plan ready, now implement)
- builder -> reviewer (bolt complete, now review)

**When at the last hat (reviewer)**, `/haiku:advance` handles completion automatically:
- If all units complete -> Mark intent as complete
- If more units ready -> Loop back to builder for next unit
- If blocked (no ready units) -> Alert user, human intervention required

## Implementation

### Step 1: Load Current State

```bash
# Intent-level state is stored in .haiku/intents/{slug}/state/
INTENT_DIR=$(find .haiku -maxdepth 2 -name "intent.md" -exec dirname {} \; | head -1)
INTENT_SLUG=$(basename "$INTENT_DIR")
STATE=$(hku_state_load "$INTENT_DIR" "iteration.json")
```

### Step 2: Verify Hard Gate and Determine Next Hat (or Handle Completion)

Before advancing, check the hard gate for the current transition:

**Gate architecture:**
- **Structural gates** (PLAN_APPROVED, CRITERIA_MET) are checked here because they verify execution state, not code quality
- **Quality gates** (tests, lint, types, custom checks) are harness-enforced via `quality-gate.sh` on Stop/SubagentStop — the agent cannot reach `/haiku:advance` unless all gates passed
- This separation ensures: the harness handles enforcement, the advance skill handles hat transitions

```bash
# Hard gate verification — block advancement if gate conditions are not met
CURRENT_HAT=$(echo "$STATE" | hku_json_get "hat")

case "$CURRENT_HAT" in
  planner)
    # PLAN_APPROVED gate: plan must exist and cover all criteria
    PLAN=$(hku_state_load "$INTENT_DIR" "current-plan.md" 2>/dev/null || echo "")
    if [ -z "$PLAN" ]; then
      echo "## HARD GATE: PLAN_APPROVED"
      echo ""
      echo "Cannot advance to builder — no plan found in state."
      echo "The planner must save a plan before advancement."
      exit 1
    fi
    ;;
  builder)
    # Quality gates are harness-enforced via the Stop/SubagentStop hook
    # (quality-gate.sh). The builder cannot reach /haiku:advance unless all
    # frontmatter-defined gates passed. No redundant check needed here.
    #
    # Visual gate check is still handled here because it prepares
    # comparison context for the reviewer (not a pass/fail gate at this point).
    CURRENT_UNIT=$(echo "$STATE" | hku_json_get "currentUnit" "")
    UNIT_FILE="$INTENT_DIR/${CURRENT_UNIT}.md"
    if [ -n "$CURRENT_UNIT" ] && [ -f "$UNIT_FILE" ]; then
      PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
      VISUAL_GATE_RESULT=$(bash "$PLUGIN_DIR/lib/detect-visual-gate.sh" --unit-file "$UNIT_FILE" 2>/dev/null || echo "VISUAL_GATE=false SCORE=0")
      # Parse gate result: "VISUAL_GATE=true|false SCORE=N [NEEDS_EXPORT=true] [MODE=present_for_review]"
      VISUAL_GATE_ACTIVE=false
      case "$VISUAL_GATE_RESULT" in VISUAL_GATE=true*) VISUAL_GATE_ACTIVE=true ;; esac
      if [ "$VISUAL_GATE_ACTIVE" = "true" ]; then
        UNIT_SLUG="${CURRENT_UNIT#unit-}"
        COMPARISON_RESULT=$(bash "$PLUGIN_DIR/lib/run-visual-comparison.sh" \
          --intent-slug "$INTENT_SLUG" \
          --unit-slug "$CURRENT_UNIT" \
          --intent-dir "$INTENT_DIR" 2>/dev/null || echo "")
        # Parse comparison output for reviewer handoff context
        NEEDS_EXPORT=false
        case "$COMPARISON_RESULT" in *NEEDS_EXPORT=true*) NEEDS_EXPORT=true ;; esac
        VISUAL_MODE=""
        case "$COMPARISON_RESULT" in *MODE=present_for_review*) VISUAL_MODE="present_for_review" ;; esac
        # Log for reviewer context — these do not block advancement
        if [ "$NEEDS_EXPORT" = "true" ]; then
          echo "haiku: advance: visual comparison requires agent export — reviewer will handle" >&2
        fi
        if [ "$VISUAL_MODE" = "present_for_review" ]; then
          echo "haiku: advance: visual comparison in present-for-review mode — reviewer will handle" >&2
        fi
      fi
    fi
    ;;
  reviewer)
    # CRITERIA_MET gate: each criterion must have PASS with evidence
    # This is verified by the reviewer hat itself — if the reviewer calls /haiku:advance,
    # it means criteria were evaluated. The structured completion marker is checked here.
    REVIEW_RESULT=$(hku_state_load "$INTENT_DIR" "review-result.json" 2>/dev/null || echo "")
    if [ -n "$REVIEW_RESULT" ]; then
      ALL_PASS=$(echo "$REVIEW_RESULT" | hku_json_get "allPass" "false" 2>/dev/null || echo "false")
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
// Resolve hat sequence for this unit from its stage (determined by discipline)
const currentUnit = state.currentUnit;
// Get hat sequence from the unit's stage via hku_get_hat_sequence
const unitHats = getHatSequenceForUnit(currentUnit) || ["planner", "builder", "reviewer"];
const currentIndex = unitHats.indexOf(state.hat);
const nextIndex = currentIndex + 1;

if (nextIndex >= unitHats.length) {
  // At last hat - check DAG status to determine next action
  // See Steps 2b-2d below
}

const nextHat = unitHats[nextIndex];
```

### Step 2b: Last Hat Logic (Completion/Loop/Block)

When at the last hat (typically reviewer), check the DAG to determine next action:

```bash
# Source the DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

# Get intent directory
# INTENT_DIR and INTENT_SLUG already set in Step 1

# Mark current unit as completed
CURRENT_UNIT=$(echo "$ITERATION_JSON" | hku_json_get "currentUnit" "")
if [ -n "$CURRENT_UNIT" ] && [ -f "$INTENT_DIR/${CURRENT_UNIT}.md" ]; then
  update_unit_status "$INTENT_DIR/${CURRENT_UNIT}.md" "completed"
  # Check off completion criteria checkboxes in the unit file
  hku_check_unit_criteria "$INTENT_DIR/${CURRENT_UNIT}.md"
  # Save the status change so it persists across sessions
  source "${CLAUDE_PLUGIN_ROOT}/lib/persistence.sh"
  persistence_save "$INTENT_SLUG" "status: mark ${CURRENT_UNIT} as completed" "$INTENT_DIR/${CURRENT_UNIT}.md"
fi
```

### Step 2c: Handle Targeted Unit Completion

When `targetUnit` is set in state and matches the just-completed unit, handle early exit:

```bash
TARGET_UNIT=$(echo "$STATE" | hku_json_get "targetUnit" "")
if [ -n "$TARGET_UNIT" ] && [ "$TARGET_UNIT" = "$CURRENT_UNIT" ]; then
  # Clear targetUnit from state
  STATE=$(echo "$STATE" | hku_json_set "targetUnit" "")
  hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"
```

Clean up the targeted unit's team agents before exiting (if Agent Teams are enabled):

```bash
  AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set, delete the team to release all agent resources:

```javascript
  // Note: If no active team exists (e.g., prior run crashed before TeamCreate), TeamDelete
  // is a no-op. No manual error handling is needed; proceed normally.
  TeamDelete()
```

```bash
  echo "## Targeted Unit Complete: ${CURRENT_UNIT}"
  echo ""
  echo "The targeted unit has finished its hat sequence."
  echo ""
  echo "**Next steps:**"
  echo "- Run \`/haiku:execute\` to continue with the next ready unit"
  echo "- Run \`/haiku:execute <unit-name>\` to target another specific unit"
  echo "- Read \`plugin/skills/execute/subskills/advance/SKILL.md\` and execute it if all units are complete"
  exit 0
fi
```

### Step 2d: Merge Unit Branch on Completion

After marking a unit as completed, merge behavior depends on `change_strategy`:

```bash
# Load config for merge settings
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"
CONFIG=$(get_haiku_config "$INTENT_DIR")
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
UNIT_BRANCH="haiku/${INTENT_SLUG}/${UNIT_SLUG}"

source "${CLAUDE_PLUGIN_ROOT}/lib/persistence.sh"

if [ "$CHANGE_STRATEGY" = "unit" ]; then
  # Unit strategy: open a PR for the unit branch directly to the default branch
  UNIT_TICKET=$(hku_frontmatter_get "ticket" "$INTENT_DIR/${CURRENT_UNIT}.md" 2>/dev/null || echo "")
  TICKET_LINE=""
  if [ -n "$UNIT_TICKET" ]; then
    TICKET_LINE="Closes ${UNIT_TICKET}"
  fi

  PR_BODY="$(cat <<EOF
## Unit: ${CURRENT_UNIT}

Part of intent: ${INTENT_SLUG}

${TICKET_LINE}

---
*Built with [H·AI·K·U](https://haikumethod.ai)*
EOF
)"

  PR_URL=$(persistence_create_review "$INTENT_SLUG" "${CURRENT_UNIT}" "$PR_BODY" --unit "$UNIT_SLUG")

  if [ -n "$PR_URL" ]; then
    source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
    haiku_telemetry_init
    haiku_record_delivery_created "${INTENT_SLUG}" "${CHANGE_STRATEGY}" "${PR_URL}"
  fi

  # Clean up local unit worktree after PR is pushed (work is on remote now)
  persistence_cleanup "$INTENT_SLUG" --unit "$UNIT_SLUG"
  echo "Cleaned up unit worktree for ${CURRENT_UNIT}"
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_worktree_event "deleted" "${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
  # Keep the branch — it backs the open PR

elif [ "$AUTO_MERGE" = "true" ]; then
  # Intent/trunk strategy: merge unit branch into intent branch
  SQUASH_FLAG=""
  [ "$AUTO_SQUASH" = "true" ] && SQUASH_FLAG="--squash"
  persistence_deliver "$INTENT_SLUG" --unit "$UNIT_SLUG" $SQUASH_FLAG

  # Clean up unit worktree and branch after merge into intent
  persistence_cleanup "$INTENT_SLUG" --unit "$UNIT_SLUG"
  echo "Cleaned up unit worktree and branch for ${CURRENT_UNIT}"
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_worktree_event "deleted" "${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}-${UNIT_SLUG}"
fi
```

### Step 2d-1: Clean Up Completed Unit's Team Agents

When Agent Teams are enabled, the completed unit's teammate agents (planner, builder, reviewer, etc.) may still be running. Delete the team to release all agent resources before proceeding to the next unit or integration.

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set, call `TeamDelete` to tear down the team and terminate any remaining agents:

```javascript
// Note: If no active team exists (e.g., prior run crashed before TeamCreate), TeamDelete
// is a no-op. No manual error handling is needed; proceed normally.
TeamDelete()
```

**Without Agent Teams:** Skip this step — there are no teammate agents to clean up.

```bash
# Check if all units are complete using DAG library
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
if is_dag_complete "$INTENT_DIR"; then
  ALL_COMPLETE=true
else
  ALL_COMPLETE=false
fi

# Parse ready count from DAG summary (format: "pending:N in_progress:N completed:N blocked:N ready:N")
DAG_SUMMARY=$(get_dag_summary "$INTENT_DIR")
READY_COUNT=$(echo "$DAG_SUMMARY" | sed -n 's/.*ready:\([0-9]*\).*/\1/p')
READY_COUNT=${READY_COUNT:-0}
```

```javascript
if (ALL_COMPLETE) {
  // ALL UNITS COMPLETE - Check if integration validation should run
  // Skip integration for:
  //   - Single-unit intents (reviewer already validated it)
  //   - ALL units effectively use "unit" strategy (each reviewed individually via per-unit PR)
  // Hybrid check: iterate all units to see if any use non-unit strategy
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done
UNIT_COUNT=$(ls -1 "$INTENT_DIR"/stages/*/units/unit-*.md 2>/dev/null | wc -l)
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
  state.status = "completed";
  // hku_state_save "$INTENT_DIR" "iteration.json" '<updated JSON>'
```

```bash
# Update intent.md frontmatter status so it persists in git
hku_frontmatter_set "status" "completed" "$INTENT_DIR/intent.md"
# Check off intent-level completion criteria checkboxes
hku_check_intent_criteria "$INTENT_DIR"
source "${CLAUDE_PLUGIN_ROOT}/lib/persistence.sh"
persistence_save "$INTENT_SLUG" "status: mark intent ${INTENT_SLUG} as completed" \
  "$INTENT_DIR/intent.md" \
  "$INTENT_DIR/completion-criteria.md" \
  "$INTENT_DIR/state/completion-criteria.md"

# Record intent completion telemetry
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
UNIT_COUNT=$(ls "$INTENT_DIR"/stages/*/units/unit-*.md 2>/dev/null | wc -l | tr -d ' ')
haiku_record_intent_completed "${INTENT_SLUG}" "${UNIT_COUNT}"
```

```javascript
  // Output completion summary (see Step 5)
  return completionSummary;
}

if (READY_COUNT > 0) {
  // MORE UNITS READY - Loop back to builder
  state.hat = unitHats[2] || "builder";  // Reset to builder (index 2 in default stage)
  state.currentUnit = null;  // Will be set by /haiku:execute when it picks next unit
  // hku_state_save "$INTENT_DIR" "iteration.json" '<updated JSON>'
  return `Unit completed. ${READY_COUNT} more unit(s) ready. Continuing execution...`;
}

// BLOCKED - No ready units, human must intervene
return `All remaining units are blocked. Human intervention required.

Blocked units:
${BLOCKED_UNITS}

Review blockers and unblock units to continue.`;
```

### Step 2e: Spawn Newly Unblocked Units (Agent Teams)

When `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled and completing a unit unblocks new units:

```bash
AGENT_TEAMS_ENABLED="${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}"
```

If `AGENT_TEAMS_ENABLED` is set and `READY_COUNT > 0` after completing a unit:

1. Read `teamName` from `iteration.json`
2. Read `intentTitle` from the `title` field in `intent.md` frontmatter
3. Recreate the team (it was deleted in Step 2d-1 cleanup):

```javascript
TeamCreate({
  team_name: teamName,
  description: `H·AI·K·U: ${intentTitle}`
})
```

4. For each newly ready unit:
   - Set `hat: planner` and `retries: 0` in unit frontmatter
   - Create unit worktree
   - Mark unit as `in_progress`
   - Spawn planner teammate via Task with `team_name` and `name`
5. Commit updated unit frontmatter

This replaces the sequential "loop back to builder" behavior when Agent Teams is active. Instead of the lead picking up the next unit sequentially, newly unblocked units are spawned as parallel teammates immediately.

**Without Agent Teams:** The existing behavior (reset hat to builder, let `/haiku:execute` pick next unit) continues unchanged.

### Step 2f: Integration Validation (When All Units Complete)

When `ALL_COMPLETE` is true and `state.integratorComplete` is not true, run integration validation instead of marking the intent completed.

**Integration is NOT a per-unit hat** — it does not appear in the stage's hat sequence. It runs once on the merged intent branch after all units pass their per-unit hat sequences. It is implemented as the internal `/haiku:integrate` skill (see `plugin/skills/execute/subskills/integrate/SKILL.md`).

1. Set state to indicate integration is running:

```bash
STATE=$(echo "$STATE" | hku_json_set "hat" "integrator")
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"
```

2. Spawn the integrate skill as a subagent on the **intent worktree** (not a unit worktree):

```javascript
Task({
  subagent_type: "general-purpose",
  description: `integrate: ${intentSlug}`,
  prompt: `
    Read the skill definition at plugin/skills/execute/subskills/integrate/SKILL.md first, then execute it for intent ${intentSlug}.

    ## CRITICAL: Work on Intent Branch
    **Worktree path:** .haiku/worktrees/${intentSlug}/
    **Branch:** haiku/${intentSlug}/main

    You MUST:
    1. cd .haiku/worktrees/${intentSlug}/
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
STATE=$(echo "$STATE" | hku_json_set "integratorComplete" "true" | hku_json_set "status" "completed")
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"

# Update intent.md frontmatter status so it persists in git
hku_frontmatter_set "status" "completed" "$INTENT_DIR/intent.md"
# Check off intent-level completion criteria checkboxes
hku_check_intent_criteria "$INTENT_DIR"
source "${CLAUDE_PLUGIN_ROOT}/lib/persistence.sh"
persistence_save "$INTENT_SLUG" "status: mark intent ${INTENT_SLUG} as completed" \
  "$INTENT_DIR/intent.md" \
  "$INTENT_DIR/completion-criteria.md" \
  "$INTENT_DIR/state/completion-criteria.md"

# Record intent completion telemetry
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
UNIT_COUNT=$(ls "$INTENT_DIR"/stages/*/units/unit-*.md 2>/dev/null | wc -l | tr -d ' ')
haiku_record_intent_completed "${INTENT_SLUG}" "${UNIT_COUNT}"

# Proceed to Step 5 (completion summary)
```

**If REJECT:**

The integration result specifies which units need rework. For each rejected unit:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/hat.sh"

# Re-queue each rejected unit
for UNIT_FILE in $REJECTED_UNITS; do
  update_unit_status "$UNIT_FILE" "pending"

  # Reset hat to first hat of this unit's stage (determined by discipline)
  UNIT_DISCIPLINE=$(hku_frontmatter_get "discipline" "$UNIT_FILE" 2>/dev/null || echo "")
  UNIT_STAGE="$ACTIVE_STAGE"
  case "$UNIT_DISCIPLINE" in
    design) UNIT_STAGE="design" ;;
    infrastructure|observability) UNIT_STAGE="operations" ;;
  esac
  FIRST_HAT=$(hku_get_hat_sequence "$UNIT_STAGE" "$STUDIO" | awk '{print $1}')
  [ -z "$FIRST_HAT" ] && FIRST_HAT="planner"
  hku_frontmatter_set "hat" "${FIRST_HAT}" "$UNIT_FILE"
  hku_frontmatter_set "retries" "0" "$UNIT_FILE"
done

# Reset integration state
GLOBAL_FIRST_HAT=$(hku_get_hat_sequence "$ACTIVE_STAGE" "$STUDIO" | awk '{print $1}')
[ -z "$GLOBAL_FIRST_HAT" ] && GLOBAL_FIRST_HAT="planner"
STATE=$(echo "$STATE" | hku_json_set "hat" "${GLOBAL_FIRST_HAT}" | hku_json_set "integratorComplete" "false")
hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"

# Output: "Integration rejected. Re-queued units: {list}. Run /haiku:execute to continue."
```

The re-queued units will be picked up on the next `/haiku:execute` cycle through the normal DAG-based unit selection.

### Step 3: Update State

```bash
# Increment iteration counter
ITERATION=$(echo "$STATE" | hku_json_get "iteration" "1")
ITERATION=$((ITERATION + 1))

# Safety cap: prevent infinite loops
MAX_ITERATIONS=50
if [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
  echo "## Safety Limit Reached"
  echo ""
  echo "Execution has reached ${MAX_ITERATIONS} iterations without completing."
  echo "This likely indicates poorly specified criteria or a systematic issue."
  echo ""
  echo "**Action required:** Review the intent and unit specs, then run \`/haiku:execute\` to resume."
  STATE=$(echo "$STATE" | hku_json_set "status" "blocked" | hku_json_set "iteration" "$ITERATION")
  hku_state_save "$INTENT_DIR" "iteration.json" "$STATE"
  exit 0
fi

# Update hat and signal SessionStart to increment iteration
# Intent-level state saved to current branch (intent branch)
# state.hat = nextHat, state.iteration = ITERATION
hku_state_save "$INTENT_DIR" "iteration.json" '<updated JSON with hat and iteration>'

source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
haiku_record_hat_transition "${INTENT_SLUG}" "${PREVIOUS_HAT}" "${NEXT_HAT}"
```

### Step 4: Confirm (Normal Advancement)

Output:
```
Advanced to **{nextHat}** hat. Continuing execution...
```

### Step 5: Completion Summary (When All Units Done)

When `/haiku:advance` completes the intent (all units done), output:

```
## Intent Complete!

**Total iterations:** {iteration count}
**Stage:** {stageName} ({stageHats})

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
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"
CONFIG=$(get_haiku_config "$INTENT_DIR")
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')
```

```
Intent branch ready: haiku/{intent-slug}/main → ${DEFAULT_BRANCH}

Create PR: gh pr create --base ${DEFAULT_BRANCH} --head haiku/{intent-slug}/main
```

### Completion Announcements

If the intent has configured `announcements` in its frontmatter, generate each format:

```bash
ANNOUNCEMENTS=$(hku_frontmatter_get "announcements" "$INTENT_DIR/intent.md" 2>/dev/null || echo "[]")
```

For each configured format, generate the announcement artifact in `.haiku/intents/{intent-slug}/`:

| Format | File | Content |
|--------|------|---------|
| `changelog` | `CHANGELOG-entry.md` | Conventional changelog entry (Added/Changed/Fixed sections) |
| `release-notes` | `release-notes.md` | User-facing feature summary in plain language |
| `social-posts` | `social-posts.md` | Platform-optimized snippets (Twitter/LinkedIn ready) |
| `blog-draft` | `blog-draft.md` | Long-form announcement with context, examples, and impact |

Generate each from the intent's Problem/Solution, completed units, and success criteria. Commit the announcement artifacts:

```bash
git add .haiku/intents/${INTENT_SLUG}/
git commit -m "announce: generate completion announcements for ${INTENT_SLUG}"
```

Skip this step if `announcements` is empty or `[]`.

### Pre-Delivery Status Validation

Before delivery, verify all statuses are correct. This guard catches cases where earlier steps in the advance flow didn't fire correctly:

```bash
# PRE-DELIVERY VALIDATION: Ensure all statuses are correctly set before delivery
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/parse.sh"

# Verify all units are marked completed
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_STATUS=$(parse_unit_status "$unit_file")
  if [ "$UNIT_STATUS" != "completed" ]; then
    echo "Fixing: $(basename "$unit_file" .md) status '$UNIT_STATUS' → 'completed'"
    update_unit_status "$unit_file" "completed"
    hku_check_unit_criteria "$unit_file"
    git add "$unit_file"
  fi
done

# Verify intent is marked completed
INTENT_STATUS=$(hku_frontmatter_get "status" "$INTENT_DIR/intent.md")
if [ "$INTENT_STATUS" != "completed" ]; then
  echo "Fixing: intent status '$INTENT_STATUS' → 'completed'"
  hku_frontmatter_set "status" "completed" "$INTENT_DIR/intent.md"
  git add "$INTENT_DIR/intent.md"
fi

# Check off completion criteria checkboxes
hku_check_intent_criteria "$INTENT_DIR"
git add "$INTENT_DIR/completion-criteria.md" 2>/dev/null || true
git add "$INTENT_DIR/state/completion-criteria.md" 2>/dev/null || true

# Commit any status fixes
if ! git diff --cached --quiet 2>/dev/null; then
  git commit -m "status: reconcile intent and unit statuses before delivery"
fi
```

### Post-Integrate Knowledge Refresh

After integration passes and before delivery, refresh knowledge artifacts so the next intent benefits from what this intent established. This is especially valuable for greenfield and early-stage projects where the first few intents create the foundational patterns.

**Gate:** Skip this step if `knowledge_refresh` is explicitly set to `false` in `.haiku/settings.yml`:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
KNOWLEDGE_REFRESH=$(get_setting_value "knowledge_refresh")
KNOWLEDGE_REFRESH="${KNOWLEDGE_REFRESH:-true}"
```

If `KNOWLEDGE_REFRESH` is `"false"`, skip to Pre-Delivery Code Review.

**Step 1: Gather context for synthesis brief**

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
KNOWLEDGE_COUNT=$(hku_knowledge_list | wc -l | tr -d ' ')
PROJECT_MATURITY=$(detect_project_maturity)
```

Always run the refresh — even when knowledge artifacts already exist, the intent may have changed the codebase in ways that update them. The synthesis skill is idempotent.

**Step 2: Write the synthesis brief**

Write `.haiku/intents/${INTENT_SLUG}/.briefs/knowledge-refresh.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
project_maturity: {PROJECT_MATURITY}
existing_knowledge: [{list of existing artifact types from hku_knowledge_list}]
post_integrate: true
---

# Post-Integrate Knowledge Refresh

Re-synthesize knowledge artifacts from the merged codebase after intent completion.
This captures patterns established or changed by the intent for use in subsequent intents.
```

**Step 3: Invoke synthesis subagent**

```javascript
Agent({
  subagent_type: "general-purpose",
  description: `knowledge-refresh: ${intentSlug}`,
  prompt: `
    Read the skill definition at plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md first,
    then execute it with the brief file at .haiku/intents/${intentSlug}/.briefs/knowledge-refresh.md as input.

    This is a post-integrate refresh — the codebase now contains all work from the completed intent.
    Overwrite existing artifacts with fresh synthesis from the current codebase state.
  `,
  run_in_background: true
})
```

**Run in background** — knowledge refresh should not block delivery. The artifacts will be committed when the subagent completes. If the subagent finishes before delivery completes, commit the results:

```bash
git add .haiku/knowledge/ .haiku/intents/${INTENT_SLUG}/.briefs/knowledge-refresh*.md
git diff --cached --quiet || git commit -m "knowledge: refresh artifacts after ${INTENT_SLUG} integration"
```

If the subagent is still running when delivery completes, that's fine — the artifacts will be committed in a follow-up. The next elaboration will pick them up regardless.

### Pre-Delivery Code Review (Delegated)

Before creating the PR, run a full multi-agent code review to catch issues locally — eliminating the "push → bot finds issues → fix → repeat" cycle. **This is a hard gate — the PR cannot be created without passing.**

The review is delegated to the `/haiku:review` skill, which runs specialized agents in fresh contexts (no builder bias), reads REVIEW.md + CLAUDE.md for project-specific rules, and auto-fixes HIGH findings in a loop.

**Skip condition:** If all units use unit strategy, each unit already has its own individually-reviewed PR — skip the pre-delivery review.

```bash
# Determine if we need pre-delivery review (intent/hybrid strategy only)
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
CONFIG=$(get_haiku_config "$INTENT_DIR")
CHANGE_STRATEGY=$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')

NEEDS_DELIVERY_REVIEW=false
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$CHANGE_STRATEGY}"
  [ "$EFFECTIVE_CS" != "unit" ] && { NEEDS_DELIVERY_REVIEW=true; break; }
done
```

**If `NEEDS_DELIVERY_REVIEW=true`:** Invoke the review skill.

```
Skill("haiku:review")
```

The review skill handles the full lifecycle:
1. Computes the diff against the default branch
2. Loads REVIEW.md and CLAUDE.md as review context
3. Spawns parallel specialized agents (correctness, security, performance, architecture, test quality, plus optional agents from settings)
4. Auto-fixes HIGH findings and re-reviews (up to 3 iterations)
5. Returns a structured result: `approved`, `needs_attention`, or `aborted`

**Handle the result:**

- **`approved`**: Record telemetry and proceed to delivery.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
haiku_record_delivery_review "${INTENT_SLUG}" "approved" "0"
```

- **`needs_attention`**: The user was already asked how to proceed by the review skill. If they chose "Proceed anyway", record telemetry and continue to delivery. If they chose "Let me fix manually" or "Abort", STOP — do not create the PR.

```bash
# Record telemetry for deliveries with noted findings
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
haiku_telemetry_init
haiku_record_delivery_review "${INTENT_SLUG}" "needs_attention" "${FINDINGS_COUNT}"
```

- **`aborted`**: STOP. Do not proceed to delivery.

**Gate on change strategy.** The delivery review only applies to intent-level and hybrid strategies. With unit strategy, each unit already has its own PR.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
CONFIG=$(get_haiku_config "$INTENT_DIR")
CHANGE_STRATEGY=$(echo "$CONFIG" | jq -r '.change_strategy // "unit"')

ALL_UNIT_STRATEGY=true
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CS=$(parse_unit_change_strategy "$unit_file")
  EFFECTIVE_CS="${UNIT_CS:-$CHANGE_STRATEGY}"
  [ "$EFFECTIVE_CS" != "unit" ] && { ALL_UNIT_STRATEGY=false; break; }
done
```

**If ALL units use unit strategy** (`ALL_UNIT_STRATEGY=true`): Skip the delivery prompt. Each unit already has its own PR. Clean up the intent worktree and output:

```bash
# Clean up intent worktree — all unit PRs are on the remote
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || echo "Warning: failed to remove worktree at $INTENT_WORKTREE"
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_worktree_event "deleted" "${INTENT_WORKTREE}"
fi
git worktree prune
```

```
All unit PRs have been created during execution. Review and merge them individually.

To clean up:
  /haiku:reset
```

**If intent strategy** (or hybrid with non-unit units): Ask the user how to deliver using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "How would you like to deliver this intent?",
    "header": "Delivery",
    "options": [
      {"label": "Open PR for delivery", "description": "Create a pull request to merge into the default branch"},
      {"label": "I'll handle it", "description": "Just show me the branch details"}
    ],
    "multiSelect": false
  }]
}
```

### If PR:

1. Push intent branch to remote (if not already):

```bash
INTENT_BRANCH="haiku/${INTENT_SLUG}/main"
git push -u origin "$INTENT_BRANCH" 2>/dev/null || true
```

2. Collect ticket references from all units:

```bash
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

TICKET_REFS=""
for unit_file in "$INTENT_DIR"/stages/*/units/unit-*.md; do
  [ -f "$unit_file" ] || continue
  TICKET=$(hku_frontmatter_get "ticket" "$unit_file" 2>/dev/null || echo "")
  if [ -n "$TICKET" ]; then
    TICKET_REFS="${TICKET_REFS}\nCloses ${TICKET}"
  fi
done
```

3. Create PR:

```bash
PR_URL=$(gh pr create \
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
*Built with [H·AI·K·U](https://haikumethod.ai)*
EOF
)" 2>&1)

if [ -n "$PR_URL" ]; then
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_delivery_created "${INTENT_SLUG}" "${CHANGE_STRATEGY}" "${PR_URL}"
fi
```

4. Clean up intent worktree after PR is pushed (work is on remote now):

```bash
# Clean up intent worktree after PR is pushed
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || echo "Warning: failed to remove worktree at $INTENT_WORKTREE"
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_worktree_event "deleted" "${INTENT_WORKTREE}"
fi
git worktree prune
# Keep the branch — it backs the open PR
```

5. Output the PR URL.

### If manual:

```
Intent branch ready: haiku/{intent-slug}/main → ${DEFAULT_BRANCH}

To merge:
  git checkout ${DEFAULT_BRANCH}
  git merge --no-ff haiku/{intent-slug}/main

To create PR manually:
  gh pr create --base ${DEFAULT_BRANCH} --head haiku/{intent-slug}/main

To clean up:
  /haiku:reset
```

Clean up intent worktree since all work is committed and pushed:

```bash
# Clean up intent worktree — work is committed on the branch
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || echo "Warning: failed to remove worktree at $INTENT_WORKTREE"
  echo "Cleaned up intent worktree for ${INTENT_SLUG}"
  source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
  haiku_telemetry_init
  haiku_record_worktree_event "deleted" "${INTENT_WORKTREE}"
fi
git worktree prune
# Keep the branch — user may create a PR from it
```
