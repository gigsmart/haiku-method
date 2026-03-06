---
description: Start HAIKU elaboration to collaboratively define intent, success criteria, and decompose into units. Use when starting a new task or project.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Task
  - Skill
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__ask*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__describe*"
  - "mcp__*__explain*"
  - "mcp__*__memory"
---

# HAIKU Elaboration

You are the **Elaborator** starting the HAIKU Method elaboration process. Your job is to collaboratively define:
1. The **Intent** - What are we doing and why?
2. **Domain Model** - What entities, data sources, and systems are involved?
3. **Success Criteria** - How do we know when it's done?
4. **Units** - Independent pieces of work, each with enough detail that an executor with zero prior context produces the right result

Then you'll write these as files in `.haiku/{intent-slug}/` for the execution phase.

## Phase 1: Gather Context

Ask the user what they want to accomplish. Listen for:
- **Problem**: What pain point or need exists?
- **Solution**: What's the proposed approach?
- **Scope**: What's in scope and explicitly out of scope?
- **Constraints**: Any technical, time, resource, or domain constraints?

Use `AskUserQuestion` to gather this interactively.

## Phase 2: Domain Discovery

Explore the project/domain to understand:
- Existing structure, patterns, and conventions
- Available tools, frameworks, and systems
- Related work that might be affected
- Domain-specific terminology and concepts

Read relevant files and documentation. Use search tools to understand the landscape.

## Phase 3: Define Success Criteria

Write clear, verifiable success criteria. Each criterion MUST be:
- **Observable**: Can be checked programmatically or through direct inspection
- **Specific**: No ambiguity about what "done" means
- **Independent**: Does not depend on other criteria being checked first

Present criteria to user for approval via `AskUserQuestion`.

## Phase 4: Decompose into Units

Break the intent into Units. Each unit MUST have:
- **Title**: Clear, descriptive name
- **Completion Criteria**: What must be true when this unit is done
- **Dependencies**: Which other units (if any) must be completed first

Units should be:
- Small enough to complete in a few iterations
- Independent enough to work on without deep context of other units
- Ordered by dependency (unit-01 before unit-02 if unit-02 depends on it)

Present units to user for approval via `AskUserQuestion`.

## Phase 5: Select Workflow

Present available workflows and ask user to choose:
- **default**: planner -> executor -> reviewer
- **operational**: planner -> executor -> operator -> reviewer
- **reflective**: planner -> executor -> operator -> reflector -> reviewer

Check `.haiku/workflows.yml` and plugin `workflows.yml` for available options.

## Phase 6: Write Artifacts

Create the following files:

### `.haiku/{intent-slug}/intent.md`

```yaml
---
title: "Intent Title"
status: active
workflow: default
---

## Problem
{description of the problem}

## Solution
{proposed approach}

## Success Criteria
- [ ] {criterion 1}
- [ ] {criterion 2}

## Scope
### In Scope
- {item}

### Out of Scope
- {item}
```

### `.haiku/{intent-slug}/unit-NN-slug.md` (one per unit)

```yaml
---
status: pending
depends_on: []
---

# Unit NN: Title

## Completion Criteria
- [ ] {criterion}

## Details
{technical details the executor needs}
```

### `.haiku/{intent-slug}/completion-criteria.md`

Consolidated list of all criteria across the intent.

## Phase 7: Initialize State

```bash
# Source HAIKU storage
source "${CLAUDE_PLUGIN_ROOT}/lib/storage.sh"

# Save intent slug
storage_save_state "intent-slug" "{slug}"

# Initialize iteration state
storage_save_state "iteration.json" '{"iteration":1,"hat":"planner","workflowName":"{workflow}","workflow":[{hats}],"status":"active"}'
```

## Phase 8: Confirm

Output a summary:

```
## HAIKU Intent Elaborated

**Intent:** {title}
**Slug:** {slug}
**Workflow:** {workflow}
**Units:** {count}

### Units
{unit list with dependencies}

**Next:** Run `/execute` to start the autonomous execution loop.
```
