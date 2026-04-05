---
description: (Internal) Load completed stage artifacts as context for subsequent stages
user-invocable: false
---

# Elaborate: Load Prior Artifacts

Composable sub-skill that reads artifacts from completed stages as context for the current stage during multi-stage elaboration. This provides continuity between stages — each subsequent stage builds on what came before.

**This sub-skill runs inline** — it reads files and sets context variables.

---

## Inputs (from calling context)

- `INTENT_SLUG` — the intent slug
- `ACTIVE_STAGE` — the current stage being elaborated
- `STAGES` — the ordered list of all stages for this intent (e.g., `[design, product, dev]`)

---

## Step 1: Identify Prior Stages

Determine which stages have already been completed by examining the stage order:

```bash
PRIOR_STAGES=""
for stage in $(echo "$STAGES" | tr ',' ' '); do
  if [ "$stage" = "$ACTIVE_STAGE" ]; then
    break
  fi
  PRIOR_STAGES="${PRIOR_STAGES}${PRIOR_STAGES:+ }${stage}"
done
```

If `PRIOR_STAGES` is empty, this is the first stage — skip to Output with empty context.

---

## Step 2: Load Stage Artifacts

For each prior stage, load the artifacts it produced:

### 2a. Load prior units

Read all unit files tagged with a prior stage:

```bash
INTENT_DIR=".haiku/intents/${INTENT_SLUG}"

for unit_file in ${INTENT_DIR}/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_STAGE=$(sed -n '/^---$/,/^---$/{ /^stage:/s/^stage: *//p }' "$unit_file" 2>/dev/null || echo "")
  
  for prior_stage in $PRIOR_STAGES; do
    if [ "$UNIT_STAGE" = "$prior_stage" ]; then
      # This unit belongs to a prior stage — include in context
      echo "## $(basename "$unit_file") (stage: $UNIT_STAGE)"
      cat "$unit_file"
      echo "---"
    fi
  done
done
```

### 2b. Load prior stage design artifacts

If a prior stage was `design`, check for:
- Design blueprint: `.haiku/intents/${INTENT_SLUG}/design-blueprint.md`
- Wireframes: `.haiku/intents/${INTENT_SLUG}/mockups/`
- Design knowledge: `.haiku/knowledge/design.md`

```bash
# Design blueprint
if [ -f ".haiku/intents/${INTENT_SLUG}/design-blueprint.md" ]; then
  echo "## Design Blueprint"
  cat ".haiku/intents/${INTENT_SLUG}/design-blueprint.md"
fi

# Wireframes list
if [ -d ".haiku/intents/${INTENT_SLUG}/mockups" ]; then
  echo "## Wireframes"
  ls -1 ".haiku/intents/${INTENT_SLUG}/mockups/"*.html 2>/dev/null
fi

# Design knowledge
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
DESIGN_K=$(hku_knowledge_read "design" 2>/dev/null || echo "")
if [ -n "$DESIGN_K" ]; then
  echo "## Design Knowledge"
  echo "$DESIGN_K"
fi
```

### 2c. Load discovery context

The discovery log is shared across stages — always load it:

```bash
if [ -f "${INTENT_DIR}/discovery.md" ]; then
  echo "## Discovery Context"
  cat "${INTENT_DIR}/discovery.md"
fi
```

### 2d. Load intent-level context

Read the current intent.md for the problem statement, solution, domain model, and criteria defined by prior stages:

```bash
if [ -f "${INTENT_DIR}/intent.md" ]; then
  echo "## Intent Context"
  cat "${INTENT_DIR}/intent.md"
fi
```

---

## Step 3: Build Context Summary

Synthesize the loaded artifacts into a structured context summary:

```markdown
## Prior Stage Context

### Stages Completed
{list of prior stages and their status}

### Prior Units
| Unit | Stage | Discipline | Status | Description |
|------|-------|-----------|--------|-------------|
| {unit slug} | {stage} | {discipline} | {status} | {brief description} |

### Design Direction (if design stage completed)
- Archetype: {from blueprint}
- Key tokens: {colors, fonts, spacing}
- Layout approach: {from blueprint guidelines}

### Key Decisions
{Summarize major decisions from prior stage artifacts that constrain this stage}

### What This Stage Should Build On
{Specific guidance for how the current stage relates to prior work}
```

---

## Output

The prior stage context is carried forward to the calling mode sub-skill. This context is used by:
- **criteria** — to reference or extend prior stage criteria without duplicating
- **decompose** — to create units that build on prior stage units
- **workflow-select** — to understand what workflows were already used
- **discover** — to focus exploration on areas not yet covered

When the current stage is `product`, emphasize design artifacts as input context.
When the current stage is `dev`, emphasize both design and product artifacts as input context.
