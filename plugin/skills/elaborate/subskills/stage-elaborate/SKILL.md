---
description: (Internal) Per-stage elaboration parameterized by the active stage definition
user-invocable: false
---

# Elaborate: Stage-Elaborate Mode

Orchestrates elaboration for one stage in multi-stage mode. The active stage's definition file controls behavior — this sub-skill runs the same phase sequence regardless of which stage is active. The stage definition's metadata (discipline, available_workflows, skip, add, criteria_focus, unit_types) naturally constrains what each phase produces.

**This sub-skill runs inline** — it has full access to `AskUserQuestion`, `Agent`, and all tools from the parent skill.

---

## Inputs (from dispatcher)

The dispatcher (elaborate/SKILL.md) sets these before routing here:

- `INTENT_SLUG` — the intent slug
- `PROJECT_MATURITY` — `greenfield`, `early`, or `established`
- `AUTONOMOUS_MODE` — `true` or `false`
- `ITERATES_ON` — previous intent slug if this is a follow-up, empty otherwise
- `INTENT_DESCRIPTION` — the user's description from Phase 1
- `CLARIFICATION_ANSWERS` — Q&A from Phase 2
- `ACTIVE_STAGE` — the stage being elaborated (e.g., `design`, `product`, `dev`)
- `STAGES` — the full ordered stage list (e.g., `[design, product, dev]`)

---

## Step 0: Load Stage Definition

Read the active stage's definition file to determine elaboration parameters:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/stage.sh"
STAGE_DEF_FILE=$(resolve_stage_definition "$ACTIVE_STAGE")

# Read stage metadata (from stage definition file frontmatter)
STAGE_NAME=$(sed -n '/^---$/,/^---$/{ /^name:/s/^name: *//p }' "$STAGE_DEF_FILE")
STAGE_DESCRIPTION=$(sed -n '/^---$/,/^---$/{ /^description:/s/^description: *//p }' "$STAGE_DEF_FILE")
STAGE_AVAILABLE_WORKFLOWS=$(sed -n '/^---$/,/^---$/{ /^available_workflows:/s/^available_workflows: *//p }' "$STAGE_DEF_FILE")
STAGE_DEFAULT_WORKFLOW=$(sed -n '/^---$/,/^---$/{ /^default_workflow:/s/^default_workflow: *//p }' "$STAGE_DEF_FILE")

# Elaboration hints (optional — empty means "no constraint")
STAGE_SKIP=$(sed -n '/^---$/,/^---$/{ /^skip:/s/^skip: *//p }' "$STAGE_DEF_FILE" 2>/dev/null || echo "")
STAGE_ADD=$(sed -n '/^---$/,/^---$/{ /^add:/s/^add: *//p }' "$STAGE_DEF_FILE" 2>/dev/null || echo "")
STAGE_CRITERIA_FOCUS=$(sed -n '/^---$/,/^---$/{ /^criteria_focus:/s/^criteria_focus: *//p }' "$STAGE_DEF_FILE" 2>/dev/null || echo "")
STAGE_UNIT_TYPES=$(sed -n '/^---$/,/^---$/{ /^unit_types:/s/^unit_types: *//p }' "$STAGE_DEF_FILE" 2>/dev/null || echo "")
```

**Present stage context to the user:**

```markdown
## Stage: {STAGE_NAME}

{STAGE_DESCRIPTION}

Elaborating for the **{ACTIVE_STAGE}** stage ({N} of {total stages}).
```

---

## Step 1: Determine if This is the First Stage

```bash
FIRST_STAGE=$(echo "$STAGES" | tr ',' ' ' | awk '{print $1}')
IS_FIRST_STAGE="false"
if [ "$ACTIVE_STAGE" = "$FIRST_STAGE" ]; then
  IS_FIRST_STAGE="true"
fi
```

---

## Phase 2.25: Intent Worktree & Discovery Initialization

**If first stage:** Create the intent worktree and initialize discovery, identical to single-stage mode.

**If subsequent stage:** The worktree and discovery log already exist from the first stage. Verify we're in the right place:

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}"

if [ -d "$INTENT_WORKTREE" ]; then
  cd "$INTENT_WORKTREE"
else
  echo "ERROR: Intent worktree not found at $INTENT_WORKTREE"
  echo "Expected from prior stage. Was the first stage elaboration completed?"
  exit 1
fi
```

---

## Load Prior Artifacts (subsequent stages only)

**If `IS_FIRST_STAGE` is `false`:** Read and follow `subskills/load-prior-artifacts/SKILL.md`.

Set inputs: `INTENT_SLUG`, `ACTIVE_STAGE`, `STAGES`.

This loads all artifacts from completed stages as context for this stage's elaboration. The prior stage context informs discovery, criteria, and decomposition.

---

## Phase 2.3: Knowledge Bootstrap

**If first stage:** Run knowledge bootstrap identical to single-stage (check maturity, synthesize if needed).

**If subsequent stage:** Skip — knowledge artifacts already exist from the first stage.

---

## Phase 2.5: Domain Discovery (Delegated)

**If first stage:** Full domain discovery via discover subagent, identical to single-stage.

**If subsequent stage:** Abbreviated discovery focused on new areas and changes since the prior stage. Include prior stage context in the discovery brief under `## Previous Stage Context`.

After completion, present domain model and confirm with user (same as single-stage).

---

## Phase 2.75: Design Direction

**Check skip list:** If `design-direction` is in `STAGE_SKIP`, skip this phase.

Otherwise, **read and follow** `subskills/design-direction/SKILL.md`.

Set inputs: `INTENT_SLUG`, `PROJECT_MATURITY`, `AUTONOMOUS_MODE`.

---

## Phase 3: Workflow Selection

**Read and follow** `subskills/workflow-select/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `STAGE_CONSTRAINT="{STAGE_AVAILABLE_WORKFLOWS}"` (constrains to this stage's available workflows).

---

## Phase 4: Success Criteria

**Read and follow** `subskills/criteria/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `CRITERIA_FOCUS="{STAGE_CRITERIA_FOCUS}"`.

---

## Phase 5: Decompose

**Read and follow** `subskills/decompose/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `DOMAIN_MODEL`, `SUCCESS_CRITERIA`, `SELECTED_WORKFLOW`, `UNIT_TYPES="{STAGE_UNIT_TYPES}"`, `PRIOR_UNITS` (from load-prior-artifacts), `ITERATES_ON`.

---

## Phase 5.8: Git Strategy

**Check skip list:** If `git-strategy` is in `STAGE_SKIP`, skip this phase.

Otherwise, **read and follow** `subskills/git-strategy/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `UNITS`.

---

## Phase 5.9: Completion Announcements

Same as single-stage — read from project settings, do not ask.

---

## Phase 5.95: Iteration Stages

In stage-elaborate mode, the stages are already configured by the dispatcher. Set `stages` and `active_stage` in intent frontmatter from the dispatcher's values.

---

## Phase 6: Write H·AI·K·U Artifacts

Same artifact writing flow as single-stage:
1. Verify intent worktree
2. Write or update `intent.md`
3. Confirm quality gates
4. Write and review each unit (per-unit review loop)
5. Commit remaining artifacts

> **Stage tagging:** Every unit created during this elaboration session MUST have its `stage:` frontmatter field set to `ACTIVE_STAGE`.

---

## Phase 6.25: Generate Wireframes (Delegated)

**Skip if no units have `discipline: frontend` or `discipline: design`.**
**Check skip list:** If `wireframes` is in `STAGE_SKIP`, skip this phase.

Write the wireframes brief. Wireframe fidelity is driven by the stage's discipline:
- If the stage definition's discipline is design-oriented (stage creates units with `discipline: design`), use **HIGH fidelity** (Mode A — styled)
- Otherwise, use **LOW fidelity** (Mode B — gray-box structural)

Set `fidelity:` in the wireframes brief frontmatter accordingly.

Invoke the wireframes subagent and run the product review gate (same as single-stage).

---

## Phase 6.5 + 6.75: Sync to Ticketing Provider (Delegated)

**Check skip list:** If `ticket-sync` is in `STAGE_SKIP`, skip this phase.

Otherwise, same as single-stage — load ticketing config, write brief, invoke subagent.

---

## Phase 7 + 7.5: Spec Review & Adversarial Review

Same as single-stage — run spec review and adversarial review.

---

## Custom Sub-Skills (from stage `add` field)

If `STAGE_ADD` is non-empty, it lists custom sub-skill names to run during this stage. For each name in `STAGE_ADD`:

1. Check for a custom sub-skill definition at `.haiku/subskills/{name}/SKILL.md`
2. If found, read and follow it at the appropriate point in the flow (after decompose, before wireframes)
3. If not found, log a warning and continue

Custom sub-skills allow stage definitions to inject project-specific elaboration phases without modifying the core plugin.

---

## Phase 8: Handoff

Present the stage elaboration summary:

```markdown
Elaboration complete for **{ACTIVE_STAGE}** stage!

Intent Worktree: .haiku/worktrees/{intent-slug}/
Branch: haiku/{intent-slug}/main

Units created for this stage:
- unit-NN-{name}.md (stage: {ACTIVE_STAGE})
...

Next stage: {next stage name, or "none — all stages elaborated"}
```

If there are remaining stages:
- Tell the user which stage comes next
- The next stage will be elaborated when the user (or autopilot) advances to it

If all stages have been elaborated:
- Offer the same handoff options as single-stage (Execute, PR for review, etc.)
