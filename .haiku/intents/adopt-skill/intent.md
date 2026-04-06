---
title: "/adopt — Reverse-Engineer Existing Features into AI-DLC"
studio: software
stages: [inception, design, product, development, operations, security]
mode: continuous
active_stage: development
status: completed
started_at: 2026-03-29T21:53:17Z
completed_at: 2026-03-30T05:53:03Z
---


# /adopt — Reverse-Engineer Existing Features into AI-DLC

## Problem

Features built before AI-DLC was adopted (or implemented without it) cannot benefit from the AI-DLC lifecycle. They have no intent artifacts, no unit decomposition, no discovery log, and no operational plan. This means:

- `/operate` cannot manage them — no operation specs exist to deploy, monitor, or maintain
- `/followup` cannot iterate on them — no intent exists as a valid `iterates_on` target
- There is no structured domain knowledge captured for future reference
- Success criteria are implicit in tests but not explicitly documented

There is currently no entry point in AI-DLC for bringing existing work into the lifecycle retroactively.

## Solution

Create a new `/adopt` slash command that reverse-engineers existing features into complete AI-DLC intent artifacts. The skill:

1. **Gathers input** via a combination of user description, optional code paths/files, and git history cross-referencing
2. **Explores the codebase** to understand the feature's domain model, entities, relationships, data sources, tests, and CI configuration
3. **Generates completed AI-DLC artifacts** — intent.md (`status: completed`), unit files (`status: completed`), and discovery.md
4. **Reverse-engineers success criteria** from existing test suites and CI checks
5. **Auto-generates an operational plan** with operation spec files in `operations/`, enabling immediate `/operate` use
6. **Enables `/followup`** — the adopted intent serves as a valid `iterates_on` target for future iteration

The agent uses a pragmatic blend for unit decomposition: starting from actual git history but restructuring into clean AI-DLC unit boundaries where the real history was messy.

## Domain Model

### Entities

- **Existing Feature**: The pre-existing codebase feature being adopted — identified by user description, code paths, and git history
- **Adopted Intent**: An `intent.md` with `status: completed` representing the adopted feature
- **Adopted Unit**: A `unit-NN-slug.md` with `status: completed` representing a logical piece of the adopted feature
- **Discovery Log**: Domain knowledge captured during reverse-engineering (`discovery.md`)
- **Success Criteria**: Verifiable criteria reconstructed from existing tests and CI configuration
- **Operational Plan**: Collection of operation spec files in `operations/` enabling `/operate`

### Relationships

- Existing Feature maps to one Adopted Intent
- Adopted Intent has many Adopted Units
- Adopted Intent has one Discovery Log
- Adopted Intent has many Operations (operational plan)
- Each Adopted Unit has Success Criteria (unit-level)
- Adopted Intent is a valid `iterates_on` target for `/followup`

### Data Sources

- **Codebase (filesystem)**: Source code, test files, CI configuration, deployment manifests — primary input for reverse-engineering
- **Git history**: Commits, PRs, branches — temporal context for how the feature was built
- **Plugin filesystem**: SKILL.md templates, library functions, workflows.yml — artifact format specifications
- **User input**: Feature description, specific code paths, additional context — via AskUserQuestion

### Data Gaps

- **Test-to-criteria mapping**: Tests exist but mapping them to high-level success criteria requires semantic interpretation. Agent groups tests by behavior and proposes criteria.
- **Messy git history**: Real development doesn't follow clean unit boundaries. Pragmatic blend approach restructures into clean units.
- **Inferred operations**: /adopt must infer operational needs from deployment surface, CI config, and monitoring. Agent analyzes CI workflows, Dockerfiles, k8s manifests to propose operations.

## Success Criteria

- [x] `plugin/skills/adopt/SKILL.md` exists with valid frontmatter (`description`, `user-invocable: true`, `argument-hint`, `allowed-tools`)
- [x] Running `/adopt` without arguments prompts the user to describe the feature being adopted
- [x] Running `/adopt` with a feature description triggers codebase exploration (code analysis + git history cross-referencing)
- [x] The adopted intent is written to `.ai-dlc/{slug}/intent.md` with `status: completed` and all required frontmatter fields
- [x] Unit files are generated as `unit-NN-{slug}.md` with `status: completed`, pragmatically decomposed from actual code structure and git history
- [x] `discovery.md` is generated with domain knowledge from the reverse-engineering exploration
- [x] Success criteria on each unit are reverse-engineered from existing test files and CI configuration
- [x] An operational plan is auto-generated with valid operation specs in `.ai-dlc/{slug}/operations/`
- [x] The adopted intent is usable as a `/followup` target (valid `iterates_on` reference)
- [x] The adopted intent is usable with `/operate` (valid operation specs exist)
- [x] The paper documents the adopt concept if not already present
- [x] Generated unit boundaries match actual domain boundaries in the codebase — units do not arbitrarily split tightly-coupled code or merge unrelated concerns
- [x] Generated success criteria reference specific test files or CI checks that verify each criterion — no criteria without traceable evidence
- [x] User reviews and confirms the proposed intent, units, and operational plan before artifacts are finalized (interactive confirmation gates)

## Context

- This is the first "import" pathway into AI-DLC — all other entry points (elaborate, quick, followup) assume starting from scratch or iterating on existing AI-DLC intents.
- The skill follows the same SKILL.md pattern as all 28 existing skills — single file with YAML frontmatter and markdown body.
- Shared libraries (config.sh, parse.sh, state.sh, dag.sh) provide all needed utilities — no new libraries required.
- The worktree model is designed for construction isolation. Since /adopt writes artifacts for already-completed work, it writes directly to a branch without construction worktrees.
