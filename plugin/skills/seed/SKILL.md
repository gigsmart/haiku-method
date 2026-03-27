---
description: Plant forward-looking ideas with trigger conditions that auto-surface at the right milestone
disable-model-invocation: true
user-invocable: true
argument-hint: "[plant|list|check]"
---

## Name

`ai-dlc:seed` - Plant, track, and surface forward-looking ideas at the right moment.

## Synopsis

```
/seed plant
/seed list
/seed check
```

## Description

**User-facing command** - Manage a garden of forward-looking ideas ("seeds") that auto-surface when their trigger conditions are met.

Seeds capture ideas that aren't actionable yet but will become relevant at a future milestone. Each seed has a trigger condition describing when it should surface. During elaboration, seeds are checked automatically so good ideas aren't lost.

## Seed File Format

Seeds are stored in `.ai-dlc/seeds/{slug}.md`:

```yaml
---
title: "{idea title}"
planted: "{ISO date}"
trigger: "{condition that should surface this seed}"
status: planted | surfaced | harvested | pruned
---
{Description of the idea and why it matters}
```

### Status Lifecycle

- **planted** - Seed is dormant, waiting for its trigger condition
- **surfaced** - Trigger condition matched; seed has been presented to the user
- **harvested** - Seed was acted on (turned into an intent or incorporated into work)
- **pruned** - Seed was reviewed and intentionally discarded

## Implementation

### Command: `/seed plant`

Interactively capture a new seed idea.

1. **Gather seed details** using `AskUserQuestion`:
   - What is the idea? (becomes the title and description)
   - When should this surface? (becomes the trigger condition)

2. **Generate a slug** from the title (lowercase, hyphens, no special characters).

3. **Write the seed file**:

```bash
SEED_DIR=".ai-dlc/seeds"
mkdir -p "$SEED_DIR"

SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
SEED_FILE="$SEED_DIR/${SLUG}.md"
```

Write to `$SEED_FILE`:
```markdown
---
title: "{title}"
planted: "{ISO date}"
trigger: "{trigger condition}"
status: planted
---
{Description of the idea and why it matters}
```

4. **Commit the seed**:

```bash
git add "$SEED_FILE" && git commit -m "seed: plant ${SLUG}"
```

5. **Confirm to user**:
```
Seed planted: {title}
Trigger: {trigger condition}
File: .ai-dlc/seeds/{slug}.md
```

### Command: `/seed list`

Display all planted seeds grouped by status.

1. **Scan seed directory**:

```bash
SEED_DIR=".ai-dlc/seeds"
if [ ! -d "$SEED_DIR" ] || [ -z "$(ls -A "$SEED_DIR" 2>/dev/null)" ]; then
  echo "No seeds planted yet. Use /seed plant to capture an idea."
  exit 0
fi
```

2. **Parse and display each seed**, grouped by status:

```markdown
## Seeds

### Planted (awaiting trigger)
| Title | Trigger | Planted |
|-------|---------|---------|
| {title} | {trigger} | {date} |

### Surfaced (trigger matched)
| Title | Trigger | Planted |
|-------|---------|---------|
| {title} | {trigger} | {date} |

### Harvested (acted on)
| Title | Planted |
|-------|---------|
| {title} | {date} |

### Pruned (discarded)
| Title | Planted |
|-------|---------|
| {title} | {date} |
```

Only show sections that have entries.

### Command: `/seed check`

Check if any planted seeds should surface based on current context.

1. **Load current context**:

```bash
# Determine current intent (if any)
INTENT_DIR=$(ls -d .ai-dlc/*/intent.md 2>/dev/null | head -1 | xargs dirname 2>/dev/null || echo "")
if [ -n "$INTENT_DIR" ]; then
  INTENT_CONTENT=$(cat "$INTENT_DIR/intent.md")
fi
```

2. **Check each planted seed**:

```bash
for seed in .ai-dlc/seeds/*.md; do
  [ -f "$seed" ] || continue

  # Extract frontmatter
  SEED_STATUS=$(sed -n 's/^status: *//p' "$seed")
  [ "$SEED_STATUS" = "planted" ] || continue

  SEED_TITLE=$(sed -n 's/^title: *"*\([^"]*\)"*/\1/p' "$seed")
  SEED_TRIGGER=$(sed -n 's/^trigger: *"*\([^"]*\)"*/\1/p' "$seed")
  SEED_BODY=$(sed '1,/^---$/d; 1,/^---$/d' "$seed")

  # Check if trigger condition matches current intent or milestone
  # Present to agent for semantic matching against current context
done
```

3. **For each seed whose trigger condition is relevant**, present:

```markdown
A previously planted seed may be relevant:

**{title}** (planted {date})
Trigger: {trigger condition}

{description}

---
Actions: [Harvest into current intent] [Surface later] [Prune]
```

4. **Update seed status** based on user action:
   - **Harvest**: Set status to `harvested`, incorporate into current work
   - **Surface later**: Leave as `planted`
   - **Prune**: Set status to `pruned`

5. **Commit any status changes**:

```bash
git add .ai-dlc/seeds/ && git commit -m "seed: check and update seed statuses"
```

## Auto-Surfacing During Elaboration

During the elaboration phase (Phase 1 of the AI-DLC), the elaborate skill should check for relevant seeds:

```bash
# At the start of elaboration, check for relevant seeds
SEED_DIR=".ai-dlc/seeds"
if [ -d "$SEED_DIR" ]; then
  for seed in "$SEED_DIR"/*.md; do
    [ -f "$seed" ] || continue
    SEED_STATUS=$(sed -n 's/^status: *//p' "$seed")
    [ "$SEED_STATUS" = "planted" ] || continue

    SEED_TRIGGER=$(sed -n 's/^trigger: *"*\([^"]*\)"*/\1/p' "$seed")

    # Semantic check: does the trigger condition relate to what's being elaborated?
    # If the user's intent description or domain overlaps with the trigger, surface it
  done
fi
```

This ensures seeds are not forgotten and surface naturally when the right work begins.

## Examples

### Planting a seed
```
> /seed plant
What is your idea? "Add visual dependency graphs for unit DAGs"
When should this surface? "When working on any intent related to UI, dashboards, or visualization"

Seed planted: Add visual dependency graphs for unit DAGs
Trigger: When working on any intent related to UI, dashboards, or visualization
File: .ai-dlc/seeds/add-visual-dependency-graphs-for-unit-dags.md
```

### Checking seeds during elaboration
```
> /seed check

A previously planted seed may be relevant:

**Add visual dependency graphs for unit DAGs** (planted 2026-03-15)
Trigger: When working on any intent related to UI, dashboards, or visualization

Visual representation of the unit dependency DAG would help users
understand execution order and parallelism opportunities. Could use
Mermaid or D3.js for rendering.

---
Actions: [Harvest into current intent] [Surface later] [Prune]
```
