---
description: Resume work on an existing HAIKU intent when state is lost
argument-hint: "[intent-slug]"
---

## Name

`haiku:resume` - Resume an existing HAIKU intent.

## Synopsis

```
/resume [intent-slug]
```

## Description

**User-facing command** - Resume work on an intent when iteration state is lost but `.haiku/` artifacts exist.

This happens when:
- Session context was cleared unexpectedly
- Starting fresh session after previous work
- State lost but artifacts preserved

## Implementation

### Step 1: Find Resumable Intents

If no slug provided, scan for active intents:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"

for intent_file in .haiku/*/intent.md; do
  [ -f "$intent_file" ] || continue
  dir=$(dirname "$intent_file")
  slug=$(basename "$dir")
  # Check status from frontmatter
  status=$(_yaml_get_simple "status" "active" < "$intent_file")
  [ "$status" = "active" ] && echo "$slug"
done
```

**Selection logic:**
- 1 intent found -> auto-select
- Multiple intents -> list and prompt user
- 0 intents -> error, suggest `/elaborate`

### Step 2: Load Intent Metadata

Read from `.haiku/{slug}/intent.md`:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
WORKFLOW=$(han parse yaml workflow -r --default "default" < ".haiku/${slug}/intent.md")
TITLE=$(han parse yaml title -r --default "$slug" < ".haiku/${slug}/intent.md")
```

### Step 3: Determine Starting Hat

Use DAG analysis:

```bash
starting_hat=$(get_recommended_hat ".haiku/${slug}" "${WORKFLOW}")
```

**Hat selection logic:**
- No units exist -> `planner`
- All units completed -> `reviewer`
- Any units in_progress or ready -> `executor`
- All units blocked -> `planner`

### Step 4: Initialize State

```bash
# Save to storage
storage_save_state "intent-slug" "$SLUG"
storage_save_state "iteration.json" '{"iteration":1,"hat":"'"$STARTING_HAT"'","workflowName":"'"$WORKFLOW"'","workflow":'"$WORKFLOW_HATS_JSON"',"status":"active"}'
```

### Step 5: Output Confirmation

```markdown
## HAIKU Intent Resumed

**Intent:** {title}
**Slug:** {slug}
**Workflow:** {workflow}
**Starting Hat:** {startingHat}

### Unit Status
{get_dag_status_table output}

**Summary:** {completed}/{total} units completed

**Next:** Run `/execute` to continue the execution loop.
```
