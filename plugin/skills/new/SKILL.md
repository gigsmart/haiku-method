---
description: Start a new H·AI·K·U intent
user-invocable: true
argument-hint: "[description]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - Skill
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__resolve*"
  - "mcp__*__memory"
---

# H·AI·K·U New Intent

## Name

`haiku:new` - Start a new H·AI·K·U intent with studio and stage configuration.

## Synopsis

```
/haiku:new [description]
/haiku:new --template <template-name> [--param key=value ...]
```

## Description

**User-facing command** - Creates a new intent with studio detection, mode selection, and workspace initialization. This replaces the "gather intent" portion of the old elaborate flow.

### Template Mode

When `--template` is provided, the intent is seeded from a studio template file:

1. **Resolve the template**: Look in `plugin/studios/{studio}/templates/{name}.md` and `.haiku/studios/{studio}/templates/{name}.md` (project override takes precedence).
2. **Parse parameters**: Extract `parameters:` from template frontmatter. Match `--param key=value` arguments against required parameters. If required parameters are missing, ask the user via `AskUserQuestion`.
3. **Apply parameter substitution**: Replace `{{ param }}` placeholders in unit criteria and content.
4. **Create units**: Write pre-filled unit files from the template's `units:` section to the appropriate stage directories.
5. **Apply stage override**: If the template specifies `stages-override:`, only those stages are active (others skipped).
6. **Skip decomposition**: Since units are pre-defined, the first `/haiku:run` skips the decompose step and goes straight to execution.

**Example:**
```
/haiku:new --template new-prospect --param company="Acme Corp" --param source=referral
```

This creates a sales intent pre-filled with units for Acme Corp, with criteria like "Acme Corp business model and pain points documented."

**Relationship to other commands:**
- `/haiku:new` creates the intent and workspace
- `/haiku:run` advances the intent through its stages (plan, build, review, gate)
- `/haiku:elaborate` is now a backward-compatibility alias that delegates to this flow

---

## Pre-checks

1. **Reject cowork mode:**
   ```bash
   if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
     echo "ERROR: /haiku:new cannot run in cowork mode."
     echo "Please run from a standard Claude Code CLI session."
     exit 1
   fi
   ```

2. **Verify git repo:** Must be in a git repository.

3. **Check for existing active intent:** If `.haiku/intents/*/intent.md` has an active intent, warn the user and confirm whether to create a new intent or resume the existing one.

---

## Implementation

### Step 1: Gather Intent

If an argument is provided, use it as the intent description. Otherwise ask:

> What do you want to accomplish?

Use `AskUserQuestion` to gather the description.

### Step 2: Extract Slug

Convert the intent description to a kebab-case slug:
- Lowercase
- Replace spaces and special characters with hyphens
- Remove consecutive hyphens
- Max 40 characters
- Trim trailing hyphens

### Step 3: Detect Studio

Read `studio:` from `.haiku/settings.yml`:
```bash
# Read studio from settings via file read (no shell lib needed)
local studio=$(yq -r '.studio // ""' .haiku/settings.yml 2>/dev/null)
```

If not set, default to `ideation`.

Verify the studio exists by checking for `plugin/studios/{studio}/STUDIO.md` or `.haiku/studios/{studio}/STUDIO.md`. If neither exists, fall back to `ideation`.

### Step 4: Ask Mode

Ask the user to choose their execution mode using `AskUserQuestion`:

**Continuous mode:** All stages are collapsed into a single flow. Functionally identical to the old elaborate-then-execute pattern. Best when you want to drive the process yourself and review at gates.

**Discrete mode:** Each stage runs independently. You invoke `/haiku:run` to advance through stages one at a time. Best for structured, phased work.

Options:
1. **Continuous** - I'll drive, you review at gates
2. **Discrete** - I'll invoke each stage separately

Default: `continuous`

**When called from `/haiku:autopilot`:** Skip this question. Use `continuous` mode automatically (the autopilot skill passes the mode).

### Step 5: Resolve Stages

Load the stage list from the studio definition:
```bash
# Read stages from the studio STUDIO.md frontmatter (no shell lib needed)
# Read plugin/studios/{studio}/STUDIO.md and parse the stages: field from frontmatter
local stages=$(yq --front-matter=extract -r '.stages[]' "$CLAUDE_PLUGIN_ROOT/studios/$studio/STUDIO.md" 2>/dev/null)
```

For continuous mode, `stages:` in frontmatter is set to `[]` and `active_stage:` to `""` (no stage tracking — the run command handles the collapse).

For discrete mode, `stages:` lists all stages and `active_stage:` is set to the first stage.

### Step 6: Create Intent File

Write `.haiku/intents/{slug}/intent.md` with frontmatter:

```yaml
---
studio: {studio_name}
stages: [{stage_list}]       # [] for continuous
active_stage: {first_stage}  # "" for continuous
mode: {continuous|discrete}
status: active
created: {YYYY-MM-DD}
---
```

Include the user's intent description as the markdown body:

```markdown
# {Intent Title}

## Problem

{User's description of what they want to accomplish}

## Solution

{To be defined during the plan phase}

## Success Criteria

{To be defined during the plan phase}
```

### Step 7: Create Workspace

Create the directory structure:
```
.haiku/intents/{slug}/
  intent.md
  knowledge/
  stages/
  state/
```

### Step 8: Persistence Setup

```bash
# Persistence is automatic — git add + commit the intent directory
git add ".haiku/intents/{slug}/"
git commit -m "haiku: new intent — {slug}"
```

### Step 9: Next Step

**Continuous mode:** Tell the user the intent is created and automatically transition to `/haiku:run`:
```
Intent created: {slug}
Studio: {studio_name} | Mode: continuous

Starting first stage...
```
Then invoke `/haiku:run` via the `Skill` tool.

**Discrete mode:** Tell the user what to do next:
```
Intent created: {slug}
Studio: {studio_name} | Mode: discrete
Stages: {stage_list}
Active stage: {first_stage}

Run /haiku:run to start the first stage.
```

---

## Autonomous Mode (for /haiku:autopilot)

When called from autopilot, the following adjustments apply:
- Skip the mode question — use `continuous`
- Skip confirmation prompts — proceed automatically
- The intent description is provided as the argument (required)
- Do NOT invoke `/haiku:run` at the end — autopilot handles the transition

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No git repo | Error: "Must be in a git repository" |
| Cowork mode | Error: "Cannot run in cowork mode" |
| Active intent exists | Warn, ask to confirm or resume |
| Invalid studio | Fall back to ideation, warn user |
| Branch already exists | Checkout existing branch, warn user |
