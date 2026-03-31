---
status: completed
last_updated: "2026-03-30T05:04:56Z"
depends_on: []
branch: ai-dlc/adopt-skill/01-adopt-skill
discipline: documentation
pass: ""
workflow: ""
ticket: ""
---

# unit-01-adopt-skill

## Description

Write the complete `/adopt` skill specification as `plugin/skills/adopt/SKILL.md`. This is the primary deliverable — a workflow specification that guides the AI agent through reverse-engineering an existing feature into AI-DLC intent artifacts.

## Discipline

documentation - This unit will be executed by `do-technical-documentation` specialized agents.

## Domain Entities

- **SKILL.md**: The skill definition file with YAML frontmatter and markdown body defining the adoption workflow
- **Existing Feature**: The input — a pre-existing codebase feature identified by user description, code paths, and git history
- **Adopted Intent**: The output — `intent.md` with `status: completed`
- **Adopted Units**: The output — `unit-NN-slug.md` files with `status: completed`
- **Discovery Log**: The output — `discovery.md` with reverse-engineered domain knowledge
- **Operational Plan**: The output — `operations/*.md` files with valid operation specs

## Data Sources

- **Existing SKILL.md files**: Read `plugin/skills/elaborate/SKILL.md`, `plugin/skills/followup/SKILL.md`, `plugin/skills/operate/SKILL.md` as reference implementations for skill structure, frontmatter schema, and workflow design patterns
- **Plugin workflows.yml**: `plugin/workflows.yml` — defines available workflows the adopted intent can reference
- **Plugin libraries**: `plugin/lib/config.sh`, `plugin/lib/parse.sh`, `plugin/lib/state.sh`, `plugin/lib/dag.sh` — utility functions the skill can reference for artifact creation
- **Artifact format specs**: Intent and unit frontmatter schemas documented in elaborate/SKILL.md Phase 6
- **Operation file format**: Operation spec format documented in operate/SKILL.md

## Technical Specification

Create `plugin/skills/adopt/SKILL.md` with the following structure:

### Frontmatter

```yaml
---
description: Reverse-engineer an existing feature into AI-DLC intent artifacts for /operate and /followup
user-invocable: true
argument-hint: "[feature-description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Skill
  - AskUserQuestion
  - WebSearch
---
```

### Workflow Phases

The SKILL.md body must define these phases in detail:

**Phase 0: Pre-checks**
- Verify in a git repository
- Check for cowork mode (same pattern as elaborate)
- If argument provided, use as initial feature description

**Phase 1: Gather Feature Description**
- If no argument: prompt user with AskUserQuestion for feature description
- Ask for optional code paths, directories, or modules to focus on
- Ask if there are specific PRs, branches, or commit ranges to reference

**Phase 2: Feature Exploration (Delegated)**
- Spawn Explore subagents in parallel to:
  - Analyze identified code paths and their dependencies
  - Read git log for relevant commits (filter by paths, authors, date ranges)
  - Analyze test files related to the feature (test suites, test utilities, fixtures)
  - Analyze CI configuration for relevant checks (GitHub Actions workflows, test scripts)
  - Map the feature's deployment surface (Dockerfiles, k8s manifests, CI deploy steps)
- Write findings to discovery.md as they return
- Build a domain model from exploration results

**Phase 3: Propose Intent and Units**
- Present the proposed intent description (Problem/Solution/Domain Model) to the user
- Decompose the feature into units using pragmatic blend:
  - Start from git history (PRs, logical commit groups)
  - Restructure into clean AI-DLC unit boundaries (one domain, one discipline per unit)
  - Each unit gets `status: completed`
- Present proposed unit breakdown to user for confirmation

**Phase 4: Reverse-Engineer Success Criteria**
- For each unit, analyze associated test files:
  - Read test descriptions/names to understand what behaviors are verified
  - Group related tests into high-level criteria
  - Reference specific test files in each criterion
- Analyze CI configuration:
  - Extract quality gates (lint, type-check, build, test commands)
  - Map CI checks to intent-level success criteria
- Present criteria to user for confirmation

**Phase 5: Generate Operational Plan**
- Analyze the feature's operational surface:
  - Scheduled tasks (cron jobs, recurring scripts, CI-scheduled workflows)
  - Monitoring (metrics, dashboards, alerts, SLOs)
  - Deployment procedures (deploy scripts, rollback procedures)
  - Maintenance tasks (database migrations, cache invalidation, secret rotation)
- Generate operation spec files in `.ai-dlc/{slug}/operations/`:
  - Each operation as `{name}.md` with frontmatter (name, type, owner, schedule/trigger/frequency)
  - Agent-owned operations get companion scripts
  - Human-owned operations get markdown checklists
- Present operational plan to user for confirmation

**Phase 6: Write Artifacts**
- Write artifacts directly to `.ai-dlc/{slug}/` on the current branch (no worktree — /adopt skips worktree creation)
- Write `intent.md` with `status: completed` and all confirmed content
- Write each `unit-NN-{slug}.md` with `status: completed`
- Write `discovery.md` with exploration findings
- Write operation files to `operations/`
- Commit all artifacts on the intent branch
- Save intent slug to han keep

**Phase 7: Handoff**
- Present summary of generated artifacts
- Offer to:
  - Run `/operate` immediately
  - Open PR/MR for spec review
  - Just show the file paths

### Key Design Constraints

1. **All units must have `status: completed`** — the code already exists, construction is not needed
2. **The intent must have `status: completed`** — enables both /operate and /followup
3. **Success criteria must reference traceable evidence** — test files or CI checks, not vague assertions
4. **Interactive confirmation gates at each phase** — user must approve intent, units, criteria, and ops plan before finalization
5. **Pragmatic unit decomposition** — start from actual history but restructure into clean boundaries. Do not force units to match individual PRs if the PR history is messy.
6. **No construction workflow** — /adopt skips the construction phase entirely. There are no bolts, no hat cycling, no build loops. The feature is already built.
7. **Compatible with /followup** — the adopted intent must be a valid `iterates_on` target. This means standard intent.md frontmatter with all required fields.
8. **Compatible with /operate** — the operations directory must contain valid operation spec files matching the format in operate/SKILL.md.

## Success Criteria

- [ ] `plugin/skills/adopt/SKILL.md` exists with valid frontmatter (description, user-invocable: true, argument-hint, allowed-tools)
- [ ] The SKILL.md defines all 7 phases (pre-checks, feature description, exploration, propose intent/units, success criteria, operational plan, write artifacts, handoff)
- [ ] Phase 2 specifies spawning Explore subagents for parallel codebase and git history analysis
- [ ] Phase 3 includes user confirmation gate for proposed intent and unit breakdown
- [ ] Phase 4 specifies analyzing test files and CI config to reconstruct success criteria with traceable evidence
- [ ] Phase 5 specifies generating operation spec files with valid frontmatter matching operate/SKILL.md format
- [ ] Phase 6 specifies writing all artifacts with `status: completed` on both intent and units
- [ ] Phase 7 offers to run /operate, open PR, or show file paths
- [ ] The skill references existing library functions (dlc_frontmatter_get/set, dlc_state_save, etc.) rather than reimplementing parsing
- [ ] The SKILL.md follows the same structural conventions as existing skills (elaborate, followup, operate)

## Risks

- **Scope creep in SKILL.md**: The adopt workflow has many phases and edge cases. Mitigation: Focus on the happy path first, handle edge cases with clear error messages rather than complex branching.
- **Feature ambiguity**: Users may describe features vaguely ("the auth system"). Mitigation: Phase 1 asks targeted questions and Phase 2 explores broadly to map the full feature surface.
- **Test-to-criteria mapping fidelity**: Automated mapping from tests to criteria may produce low-quality criteria. Mitigation: User confirmation gate in Phase 4, with the option to add/remove/revise criteria.

## Boundaries

This unit does NOT handle:
- Paper documentation updates — that is unit-02-paper-sync
- Creating new shared library functions — uses existing libraries only
- Modifying other existing skills — /adopt is additive only
- Defining the operational plan format — uses the existing format from operate/SKILL.md

## Notes

- Study `plugin/skills/elaborate/SKILL.md` closely — /adopt mirrors many of its patterns (worktree creation, discovery delegation, artifact writing, user confirmation gates) but reverses the direction (analyzing existing code instead of planning new code)
- Study `plugin/skills/followup/SKILL.md` to ensure the adopted intent is a valid iterates_on target
- Study `plugin/skills/operate/SKILL.md` to ensure generated operation files match the expected format
- The SKILL.md will likely be 400-800 lines — similar in scope to elaborate/SKILL.md but with different phase content
