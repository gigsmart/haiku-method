---
description: Create a composite intent that runs stages from multiple studios in parallel with sync points
user-invocable: true
argument-hint: "[description]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__resolve*"
  - "mcp__*__memory"
---

# H·AI·K·U Composite Intent

## Name

`haiku:composite` — Create a composite intent combining stages from multiple studios.

## Synopsis

```
/haiku:composite [description]
```

## Description

**User-facing command** — Creates an intent that runs stages from 2+ studios in parallel with sync points. Use this when work spans multiple domains that need coordinated delivery.

**Examples:**
- Product launch: software (build the feature) + marketing (launch the campaign)
- Compliance remediation: software (fix the code) + compliance (document the fix)
- Feature with docs: software (build) + documentation (write the docs)

For single-studio work, use `/haiku:new` instead.

## Implementation

### Step 1: Gather Description

If no argument provided, ask what the work is:

```json
{
  "questions": [{
    "question": "What are you trying to accomplish?",
    "header": "Composite Intent",
    "options": [
      {"label": "I'll describe it", "description": "Enter the intent description"}
    ]
  }]
}
```

### Step 2: Select Studios

List available studios and ask the user to select which ones this work spans:

```bash
source "$CLAUDE_PLUGIN_ROOT/lib/studio.sh"
# List all available studios
for studio_dir in "$CLAUDE_PLUGIN_ROOT/studios"/*/; do
  name=$(basename "$studio_dir")
  desc=$(yq --front-matter=extract -r '.description // ""' "$studio_dir/STUDIO.md" 2>/dev/null)
  echo "- **$name**: $desc"
done
```

Present as a multi-select `AskUserQuestion`. Require at least 2 selections.

### Step 3: Select Stages Per Studio

For each selected studio, show its stages and let the user select which ones to include:

```json
{
  "questions": [{
    "question": "Which stages from the Software studio?",
    "header": "Software Stages",
    "options": [
      {"label": "inception", "description": "Problem understanding, unit decomposition"},
      {"label": "design", "description": "Visual and interaction design"},
      {"label": "development", "description": "Implementation with quality gates"}
    ],
    "multiSelect": true
  }]
}
```

The agent should recommend which stages to include based on the intent description. For example, a "product launch" intent probably needs software's full pipeline but only marketing's content→launch stages.

### Step 4: Define Sync Points

Ask the user where the studios need to synchronize:

```
The studios will run in parallel. Are there stages that must wait for other stages to complete?

For example: "marketing:launch must wait for software:development and marketing:content"
```

Build the `sync:` rules from the user's input. The agent should also suggest sync points based on the stage selection — if one studio's stage produces outputs that another studio's stage consumes, that's a natural sync point.

### Step 5: Create Intent

Generate the intent slug from the description. Create the workspace:

```bash
INTENT_DIR=".haiku/intents/${SLUG}"
mkdir -p "$INTENT_DIR"/{knowledge,state}

# Create stage directories for all selected studios
for studio in $SELECTED_STUDIOS; do
  for stage in $SELECTED_STAGES[$studio]; do
    mkdir -p "$INTENT_DIR/stages/${studio}-${stage}/units"
  done
done
```

Write `intent.md` with composite frontmatter:

```yaml
---
title: "{title}"
status: active
mode: continuous
composite:
  - studio: software
    stages: [inception, design, development]
  - studio: marketing
    stages: [research, strategy, content, launch]
sync:
  - wait: [software:development, marketing:content]
    then: [marketing:launch]
composite_state:
  software: inception
  marketing: research
---

{intent description}
```

### Step 6: Report

```markdown
Composite intent created: **{slug}**

Studios:
- **Software**: inception → design → development
- **Marketing**: research → strategy → content → launch

Sync points:
- marketing:launch waits for software:development + marketing:content

Run `/haiku:run` to start. Both studios' first stages will run in parallel.
```

## How /haiku:run Handles Composites

When `/haiku:run` encounters a composite intent (Step 2c in the run skill):

1. Finds all runnable stages across all studios (respecting sync dependencies)
2. Runs the first runnable stage through the standard stage loop
3. On completion, advances that studio's active stage
4. Checks if any sync-blocked stages are now unblocked
5. Continues until all studios complete all their stages

The stage loop itself is identical — hats, review agents, review gates all come from the stage's studio definition. Only the orchestration of *which stage to run next* is different.
