---
intent: adopt-skill
created: 2026-03-29
status: active
---

# Discovery Log: /adopt Skill — Reverse-Engineer Existing Features into AI-DLC

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Pattern: Skill Structure

Skills live in `plugin/skills/{skill-name}/SKILL.md` — one file per skill, no companion files. Discovery is filesystem-based (no central registry). There are 28 existing skills.

**SKILL.md Frontmatter Schema:**

```yaml
---
description: {string}              # Human-readable description
user-invocable: {boolean}          # Whether users can call directly via /skillname
argument-hint: {string}            # CLI argument pattern (e.g., "[intent-slug]")
allowed-tools: [{string}]          # Tools this skill can invoke (Read, Write, Bash, Skill, etc.)
disable-model-invocation: {boolean} # If true, skill runs without AI model
---
```

Skills invoke each other via the `Skill` tool. Context passes between skills through filesystem state in `.ai-dlc/{slug}/`.

**Key skill invocation chains:**
- `/elaborate` → internally calls `/elaborate-discover`, `/elaborate-wireframes`, `/elaborate-ticket-sync`
- `/followup` → creates intent scaffold → invokes `/elaborate {new-slug}`
- `/execute` → loops through hats → calls `/advance` to transition
- `/operate` → reads `.ai-dlc/{intent}/operations/` directory

## Codebase Pattern: Intent & Unit Artifact Format

### Intent.md Frontmatter (Complete Schema)

```yaml
---
workflow: {string}              # Required: workflow name (default, adversarial, design, etc.)
git:
  change_strategy: {enum}       # Required: unit | intent | trunk
  auto_merge: {boolean}         # Required
  auto_squash: {boolean}        # Optional, default false
announcements: [{string}]      # Optional: [changelog, release-notes, social-posts, blog-draft]
passes: [{string}]             # Optional: [design, product, dev]
active_pass: {string}          # Optional: auto-managed by construct
iterates_on: {string}          # Optional: previous intent slug (set by /followup)
created: {ISO date}            # Required: YYYY-MM-DD
status: {enum}                 # Required: active | completed
epic: {string}                 # Optional: ticketing provider epic key
---
```

**Intent body sections:** Problem, Solution, Domain Model (Entities, Relationships, Data Sources, Data Gaps), Success Criteria, Context.

### Unit Frontmatter (Complete Schema)

```yaml
---
status: {enum}                 # Required: pending | in_progress | completed | blocked
last_updated: {ISO timestamp}  # Optional: auto-set on status change
depends_on: [{string}]         # Optional: [unit-NN-slug, ...]
branch: {string}               # Required: ai-dlc/{intent-slug}/NN-{unit-slug}
discipline: {string}           # Required: frontend, backend, api, documentation, devops, design, etc.
pass: {string}                 # Optional: design | product | dev
workflow: {string}             # Optional: per-unit workflow override
ticket: {string}               # Optional: ticketing provider key
deployment:                    # Optional: when unit has deployment surface
  target: {string}
  artifacts: [{string}]
  environments: [{string}]
monitoring:                    # Optional: when unit is observable
  metrics: [{string}]
  dashboards: [{string}]
  alerts: [{string}]
  slos: [{string}]
operations:                    # Optional: when unit is operable
  runbooks: [{string}]
  rollback: {string}
  scaling: {string}
---
```

**Unit naming:** `unit-NN-{slug}.md` where NN is zero-padded (01, 02, ...).
**Unit body sections (standard):** Description, Discipline, Domain Entities, Data Sources, Technical Specification, Success Criteria, Risks, Boundaries, Notes.
**Unit body sections (design):** Description, Discipline, Design Deliverables, States to Cover, Constraints, Design Tokens Reference, Success Criteria, Risks, Boundaries, Notes.

## Codebase Pattern: /operate Skill Requirements

The `/operate` skill expects:

1. **Intent with status field** in `.ai-dlc/{intent-slug}/intent.md`
2. **Operations directory** at `.ai-dlc/{intent-slug}/operations/` containing individual `.md` files

### Operation File Format

```yaml
---
name: {identifier}              # Must match filename (minus .md)
type: scheduled|reactive|process # Required
owner: agent|human              # Required
schedule: "{cron-expression}"   # For scheduled type
trigger: "{condition}"          # For reactive type
frequency: "daily|weekly|monthly|quarterly|annually"  # For process type
runtime: node|python|go|shell   # Optional per-operation override
---
```

- `owner: agent` → companion script required (`.ts`, `.py`, `.go`, or `.sh` alongside the `.md`)
- `owner: human` → markdown checklist in body
- Status tracked in `.ai-dlc/{intent}/state/operation-status.json`
- Deploy targets: k8s-cronjob, k8s-deployment, github-actions, docker-compose, systemd

## Codebase Pattern: /followup Requirements

For an intent to be a valid `/followup` target:
- Must exist as `.ai-dlc/{slug}/intent.md` in filesystem OR on a git branch (`ai-dlc/{slug}/main`)
- **No status validation** — any status value is accepted
- `/followup` reads: intent.md, all unit-*.md files, optional discovery.md
- Creates new intent with `iterates_on: "{previous-slug}"` in frontmatter
- Then invokes `/elaborate {new-slug}` which detects `iterates_on` in Phase 0.5

## Codebase Pattern: Shared Libraries

| Library | Key Functions |
|---------|---------------|
| `config.sh` | `get_ai_dlc_config()`, `load_providers()`, `detect_vcs()`, `resolve_default_branch()` |
| `parse.sh` | `dlc_frontmatter_get()`, `dlc_frontmatter_set()`, `dlc_check_unit_criteria()` |
| `state.sh` | `dlc_state_save()`, `dlc_state_load()`, `dlc_find_active_intent()` |
| `dag.sh` | `parse_unit_status()`, `find_ready_units()`, `update_unit_status()`, `get_dag_summary()`, `validate_dag()`, `discover_branch_intents()` |
| `telemetry.sh` | `aidlc_telemetry_init()`, `aidlc_log_event()`, `aidlc_record_intent_created()` |

## Codebase Pattern: Git Worktree Model

- Intent worktree: `.ai-dlc/worktrees/{intent-slug}/` on branch `ai-dlc/{intent-slug}/main`
- Unit worktree: `.ai-dlc/worktrees/{intent-slug}-{unit-slug}/` on branch `ai-dlc/{intent-slug}/{unit-slug}`
- `.ai-dlc/worktrees/` is gitignored
- Worktrees branch off the default branch (main/master)
- Three merge strategies: unit (per-unit PRs to main), intent (single PR from intent branch), trunk (direct to main)
- Cleanup: `git worktree remove` after merge/PR

## Codebase Pattern: Workflows & Hats

**5 predefined workflows:**

| Workflow | Hat Sequence |
|----------|-------------|
| default | planner → builder → reviewer |
| adversarial | planner → builder → red-team → blue-team → reviewer |
| design | planner → designer → reviewer |
| hypothesis | observer → hypothesizer → experimenter → analyst |
| tdd | test-writer → implementer → refactorer → reviewer |

**13 hats available:** planner, builder, reviewer, test-writer, implementer, refactorer, designer, observer, hypothesizer, experimenter, analyst, red-team, blue-team.

## Architecture Decision: /adopt Workflow Design

The `/adopt` skill is a new entry point into the AI-DLC lifecycle that reverses the normal flow. Instead of elaborate → construct → operate, it:

1. **Analyzes existing code** (reverse of elaborate's domain discovery)
2. **Generates completed artifacts** (reverse of construct producing code)
3. **Auto-generates operational plan** (enabling immediate /operate)
4. **Enables /followup** (adopted intent is a valid iterates_on target)

Key design decisions:
- `/adopt` does NOT use worktrees — the feature already exists on the current branch. Artifacts are written directly.
- All units get `status: completed` since the code already exists.
- Success criteria are reverse-engineered from existing tests and CI.
- The intent gets `status: completed` to enable both /operate and /followup.
- Operations are inferred from the feature's deployment surface, monitoring, and maintenance needs.

## Domain Model

### Entities

- **Existing Feature**: The pre-existing codebase feature being adopted — identified by user description, code paths, and git history
- **Adopted Intent**: An intent.md with `status: completed` representing the adopted feature — enables /operate and /followup
- **Adopted Unit**: A unit-NN-slug.md with `status: completed` representing a logical piece of the adopted feature
- **Discovery Log**: Domain knowledge captured during reverse-engineering (discovery.md)
- **Success Criteria**: Verifiable criteria reconstructed from existing tests and CI configuration
- **Operational Plan**: Collection of operation spec files in `operations/` enabling immediate /operate use
- **SKILL.md**: The skill definition file for /adopt itself

### Relationships

- Existing Feature maps to one Adopted Intent
- Adopted Intent has many Adopted Units
- Adopted Intent has one Discovery Log
- Adopted Intent has many Success Criteria (intent-level)
- Each Adopted Unit has many Success Criteria (unit-level)
- Adopted Intent has one Operational Plan (collection of operation files)
- Adopted Intent is a valid `iterates_on` target for /followup

### Data Sources

- **Codebase (filesystem)**: Source code files, test files, CI config, deployment manifests — the primary input for reverse-engineering
- **Git history**: Commits, PRs, branches — provides temporal context for how the feature was built
- **Plugin filesystem**: SKILL.md templates, library functions, workflows.yml — defines the artifact format and available utilities
- **User input**: Feature description, specific code paths, additional context — guides the reverse-engineering focus

### Data Gaps

- **No automated test-to-criteria mapping**: Tests exist but mapping them to high-level success criteria requires semantic analysis — the agent must interpret test intent, not just list test names
- **Git history may be messy**: Real development history often has merge commits, reverts, and cross-cutting changes — the pragmatic blend approach handles this by restructuring into clean units
- **Operational needs are inferred**: Unlike elaborate where the user defines operations, /adopt must infer them from deployment surface, CI config, and monitoring setup

