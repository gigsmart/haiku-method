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
- **Knowledge** — two layers: global pool (project-level, persists across intents) and intent artifacts (accumulated as stages complete).

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

### Architecture Decision: Product Review is External

The product stage's review gate is `external` — it's the go/no-go decision boundary where the team decides whether to actually build the thing.

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
- Stage definitions created with FSM model (requires/produces)
- Studio infrastructure: studio.sh, stage.sh, STUDIO.md
- Built-in software studio with design/product/dev stages
- STUDIO-SPEC.md written
- HTML architecture visualization (3 versions in Downloads)

## Design Artifacts

These artifacts capture the full architecture design and are included in this intent for historical reference:

- **`architecture-spec.md`** — Full technical specification: file structure, STAGE.md schema, FSM model, execution model, settings, resolution logic, custom stage/studio examples, migration path, backwards compatibility guarantees.
- **`architecture-viz.html`** — Interactive HTML visualization: core lifecycle loop, stage anatomy, software studio pipeline with hats/review/outputs grid, ideation studio (default), marketing studio example, persistence layer comparison, continuous vs discrete modes, knowledge pools, full hierarchy diagram.

## Architecture Decision: Knowledge Architecture

Two knowledge layers, both with frontmatter-structured documents:

### Global Knowledge (.haiku/knowledge/)
Project-level. Persists across intents. Synthesized from the codebase.
- `design.md` — design tokens, component patterns, design system
- `architecture.md` — tech stack, module boundaries, data flow patterns
- `product.md` — user personas, product principles, business rules
- `conventions.md` — code style, testing philosophy, PR process
- `domain.md` — glossary, entity model, domain constraints

### Intent Knowledge (.haiku/intents/{name}/knowledge/)
Per-intent. Accumulated as stages complete. Each stage writes its findings here.
- `discovery.md` — domain exploration (produced by inception/research stage)
- `design.md` — design decisions, tokens, wireframe rationale (produced by design stage)
- `product.md` — behavioral specs, acceptance criteria decisions (produced by product stage)
- `architecture.md` — implementation decisions, patterns established (produced by development stage)
- `threat-model.md` — attack surface, mitigations (produced by security stage)

### Knowledge Guides in STAGE.md
Each stage defines its knowledge outputs as frontmatter docs within the stage directory. These are templates with frontmatter that guide the agent on what knowledge to collect and how to structure it:

```
plugin/studios/software/stages/inception/
├── STAGE.md
└── knowledge/
    └── discovery.md          # Frontmatter template: what to discover, how to structure findings
```

The knowledge template's frontmatter defines:
```yaml
---
name: discovery
description: Domain exploration findings
output_path: knowledge/discovery.md    # Where to write in the intent directory
required: true                          # Must produce this by stage completion
schema:                                 # Expected sections
  - "## Domain Model"
  - "## Data Sources"
  - "## Architecture"
  - "## Quality Gate Candidates"
---

# Discovery Knowledge Guide

When exploring the domain for this intent, document:
- Every entity and its fields...
- Every API endpoint and its behavior...
{guidance for what to collect}
```

This means the stage's knowledge directory contains GUIDES (templates), and the intent's knowledge directory contains OUTPUTS (populated by the agent during the stage). The `produces:` field in STAGE.md maps to these knowledge guides.

### Directory Structure

```
.haiku/
├── settings.yml
├── knowledge/                          # Global (project-level)
│   ├── design.md
│   ├── architecture.md
│   ├── product.md
│   ├── conventions.md
│   └── domain.md
├── studios/                            # Custom/override studios
└── intents/
    └── {name}/
        ├── intent.md
        ├── knowledge/                  # Intent-scoped (per-stage outputs)
        │   ├── discovery.md            ← inception wrote this
        │   ├── design.md              ← design stage wrote this
        │   └── threat-model.md        ← security stage wrote this
        ├── stages/
        │   ├── inception/
        │   │   ├── state.json
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
