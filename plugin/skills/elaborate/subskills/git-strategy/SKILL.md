---
description: (Internal) Git delivery strategy selection for H·AI·K·U elaboration
user-invocable: false
---

# Elaborate: Git Strategy

Composable sub-skill for selecting the delivery strategy, source branch, and merge behavior for an intent. Used by single-stage and stage-elaborate mode sub-skills.

**This sub-skill runs inline** — it has access to `AskUserQuestion` and the full conversation context.

---

## Inputs (from calling context)

- `INTENT_SLUG` — the intent slug
- `AUTONOMOUS_MODE` — `true` or `false`
- `UNITS` — the list of units defined during decomposition (needed for hybrid strategy heuristics)

---

## Step 1: Resolve Default Branch

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
DEFAULT_BRANCH=$(resolve_default_branch "auto" "$REPO_ROOT")
```

Use the resolved branch name (e.g. `main`, `master`, `dev`) to replace `{DEFAULT_BRANCH}` in the questions below.

---

## Step 2: Select Delivery Strategy

**Autonomous mode:** Default to intent strategy (`change_strategy: intent`, `auto_merge: true`) from the repo's default branch. No hybrid overrides. Do NOT ask. Skip to Output.

**Interactive mode:** Use `AskUserQuestion`:

**Question 1: Delivery strategy**

```json
{
  "questions": [
    {
      "question": "How should completed units be delivered?",
      "header": "Delivery Strategy",
      "options": [
        {
          "label": "Build everything, then open one PR",
          "description": "Units merge into an intent branch as they complete. Dependent units start automatically once their dependencies are done. One final PR for the whole intent."
        },
        {
          "label": "Review each unit individually",
          "description": "Each unit opens its own PR. Dependent units wait until their dependencies are merged. Best when you want to validate each piece before moving on."
        },
        {
          "label": "Build everything on {DEFAULT_BRANCH}",
          "description": "Same as above, but all work happens directly on {DEFAULT_BRANCH}. No feature branches, no PR — relies on CI to gate quality."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

**Question 2: Source branch** *(asked for ALL strategies)*

```json
{
  "questions": [
    {
      "question": "Which branch should units be created from?",
      "header": "Source Branch",
      "options": [
        {
          "label": "Use {DEFAULT_BRANCH} (recommended)",
          "description": "Create unit/intent branches from {DEFAULT_BRANCH}."
        },
        {
          "label": "Use my current branch",
          "description": "Create branches from the branch you're currently on."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

**Auto-merge** is implicit based on strategy — do NOT ask the user:
- `intent` strategy → `auto_merge: true` (units auto-merge into the intent branch)
- `unit` strategy → no `auto_merge` key (user merges their own PRs)
- `trunk` strategy → no `auto_merge` key (no branches to merge)

Map user selections to config values:

| What You Want | Strategy Value |
|--------------|----------------|
| Build everything, then open one PR | `intent` |
| Review each unit individually | `unit` |
| Build everything on {DEFAULT_BRANCH} | `trunk` |

- "Build everything, then open one PR" → `intent` + `auto_merge: true`
- "Review each unit individually" → `unit` (no `auto_merge` key)
- "Build everything on {DEFAULT_BRANCH}" → `trunk` (no `auto_merge` key)

---

## Step 3: Hybrid Per-Unit Strategy (Auto-Decided)

**Skip entirely if the user selected "Review each unit individually" or "Build everything on {DEFAULT_BRANCH}"** — per-unit overrides only make sense with the intent branch strategy.

If the user selected **"Build everything, then open one PR"** (intent strategy), evaluate whether any foundational units should use per-unit branching instead. This creates a **hybrid** strategy where one or more units get their own PR (merged directly to the default branch), while the remaining units merge into the intent branch.

**Auto-decide using these heuristics:**
- If a unit has `depends_on: []` (no dependencies) AND other units depend on it AND it involves schema migrations, shared library setup, or infrastructure provisioning → set `git: { change_strategy: unit }` on that unit (it should land on the default branch first)
- If the dependency graph is linear (A → B → C) with no clear foundational boundary → keep all units on the intent branch (no hybrid)
- If a unit has `discipline: infrastructure` and is depended on by feature units → set it as per-unit

**Only ask the user via `AskUserQuestion` when the heuristic is ambiguous** — e.g., multiple units could qualify as foundational but it's unclear which ones genuinely need to land on the default branch first. In that case:

```json
{
  "questions": [{
    "question": "Multiple units could be delivered individually to {DEFAULT_BRANCH} before the rest. Which foundational units should get their own PR?",
    "header": "Hybrid",
    "options": [
      {"label": "None — all into intent branch", "description": "Standard intent strategy, no hybrid overrides"},
      {"label": "{unit-slug-1}", "description": "{one-line description}"},
      {"label": "{unit-slug-2}", "description": "{one-line description}"}
    ],
    "multiSelect": true
  }]
}
```

Units selected get `git: { change_strategy: unit }` in their frontmatter.

---

## Output

The git strategy configuration is carried forward to the calling mode sub-skill:

```yaml
git:
  change_strategy: intent  # or unit, trunk
  auto_merge: true         # implicit for intent strategy; omit for unit/trunk
  auto_squash: false       # default false
```

Plus any per-unit overrides for hybrid strategy.
