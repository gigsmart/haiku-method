---
description: (Internal) Hat discovery and workflow selection for H·AI·K·U elaboration
user-invocable: false
---

# Elaborate: Workflow Selection

Composable sub-skill for discovering available hats, presenting workflow options, and selecting the workflow for an intent. Used by single-stage and stage-elaborate mode sub-skills.

**This sub-skill runs inline** — it has access to `AskUserQuestion` and the full conversation context.

---

## Inputs (from calling context)

- `INTENT_SLUG` — the intent slug
- `AUTONOMOUS_MODE` — `true` or `false`
- `STAGE_CONSTRAINT` (optional) — if set, constrains available workflows to those listed in the active stage's `available_workflows` field. Empty for single-stage mode.

---

## Step 1: Discover Available Hats

Read all available hat definitions dynamically by parsing YAML frontmatter from hat files:

```bash
# List all hats from plugin directory
for hat_file in "${CLAUDE_PLUGIN_ROOT}/hats/"*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(sed -n '/^---$/,/^---$/{ /^name:/s/^name: *//p }' "$hat_file" 2>/dev/null)
  desc=$(sed -n '/^---$/,/^---$/{ /^description:/s/^description: *//p }' "$hat_file" 2>/dev/null)
  echo "- **${name:-$slug}** (\`$slug\`): $desc"
done

# Also check for project-local hat overrides
for hat_file in .haiku/hats/*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(sed -n '/^---$/,/^---$/{ /^name:/s/^name: *//p }' "$hat_file" 2>/dev/null)
  desc=$(sed -n '/^---$/,/^---$/{ /^description:/s/^description: *//p }' "$hat_file" 2>/dev/null)
  echo "- **${name:-$slug}** (\`$slug\`): $desc [project override]"
done
```

Display the available hats to the user so they can see what's available for workflow composition.

---

## Step 2: Discover Available Workflows

Read workflows from plugin defaults and project overrides:

```bash
# Plugin workflows (defaults)
cat "${CLAUDE_PLUGIN_ROOT}/workflows.yml"

# Project workflow overrides (if any)
[ -f ".haiku/workflows.yml" ] && cat ".haiku/workflows.yml"
```

**If `STAGE_CONSTRAINT` is set:** filter the discovered workflows to only those whose names appear in the `STAGE_CONSTRAINT` list. This ensures stage-specific elaboration only offers workflows appropriate for the active stage's discipline.

---

## Step 3: Select or Compose Workflow

### 3a. Preflight — Display Available Options

Show the user all predefined workflows and available hats:

```markdown
## Available Workflows

{List each predefined workflow with its hat sequence, from Step 2}

## Available Hats

{List each hat with its slug and one-line description, from Step 1}
```

### 3b. Recommendation — Suggest the Best Fit

Analyze the intent against the available options. Consider:
- What phases does this intent actually need? (Not every intent needs planning — a pure refactor might skip straight to builder.)
- Does the domain suggest specialized hats? (Security-sensitive work benefits from red-team/blue-team. Bug investigations benefit from observer/hypothesizer.)
- Keep it minimal — every hat adds an iteration cycle. Don't add hats "just in case."

Present your recommendation with reasoning:

```markdown
## Recommendation

**{workflow name or "Custom"}**: {hats as arrows}

{1-2 sentences explaining why this fits the intent. Reference specific aspects of what the user described.}
```

### 3c. User Decides

**Autonomous mode:** Use the recommended workflow directly. Run the recommendation logic, then apply it without asking. Skip to output.

**Interactive mode:** Use `AskUserQuestion` with the predefined workflows as options. Do NOT hardcode options — use the workflows discovered in Step 2:

```json
{
  "questions": [{
    "question": "Which workflow would you like to use?",
    "header": "Workflow",
    "options": [
      {"label": "{recommended} (Recommended)", "description": "{hats as arrows}"},
      {"label": "{workflow2}", "description": "{hats as arrows}"},
      {"label": "{workflow3}", "description": "{hats as arrows}"},
      {"label": "Custom", "description": "Tell me which hats to use and in what order"}
    ],
    "multiSelect": false
  }]
}
```

If your recommendation is a custom composition, include it as the first option with "(Recommended)". The predefined workflows still appear as alternatives.

If the user selects "Custom", ask them to specify which hats to include and in what order.

---

## Output

The selected workflow name and hat sequence are carried forward to the calling mode sub-skill for writing into intent.md frontmatter.
