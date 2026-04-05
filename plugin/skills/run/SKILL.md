---
description: Advance an H·AI·K·U intent through its next stage
user-invocable: true
argument-hint: "[intent-slug]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - Skill
  - Task
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP patterns
  - "mcp__*__haiku_*"
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__memory"
  # Ticketing provider write tools
  - "mcp__*__create*issue*"
  - "mcp__*__create*ticket*"
  - "mcp__*__update*issue*"
  - "mcp__*__update*ticket*"
  - "mcp__*__add*comment*"
---

# H·AI·K·U Run

## Name

`haiku:run` - Advance an H·AI·K·U intent through its stages.

## Synopsis

```
/haiku:run [intent-slug]
```

## Description

**User-facing command** — Drives an intent through the studio's stage sequence. The MCP orchestrator (`haiku_run_next`) tells you what to do at each step. You execute, then ask again. Repeat until the intent completes.

## Pre-checks

1. **Reject cowork mode:** If `CLAUDE_CODE_IS_COWORK=1`, stop with an error.
2. **Context window preflight:** Verify sufficient context for meaningful work.

## Implementation

### The Loop

The entire execution model is a loop:

```
1. Call haiku_run_next { intent: slug }
2. Read the returned action
3. Execute the action
4. Repeat from step 1
```

The orchestrator handles ALL state logic — which stage is active, which phase it's in, which unit is ready, whether the gate passed. You just follow the action.

### Resolving the Intent

If a slug was provided as an argument, use it. Otherwise:

```
haiku_intent_list → find the active intent
```

If no active intent: error, suggest `/haiku:new`.

### Action Reference

The orchestrator returns one of these actions. Follow the instructions for each:

#### `start_stage`

A new stage is beginning. The orchestrator provides the stage name and hat list.

```json
{ "action": "start_stage", "intent": "...", "studio": "...", "stage": "...", "hats": [...] }
```

**Do:**
1. `haiku_stage_start { intent, stage }` — marks the stage as active
2. Call `haiku_run_next` again — it will return `decompose`

#### `decompose`

Break the stage's work into units.

```json
{ "action": "decompose", "intent": "...", "studio": "...", "stage": "..." }
```

**Do:**
1. Read the stage's STAGE.md for inputs, unit types, and criteria guidance
2. Load resolved input artifacts (outputs from prior stages). Check freshness metadata — if inputs are stale or code has drifted, use `/haiku:refine stage:{upstream}` for a scoped side-trip
3. Decompose the work into units with completion criteria and a dependency DAG
4. Write unit files to `.haiku/intents/{slug}/stages/{stage}/units/`
5. `haiku_stage_set { intent, stage, field: "phase", value: "execute" }`
6. Call `haiku_run_next` again

#### `start_unit`

A unit is ready to start. The orchestrator identifies which unit and the first hat.

```json
{ "action": "start_unit", "intent": "...", "stage": "...", "unit": "...", "first_hat": "...", "hats": [...] }
```

**Do:**
1. `haiku_unit_start { intent, stage, unit, hat: first_hat }`
2. Load the hat definition from `stages/{stage}/hats/{hat}.md`
3. Load the unit's `## References` section
4. Execute the hat's work
5. Call `haiku_run_next` again

#### `continue_unit`

An active unit — resume where you left off.

```json
{ "action": "continue_unit", "intent": "...", "stage": "...", "unit": "...", "hat": "...", "bolt": N, "hats": [...] }
```

**Do:**
1. Load the current hat definition
2. Continue the hat's work
3. When the hat's work is done, advance to the next hat:
   `haiku_unit_advance_hat { intent, stage, unit, hat: next_hat }`
4. After all hats complete, check unit completion criteria
5. If criteria met: `haiku_unit_complete { intent, stage, unit }`
6. If not met: `haiku_unit_increment_bolt { intent, stage, unit }` — starts a new bolt cycle
7. Call `haiku_run_next` again

**CRITICAL: No questions during execution.** The bolt loop is fully autonomous. If you encounter ambiguity, make a reasonable decision. Document assumptions in the unit's `## Notes` section.

#### `advance_phase`

The orchestrator is moving to the next phase within a stage.

```json
{ "action": "advance_phase", "intent": "...", "stage": "...", "from_phase": "...", "to_phase": "..." }
```

**Do:**
1. `haiku_stage_set { intent, stage, field: "phase", value: to_phase }`
2. Call `haiku_run_next` again

#### `review`

Run adversarial review agents for the stage.

```json
{ "action": "review", "intent": "...", "studio": "...", "stage": "..." }
```

**Do:**
1. Load review agents from `stages/{stage}/review-agents/` (own agents)
2. Load included agents from `review-agents-include` in the stage's STAGE.md
3. Spawn one subagent per review agent, in parallel — each gets the mandate, the diff, and the stage outputs
4. Collect findings. If HIGH severity findings: fix them, then repeat review (up to 3 cycles)
5. `haiku_stage_set { intent, stage, field: "phase", value: "persist" }`
6. Call `haiku_run_next` again

#### `persist`

Save stage outputs to their scoped locations.

```json
{ "action": "persist", "intent": "...", "stage": "..." }
```

**Do:**
1. Write stage outputs to scope-based locations (project, intent, stage, repo)
2. Commit: `git add .haiku/intents/{slug}/stages/{stage}/ && git commit -m "haiku: persist stage outputs — {stage}"`
3. `haiku_stage_set { intent, stage, field: "phase", value: "gate" }`
4. `haiku_stage_set { intent, stage, field: "gate_entered_at", value: NOW }`
5. Call `haiku_run_next` again

#### `gate_ask`

The stage's review gate requires human approval.

```json
{ "action": "gate_ask", "intent": "...", "stage": "...", "next_stage": "..." }
```

**Do:**
1. Present a stage summary to the user via `AskUserQuestion`
2. If approved: `haiku_gate_approve { intent, stage }` then call `haiku_run_next`
3. If declined: stop and let the user decide

#### `gate_external`

Push for external review.

```json
{ "action": "gate_external", "intent": "...", "stage": "...", "next_stage": "..." }
```

**Do:**
1. Push the branch and create a PR/MR
2. `haiku_stage_complete { intent, stage, gate_outcome: "blocked" }`
3. Report: "External review required. Run `/haiku:run` after review resolves."

#### `gate_await`

Waiting for an external event.

```json
{ "action": "gate_await", "intent": "...", "stage": "...", "next_stage": "..." }
```

**Do:**
1. Report what is being awaited
2. `haiku_stage_complete { intent, stage, gate_outcome: "awaiting" }`
3. Stop. The user runs `/haiku:run` when the event occurs.

#### `advance_stage`

Gate passed — moving to the next stage (continuous mode).

```json
{ "action": "advance_stage", "intent": "...", "stage": "...", "next_stage": "...", "gate_outcome": "advanced" }
```

**Do:**
1. `haiku_stage_complete { intent, stage, gate_outcome: "advanced" }`
2. `haiku_intent_set { slug, field: "active_stage", value: next_stage }`
3. Commit stage artifacts
4. Call `haiku_run_next` again — it will return `start_stage` for the next stage

#### `stage_complete_discrete`

Stage done but discrete mode — stop and wait for user.

```json
{ "action": "stage_complete_discrete", "intent": "...", "stage": "...", "next_stage": "..." }
```

**Do:**
1. `haiku_stage_complete { intent, stage, gate_outcome: "advanced" }`
2. `haiku_intent_set { slug, field: "active_stage", value: next_stage }`
3. Report: "Stage complete. Run `/haiku:run` for the next stage."

#### `intent_complete`

All stages are done.

```json
{ "action": "intent_complete", "intent": "...", "studio": "..." }
```

**Do:**
1. `haiku_intent_set { slug, field: "status", value: "completed" }`
2. `haiku_intent_set { slug, field: "completed_at", value: NOW }`
3. Report completion summary. Suggest `/haiku:review` then PR creation.

#### `blocked`

Units are blocked on dependencies or need intervention.

```json
{ "action": "blocked", "intent": "...", "stage": "...", "blocked_units": [...] }
```

**Do:**
1. Report which units are blocked and why
2. Ask the user for guidance

#### `composite_run_stage`

For composite intents — a specific studio:stage is ready.

```json
{ "action": "composite_run_stage", "intent": "...", "studio": "...", "stage": "...", "hats": [...] }
```

**Do:** Same as `start_stage`, but for a composite intent. The orchestrator handles sync points.

#### `error`

Something is wrong.

```json
{ "action": "error", "message": "..." }
```

**Do:** Report the error to the user.

## Relationship to Other Skills

- **`/haiku:new`** — Creates the intent that `/haiku:run` advances
- **`/haiku:composite`** — Creates composite intents with sync points
- **`/haiku:refine`** — Amend specs mid-execution or refine upstream stages
- **`/haiku:review`** — Pre-delivery code review
- **`/haiku:reflect`** — Post-completion analysis
- **`/haiku:operate`** — Post-delivery operational tasks
