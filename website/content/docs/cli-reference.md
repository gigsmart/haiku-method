---
title: CLI Reference
description: Complete reference for all /haiku:* commands
order: 30
---

Complete reference for all H·AI·K·U commands. Commands are invoked as `/haiku:<command>` in any Claude session (Code or Cowork).

## Core Commands

### `/haiku:new`

Create a new intent with studio and stage configuration.

- Detects or prompts for studio selection (software, ideation, or custom)
- Selects execution mode (continuous or discrete stages)
- Resolves stages from the selected studio
- Creates `.haiku/intents/{slug}/` workspace with intent and unit files
- Sets up git branch `haiku/{slug}` (software studio)

### `/haiku:run`

Run the stage pipeline for the current intent. Progresses through each stage in order, transitioning through the hats defined in each stage's `STAGE.md`.

### `/haiku:execute`

Drive unit implementations through builder hats. Executes the development stage: spawns builder subagents for each unit in DAG order, handles dependencies, commits after each unit, and invokes `/haiku:review` before completion.

**Arguments:** `[unit-slug]` — optional, to continue from a specific unit.

### `/haiku:review`

Pre-delivery code review using multi-agent specialized review. Spawns parallel agents for correctness, security, performance, architecture, and test quality. Auto-fixes HIGH findings (up to 3 iterations). Returns approved, needs_attention, or aborted.

### `/haiku:autopilot`

Full autonomous workflow — create intent, run stages, review, and deliver in one command. Pauses if more than 5 units, on blockers, and before PR creation.

**Arguments:** `<feature description>` — required. No discovery questions asked.

### `/haiku:quick`

Quick mode for small tasks — skip full pipeline. Streamlined workflow for fixes, renames, config changes, lint fixes, and small refactors. Creates feature branch and PR with 3-cycle reviewer limit.

**Arguments:** `[workflow-name] <task description>`

## Intent Management

### `/haiku:elaborate`

*Deprecated — delegates to `/haiku:run` plan phase for stage-based intents.*

### `/haiku:refine`

Refine intent or unit specs mid-execution without losing progress. Displays current artifact, collaborates on changes, preserves frontmatter, and re-queues affected units.

**Arguments:** `[unit-slug]` — optional, to refine a specific unit.

### `/haiku:followup`

Create a follow-up intent that iterates on previous work. Loads previous intent context and creates new intent with `iterates_on` reference.

**Arguments:** `[description]` — what the follow-up addresses.

### `/haiku:resume`

Resume interrupted intent execution from saved state. Restores context from checkpoint files and resumes from last known state.

**Arguments:** `[intent-slug]` — optional. If omitted, uses the current active intent.

### `/haiku:reset`

Reset current execution state. Clears ephemeral state while preserving committed artifacts.

### `/haiku:cleanup`

Remove orphaned and merged worktrees from `.haiku/worktrees/`. Does not delete unmerged branches.

## Knowledge & Analysis

### `/haiku:fundamentals`

Core H·AI·K·U methodology documentation. Explains three pillars: backpressure over prescription, completion criteria enable autonomy, files are memory.

### `/haiku:compound`

Capture session learnings as structured solution files. Uses 4 parallel subagents to extract reusable knowledge. Outputs to `docs/solutions/{category}/{problem-slug}.md`.

### `/haiku:reflect`

Post-mortem analysis of a completed intent cycle. Runs 4 parallel analysis subagents. Outputs to `.haiku/{intent}/reflection.md`.

**Arguments:** `[intent-slug]` — optional.

### `/haiku:ideate`

Surface high-impact improvement ideas with adversarial filtering. Generates ideas across 5 dimensions (performance, security, maintainability, test coverage, DX) and filters via counter-argument.

**Arguments:** `[dimension]` — optional, to focus on one dimension.

### `/haiku:adopt`

Reverse-engineer an existing feature into H·AI·K·U intent artifacts. Explores a shipped feature by reading its code, tests, and docs, then generates intent and unit specs.

**Arguments:** `[feature-description]`

## Quality & Process

### `/haiku:backpressure`

Manage quality gates. Add, list, and enforce automated quality gates that block progress via stop hooks.

**Arguments:** `add [gate-type] [condition]`, `list`, `enforce`

### `/haiku:completion-criteria`

Interactive completion criteria definition. Helps define specific, measurable, atomic, automated success criteria including negative cases.

### `/haiku:blockers`

Document obstacles preventing progress. Records technical, knowledge, dependency, and design blockers.

**Arguments:** `add [title]`, `list`, `view [blocker-id]`, `resolve [blocker-id]`

### `/haiku:gate`

Manage quality gates and gate enforcement. Define, list, and enforce quality gates.

**Arguments:** `add [gate-name] [condition]`, `list`, `status`, `pass [gate-name]`, `fail [gate-name]`

### `/haiku:pressure-testing`

Evaluation-Driven Development for hat definitions. Applies RED-GREEN-REFACTOR cycle to test hat instructions under 7 pressure types (time, sunk cost, authority, economic, exhaustion, social, pragmatic).

**Arguments:** `[hat-name]`

## Operations & Backlog

### `/haiku:operate`

Manage post-construction operations: list, execute, deploy, monitor, and teardown operational tasks. Operations are spec files in `.haiku/{intent}/operations/`.

**Arguments:** `list`, `exec [operation-name]`, `deploy [operation-name]`, `status [operation-name]`, `teardown [operation-name]`

### `/haiku:backlog`

Parking lot for ideas not yet ready for planning. Store ideas with priority and tags.

**Arguments:** `add [idea-slug] [description]`, `list`, `review [slug]`, `promote [slug]`

### `/haiku:dashboard`

Generate a static HTML dashboard from `.haiku/` data showing intent overview, unit status, and completion tracking.

**Arguments:** `[--output DIR]` — optional custom output directory.

### `/haiku:release-notes`

Show the project changelog and release notes.

## Deprecated Commands

| Command | Replacement |
|---------|-------------|
| `/haiku:elaborate` | `/haiku:run` (plan phase) |
| `/haiku:construct` | `/haiku:execute` |
