---
title: H·AI·K·U Rebrand — From AI-DLC to Domain-Agnostic Lifecycle Orchestrator
studio: software
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
mode: continuous
active_stage: security
status: completed
started_at: 2026-04-03T10:48:35.000Z
completed_at: 2026-04-05T10:25:11.000Z
created_at: '2026-04-13T19:18:37.689Z'
---


# H·AI·K·U Rebrand — From AI-DLC to Domain-Agnostic Lifecycle Orchestrator

## Problem

AI-DLC is a software development lifecycle tool hardcoded to three disciplines (design, product, dev) with a monolithic 2,400-line elaboration skill. It separates "elaboration" (spec) and "execution" (build) as distinct commands. It can't support custom lifecycles — a security team, hardware team, or marketing team has no way to define their own workflow. The system assumes git as the only persistence mechanism.

## Solution

Rebrand AI-DLC to H·AI·K·U and implement a studio/stage/persistence architecture:

1. **Studios** define named lifecycles for any domain. The default "ideation" studio works for every discipline. The "software" studio specializes for software development with stages: inception → design → product → development → operations → security.

2. **Stages** replace the elaborate/execute split. Each stage plans, builds, and reviews its own work internally. Stages define their own hats (roles) — no separate hats directory or workflows file. One STAGE.md per stage contains everything.

3. **Persistence** is abstracted behind the studio. Git (branches, commits, PRs) is the software adapter. Other studios use other adapters (Notion, filesystem, CAD systems).

4. **Continuous vs Discrete** modes let the user choose per-intent: autopilot drives stage transitions (continuous) or user invokes each stage (discrete). Both follow the same pipeline.

5. The mechanical rebrand: `.ai-dlc/` → `.haiku/`, `/ai-dlc:*` → `/haiku:*`, all references across plugin, paper, website, and docs.

## Domain Model

### Entities
- **Studio** — named lifecycle template. Declares stage order and persistence type. Lives in `plugin/studios/{name}/STUDIO.md` or `.haiku/studios/{name}/STUDIO.md`.
- **Stage** — lifecycle phase with hats, review mode, inputs (frontmatter list), and outputs (`outputs/` directory of self-describing docs). Lives in `studios/{name}/stages/{stage}/STAGE.md`.
- **Persistence Adapter** — how work is saved/versioned/delivered. Git adapter is the default for software.
- **Intent** — what's being built. Lives in `.haiku/intents/{name}/intent.md`.
- **Unit** — discrete piece of work within a stage. Lives in `.haiku/intents/{name}/stages/{stage}/units/`.
- **Bolt** — one cycle through a stage's hat sequence.
- **Output** — a self-describing frontmatter doc in a stage's `outputs/` directory. Declares name, location, scope, format, and whether required. Scopes: `project` (`.haiku/knowledge/`), `intent` (`.haiku/intents/{name}/knowledge/`), `stage` (`.haiku/intents/{name}/stages/{stage}/`), `repo` (project source tree).
- **Review Gate** — auto | ask | external. Controls what happens after a stage completes.

### Relationships
- Studio has many Stages (ordered)
- Studio has one Persistence Adapter
- Stage has many Units
- Stage has many Hats (ordered — the hat sequence IS the build workflow)
- Stage has one Review Gate
- Unit has many Bolts
- Intent references one Studio
- Intent has many Stages (from its studio)
- Stage has many Outputs (declared in `outputs/` directory, persisted by scope)
- Stage has many Inputs (list in frontmatter, resolved from prior stage outputs)

### Data Sources
- Plugin source: `plugin/` directory (skills, hooks, lib, schemas)
- Website: `website/` (Next.js 15 static site)
- Paper: `website/content/papers/ai-dlc-2026.md`
- Settings: `.ai-dlc/settings.yml` (→ `.haiku/settings.yml`)
- Project-scoped outputs: `.haiku/knowledge/` (persist across intents)
- Intent-scoped outputs: `.haiku/intents/{name}/knowledge/` (per-intent)
- Stage-scoped outputs: `.haiku/intents/{name}/stages/{stage}/` (working context)
- Architecture spec: `plugin/skills/elaborate/STUDIO-SPEC.md`
- Architecture viz: `~/Downloads/haiku-architecture-v1.html`

## Success Criteria
- [ ] All `.ai-dlc/` references → `.haiku/` across the entire codebase
- [ ] All `/ai-dlc:*` commands → `/haiku:*`
- [ ] All "AI-DLC" branding → "H·AI·K·U" in user-facing content
- [ ] Default ideation studio created (`plugin/studios/ideation/`)
- [ ] Software studio created (`plugin/studios/software/`) with 6 stages
- [ ] Each stage has STAGE.md with hats, review mode, guidance, inputs list, and outputs/ directory
- [ ] plugin/hats/ directory removed — hats live in STAGE.md
- [ ] plugin/workflows.yml removed — stages define their own hat sequences
- [ ] Unified stage orchestrator skill replaces separate elaborate/execute skills
- [ ] Persistence abstraction with git adapter as default
- [ ] Settings schema updated (studio: field, persistence config)
- [ ] Paper terminology updated (pass → stage, new hierarchy documented)
- [ ] Website docs updated for H·AI·K·U terminology
- [ ] CLAUDE.md terminology table updated
- [ ] All existing tests pass after rebrand
- [ ] Continuous mode (default) works identically to current single-stage behavior

## Context

This intent captures the architecture design session from April 2, 2026. The conversation evolved from a simple elaborate skill refactor into a complete rethinking of the system's domain model — discovering that the studio/stage pattern is domain-agnostic and that the elaborate/execute separation was an artifact of software-centric thinking. The "pass" concept was renamed to "stage," hats were dissolved into stages, workflows were dissolved into studios, and persistence was abstracted to support non-software domains.

Key artifacts from the session:
- `plugin/skills/elaborate/STUDIO-SPEC.md` — technical specification
- `~/Downloads/haiku-architecture-v1.html` — interactive visualization
- `~/Downloads/ai-dlc-architecture-v2.html` / `v3.html` — earlier iterations
