---
intent: haiku-rebrand
created: 2026-04-02T19:46:00Z
status: active
---

# Discovery Log: H·AI·K·U Rebrand

Elaboration findings from the April 2, 2026 architecture design session.

## Architecture Decision: Studio/Stage/Persistence Model

The AI-DLC system is being rebranded and rearchitected as H·AI·K·U — a domain-agnostic lifecycle orchestration system. The key insight: all structured work flows through stages of planning, building, and reviewing. Software development is one lifecycle; marketing, hardware, legal are others.

### Core Concepts

- **Studio** — a named lifecycle for a specific domain. Declares stage order and persistence layer.
- **Stage** — a lifecycle phase. Plans, builds, and reviews its own work. Defines its own hats (roles). One STAGE.md contains everything.
- **Persistence** — how work is saved. Git for software, Notion for content, filesystem for generic. The studio declares its type.
- **Outputs** — scope-based persistence. Each stage declares outputs in an `outputs/` directory with frontmatter docs. Scopes: `project` (persists across intents), `intent` (this intent only), `stage` (working context), `repo` (actual source files). Inputs are qualified references in STAGE.md frontmatter, each specifying the producing stage and output name (e.g. `{stage: inception, output: discovery}`).

### Architecture Decision: Unified Stage Loop

The elaborate/execute separation is eliminated. Each stage internally: plan → build → adversarial review → review gate. The user doesn't switch between /elaborate and /execute. A stage just runs.

### Architecture Decision: Hats in Stages

Hats (roles) move from plugin/hats/ directory into each STAGE.md. The hat sequence defined in the stage IS the build workflow. No separate workflows.yml. Security stage is always adversarial because its hats are threat-modeler → red-team → blue-team → reviewer.

### Architecture Decision: Default Ideation Studio

Every project has a studio. The default is "ideation" with universal stages: research → create → review → deliver. Domain-specific studios (software, marketing) specialize this.

### Architecture Decision: Review Gates

Every stage runs automatically. The review gate controls what happens AFTER: auto (advance immediately), ask (pause for user), external (request team review / PR).

### Architecture Decision: Continuous vs Discrete

Not "single-stage vs multi-stage." Both modes run through the same stages. Continuous = autopilot drives transitions, user reviews at gates. Discrete = user explicitly invokes each stage. The choice is per-intent.

### Architecture Decision: Persistence Abstraction

Git is the software studio's persistence adapter, not a system-level assumption. The studio declares `persistence: { type: git, delivery: pull-request }`. Other studios use other adapters.

### Architecture Decision: Product Review is `[external, ask]`

The product stage's review gate is `review: [external, ask]` — the first element (`external`) is the default gate for normal `/haiku:run` runs, serving as the go/no-go decision boundary where the team decides whether to actually build the thing. The `ask` element gives autopilot a valid non-blocking path: `/haiku:autopilot` selects `ask` (the most permissive non-`external` option) and overrides it to `auto`, so autopilot can proceed without a hard external gate while the full external review option remains available for human-driven workflows. The same pattern applies to the security stage.

## Codebase Context

**Stack:** TypeScript, Bash (shell scripts), Next.js 15 (website), Markdown (specs/docs)
**Architecture:** Claude Code plugin (plugin/), static website (website/), methodology paper
**Conventions:** YAML frontmatter in markdown, SKILL.md for skill definitions, shell libraries in plugin/lib/

## What Dissolves

- `plugin/hats/` directory — hats move into STAGE.md files
- `plugin/workflows.yml` — stages define their own hat sequences
- Workflow selection sub-skill — not needed
- `phases/ELABORATION.md` and `phases/EXECUTION.md` — stage body is context for everything
- The elaborate/execute command split — replaced by unified stage loop
- Software-only assumption — persistence adapters make it domain-agnostic

## What Already Changed (This Session)

- `pass` renamed to `stage` across all plugin files, hooks, schemas, types
- `plugin/passes/` → `plugin/stages/` (then further into studios)
- Stage definitions created with input/output model (inputs in frontmatter, outputs/ directory)
- Studio infrastructure: studio.sh, stage.sh, STUDIO.md
- Built-in software studio with design/product/dev stages
- STUDIO-SPEC.md written
- HTML architecture visualization (3 versions in Downloads)

## Design Artifacts

These artifacts capture the full architecture design and are included in this intent for historical reference:

- **`architecture-spec.md`** — Full technical specification: file structure, STAGE.md schema, FSM model, execution model, settings, resolution logic, custom stage/studio examples, migration path, backwards compatibility guarantees.
- **`architecture-viz.html`** — Interactive HTML visualization: core lifecycle loop, stage anatomy, software studio pipeline with hats/review/outputs grid, ideation studio (default), marketing studio example, persistence layer comparison, continuous vs discrete modes, knowledge pools, full hierarchy diagram.

## Architecture Decision: Input/Output Architecture

Stages declare their data flow through two mechanisms: **inputs** (qualified references in STAGE.md frontmatter) and **outputs** (self-describing frontmatter docs in an `outputs/` directory within the stage).

### Inputs

Qualified references in STAGE.md frontmatter. Each entry specifies the producing stage and the output name within that stage. A bare slug is ambiguous -- two stages could have outputs with the same name. The `stage` + `output` pair together resolve to the exact persisted location.

```yaml
---
name: security
description: Threat modeling and penetration testing
hats: [threat-modeler, red-team, blue-team, reviewer]
review: external
unit_types: [security, backend]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: development
    output: code
---
```

The orchestrator resolves each qualified input to the producing stage's output definition, then reads from its persisted location.

### Input Loading: Plan Phase Only

Inputs are loaded during the **plan phase** of a stage, not the build phase. During planning, the orchestrator loads all stage inputs as context for decomposing work into units and defining criteria. During the build phase, individual units declare their own `## References` section listing the specific artifacts the builder needs -- the full input set is NOT loaded into each builder agent.

This prevents context bloat: a stage might declare 5 inputs, but a given unit only needs 2 of them. The plan phase uses the full picture; the build phase uses only what each unit requires.

### Unit References

Unit specs get a `## References` section populated during the plan phase:

```markdown
## References
- .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
- .haiku/intents/{intent-slug}/knowledge/BEHAVIORAL-SPEC.md
```

The builder agent reads ONLY these files, not the entire knowledge pool. This section is populated based on what the unit actually needs, derived from the stage inputs and the unit's specific scope of work.

### Outputs

Each stage has an `outputs/` directory containing self-describing frontmatter docs. Each output file declares its name, persistence scope, format, and whether it's required. The body provides guidance for what to produce.

```
plugin/studios/software/stages/inception/
├── STAGE.md
└── outputs/
    └── DISCOVERY.md         # scope: intent, format: text
```

### Output Doc Schema

```yaml
---
name: discovery
location: .haiku/intents/{intent-slug}/knowledge/DISCOVERY.md
scope: intent
format: text
required: true
---

# Discovery Output Guide

When exploring the domain, document:
- Every entity and its fields
- Every API endpoint and its behavior
- Architecture patterns and constraints
- Quality gate candidates
```

### Output Scopes

| Scope | Persisted To | Lifespan |
|-------|-------------|----------|
| `project` | `.haiku/knowledge/{name}.md` | Persists across intents |
| `intent` | `.haiku/intents/{intent-slug}/knowledge/{name}.md` | This intent only |
| `stage` | `.haiku/intents/{intent-slug}/stages/{stage}/{name}` | Working context for this stage's units only |
| `repo` | Project source tree | Actual code, configs — permanent |

### Example Output Types

- `ARCHITECTURE.md` — scope: project, format: text (persists to `.haiku/knowledge/`)
- `DISCOVERY.md` — scope: intent, format: text
- `DESIGN-BRIEF.md` — scope: stage, format: text (only for this stage's units)
- `CODE.md` — scope: repo, format: code (actual source files)
- `WIREFRAMES.md` — scope: stage, format: design

### What This Replaces

- No `knowledge/` directory inside stages — replaced by `outputs/`
- No `requires:` or `produces:` fields in STAGE.md frontmatter — replaced by `inputs:` (frontmatter list) and `outputs/` (directory of docs)
- No `output_path:` in knowledge templates — replaced by `location:` with scope-based paths

### Directory Structure

```
.haiku/
├── settings.yml
├── knowledge/                          # Project-scoped outputs land here
│   ├── ARCHITECTURE.md
│   └── CONVENTIONS.md
├── studios/                            # Custom/override studios
└── intents/
    └── {name}/
        ├── intent.md
        ├── knowledge/                  # Intent-scoped outputs land here
        │   ├── DISCOVERY.md            ← inception wrote this
        │   ├── DESIGN-BRIEF.md         ← design stage wrote this
        │   └── THREAT-MODEL.md         ← security stage wrote this
        ├── stages/
        │   ├── inception/
        │   │   ├── state.json
        │   │   ├── WORKING-NOTES.md    ← stage-scoped output (lives here)
        │   │   └── units/
        │   ├── design/
        │   │   ├── state.json
        │   │   └── units/
        │   │       ├── unit-01-wireframes.md
        │   │       └── unit-02-tokens.md
        │   └── development/
        │       ├── state.json
        │       └── units/
        │           ├── unit-01-auth-api.md
        │           └── unit-02-frontend.md
        └── state.json                  # { active_stage, mode, studio }
```

## Rename Map (from exploration agent)

### Directories and files to rename
| From | To |
|------|-----|
| `.ai-dlc/` | `.haiku/` |
| `plugin/hats/` | (removed — hats move into STAGE.md) |
| `plugin/workflows.yml` | (removed — stages define hat sequences) |
| `plugin/stages/` | `plugin/studios/{name}/stages/{stage}/STAGE.md` |
| `plugin/passes/` | (already renamed to stages, then into studios) |

### Code identifier renames
| From | To |
|------|-----|
| `dlc_*` functions | `hku_*` functions |
| `aidlc_*` telemetry | `haiku_*` telemetry |
| `_DLC_*` guard vars | `_HKU_*` guard vars |
| `DLC_*` constants | `HKU_*` constants |
| `CLAUDE_PLUGIN_ROOT` | (unchanged — this is a Claude Code convention) |

### Frontmatter field renames
| From | To |
|------|-----|
| `passes:` | `stages:` (already done) |
| `active_pass:` | `active_stage:` (already done) |
| `pass:` | `stage:` (already done) |

### Command renames
| From | To |
|------|-----|
| `/ai-dlc:elaborate` | `/haiku:stage` (or `/haiku:run` for continuous) |
| `/ai-dlc:execute` | (dissolved into stage loop) |
| `/ai-dlc:setup` | `/haiku:setup` |
| `/ai-dlc:autopilot` | `/haiku:run` (continuous mode) |
| `/ai-dlc:review` | `/haiku:review` |
| `/ai-dlc:followup` | `/haiku:followup` |
| `/ai-dlc:quick` | `/haiku:quick` |
| `/ai-dlc:adopt` | `/haiku:adopt` |
| `/ai-dlc:refine` | `/haiku:refine` |
| `/ai-dlc:release-notes` | `/haiku:release-notes` |
| `/ai-dlc:compound` | `/haiku:compound` |
| `/ai-dlc:blockers` | `/haiku:blockers` |
| `/ai-dlc:backpressure` | `/haiku:backpressure` |
| `/ai-dlc:fundamentals` | `/haiku:fundamentals` |
| `/ai-dlc:completion-criteria` | `/haiku:completion-criteria` |

### Files that reference ai-dlc (from exploration)
- **Libraries (plugin/lib/):** config.sh, dag.sh, stage.sh, studio.sh, knowledge.sh, state.sh, deps.sh, parse.sh, design-blueprint.sh, telemetry.sh
- **Hooks (plugin/hooks/):** inject-context.sh, subagent-context.sh, quality-gate.sh, redirect-plan-mode.sh, session-start.sh, stop-hook.sh
- **Skills:** All 20+ SKILL.md files across elaborate, execute, setup, review, etc.
- **Schemas:** settings.schema.json, all provider schemas
- **Types:** shared/src/types.ts
- **Plugin metadata:** .claude-plugin/plugin.json, .claude-plugin/hooks.json
- **Website:** All content in website/content/docs/, website/content/papers/, website/content/blog/
- **Root:** CLAUDE.md, CHANGELOG.md, README.md
