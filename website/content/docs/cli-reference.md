---
title: CLI Reference
description: Complete reference for all /haiku:* commands
order: 30
---

Complete reference for all H·AI·K·U commands. Commands are MCP prompts invoked as `/haiku:<command>` in any MCP client (Claude Code, Cursor, Windsurf, etc.).

## Core Commands

### `/haiku:new`

Create a new intent with studio and stage configuration.

- Detects or prompts for studio selection (software, ideation, or custom)
- Selects execution mode (continuous or discrete stages)
- Resolves stages from the selected studio
- Creates `.haiku/intents/{slug}/` workspace with intent and unit files
- Sets up git branch `haiku/{slug}` (software studio)

**Arguments:** `description` (optional) — describe what you want to build. `template` (optional) — instantiate from a studio intent template.

### `/haiku:run`

Run the stage pipeline for the current intent. Progresses through each stage in order, transitioning through the hats defined in each stage's `STAGE.md`.

**Arguments:** `intent` (optional) — intent slug. Auto-detects if only one active intent.

### `/haiku:review`

Pre-delivery code review using multi-agent specialized review. Spawns parallel agents for correctness, security, performance, architecture, and test quality. Auto-fixes HIGH findings (up to 3 iterations).

**Arguments:** `intent` (optional) — intent slug.

### `/haiku:autopilot`

Full autonomous workflow — create intent, run stages, review, and deliver in one command. Sets mode=autopilot and chains to /haiku:run.

**Arguments:** `description` (optional) — feature description.

### `/haiku:quick`

Quick mode for small tasks — skip full pipeline. Streamlined single-stage workflow for fixes, renames, config changes, and small refactors.

**Arguments:** `stage` (optional) — stage name. `description` (required) — task description.

## Intent Management

### `/haiku:refine`

Refine intent or unit specs mid-execution without losing progress. Loads upstream stage context for scoped side-trips.

**Arguments:** `stage` (optional) — upstream stage to refine.

### `/haiku:reflect`

Post-completion analysis of a completed intent cycle. Loads metrics and constructs structured analysis prompt.

**Arguments:** `intent` (optional) — intent slug.

## Knowledge & Analysis

### `/haiku:ideate`

Surface high-impact improvement ideas with adversarial filtering. Generates ideas across multiple dimensions and filters via counter-argument.

**Arguments:** `area` (optional) — focus area for brainstorming.

### `/haiku:adopt`

Reverse-engineer an existing feature into H·AI·K·U intent artifacts. Explores a shipped feature by reading its code, tests, and docs, then generates intent and unit specs.

**Arguments:** `description` (optional) — feature description.

### `/haiku:capacity`

Historical throughput analysis from local artifacts. Analyzes completed intents, units, and bolts to surface velocity trends and bottleneck stages.

**Arguments:** `studio` (optional) — scope analysis to a specific studio.

### `/haiku:release-notes`

Show the project changelog and release notes.

**Arguments:** `version` (optional) — specific version to show.

## Quality & Process

### `/haiku:pressure-testing`

Adversarial challenge for hat definitions. Applies RED-GREEN-REFACTOR cycle to test hat instructions under pressure types.

**Arguments:** `hat` (optional) — hat name to test.

## Cross-Studio & Operations

### `/haiku:composite`

Create a multi-studio intent with sync points. Coordinates work across studios.

**Arguments:** `description` (optional) — what the composite intent addresses.

### `/haiku:triggers`

Poll providers for events that unblock `await` gates or trigger new work.

**Arguments:** `category` (optional) — provider category to poll.

### `/haiku:operate`

Run post-delivery operational tasks from studio templates.

**Arguments:** `operation` (optional) — operation name to execute.

### `/haiku:backlog`

Parking lot for ideas not yet ready for planning.

**Arguments:** `action` (optional) — add, list, review, or promote. `description` (optional) — for add action.

### `/haiku:dashboard`

Current intent status overview with per-stage progress.

### `/haiku:scaffold`

Generate custom studios, stages, hats, and provider overrides.

**Arguments:** `type` (required) — studio, stage, hat, or provider. `name` (required) — name for the artifact. `parent` (optional) — parent context.

### `/haiku:migrate`

Migrate legacy .ai-dlc intents to H·AI·K·U format.

**Arguments:** `intent` (optional) — specific intent slug to migrate.

### `/haiku:seed`

Create intents from studio templates.

**Arguments:** `action` (optional) — plant, list, or check.

### `/haiku:setup`

Configure H·AI·K·U providers and workspace settings.

## Deprecated Commands

| Command | Replacement |
|---------|-------------|
| `/haiku:elaborate` | `/haiku:run` (plan phase) |
| `/haiku:execute` | `/haiku:run` |
| `/haiku:construct` | `/haiku:run` |
| `/haiku:resume` | `/haiku:run` |
| `/haiku:cleanup` | Removed |
| `/haiku:compound` | Removed |
| `/haiku:fundamentals` | Embedded in prompt context |
| `/haiku:completion-criteria` | Enforced by orchestrator |
| `/haiku:backpressure` | Enforced by hooks |
| `/haiku:blockers` | Handled by orchestrator |
| `/haiku:followup` | `/haiku:new` (with iterates_on) |
| `/haiku:reset` | MCP tool (not a prompt) |
| `/haiku:gate` | Enforced by orchestrator |
