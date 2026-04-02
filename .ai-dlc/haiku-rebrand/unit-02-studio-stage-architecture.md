---
status: pending
last_updated: ""
depends_on: [unit-01-mechanical-rebrand]
branch: ai-dlc/haiku-rebrand/02-studio-stage-architecture
discipline: backend
stage: ""
workflow: ""
ticket: ""
---

# unit-02-studio-stage-architecture

## Description
Implement the studio/stage architecture: studios as lifecycle templates, stages as self-contained lifecycle phases with hats defined inline, and the unified plan→build→review loop replacing the elaborate/execute split.

## Discipline
backend - Plugin architecture, shell libraries, skill definitions.

## Domain Entities
Studio, Stage, STAGE.md, STUDIO.md, Hat (inline), Review Gate, Knowledge Pool.

## Technical Specification

### Studios
- Create `plugin/studios/ideation/STUDIO.md` — default studio: research → create → review → deliver
- Create `plugin/studios/software/STUDIO.md` — software studio: inception → design → product → development → operations → security
- Each stage gets a `stages/{name}/STAGE.md` inside its studio
- Create `plugin/lib/studio.sh` — studio resolution, validation, stage loading
- Update `plugin/lib/stage.sh` — stage resolution relative to studios
- Update settings schema: `studio:` field (default: "ideation")

### Stage definitions (software studio)
Each STAGE.md contains:
- Frontmatter: name, description, hats (ordered array), review mode, unit_types, requires/produces
- Body: free-form guidance (criteria examples, builder focus, reviewer focus) + per-hat sections
- Stages: inception, design, product, development, operations, security

### Dissolve old concepts
- Remove `plugin/hats/` directory — hat instructions move into STAGE.md `## hat-name` sections
- Remove `plugin/workflows.yml` — the hat sequence in STAGE.md IS the workflow
- Remove workflow-select sub-skill from elaborate
- Remove `plugin/stages/` top-level directory (stages live inside studios now)

### Unified stage orchestrator
- New skill: `/haiku:stage` — runs a single stage (plan → build → review gate)
- Replaces both `/haiku:elaborate` and `/haiku:execute` as the primary interface
- `/haiku:run` — continuous mode: autopilot through all stages with review gates
- The old elaborate sub-skills (discover, criteria, decompose, etc.) become the "plan" phase of each stage
- The old execute loop (hat bolt cycles) becomes the "build" phase of each stage
- Adversarial review runs after build, before the review gate

### Review gates
- `auto` — advance immediately after adversarial review
- `ask` — pause, present artifacts to user, get approval/revision/go-back
- `external` — create PR or request team review, block until approved
- In discrete mode: all stages are reviewed regardless of gate setting

### Knowledge flow
- Intent artifacts: `.haiku/{slug}/stages/{stage}/units/` — units scoped per stage
- Intent state: `.haiku/{slug}/state.json` — tracks active_stage, mode, studio
- Per-stage state: `.haiku/{slug}/stages/{stage}/state.json`
- Global knowledge pool: `.haiku/knowledge/` — unchanged, every stage reads it

## Success Criteria
- [ ] Default ideation studio exists with 4 stages, each with STAGE.md
- [ ] Software studio exists with 6 stages, each with STAGE.md including hats
- [ ] `plugin/hats/` directory is removed
- [ ] `plugin/workflows.yml` is removed
- [ ] `/haiku:stage {name}` runs a single stage through plan→build→review
- [ ] `/haiku:run` drives continuous mode through all stages
- [ ] Each stage's STAGE.md defines hats in frontmatter and per-hat instructions in body
- [ ] Review gates work: auto advances, ask pauses, external creates PR
- [ ] Units are stored under `.haiku/{slug}/stages/{stage}/units/`
- [ ] Stage state tracks independently per stage
- [ ] All existing tests pass

## Risks
- **Backwards compatibility**: Existing `.ai-dlc/` intents won't be recognized. Mitigation: migration script or backwards-compat shim that reads old format.
- **Elaborate sub-skills**: The discover, criteria, decompose sub-skills need to work within the new stage context. Mitigation: they become the "plan" phase internals — minimal API change.

## Boundaries
This unit does NOT implement persistence abstraction (unit-03). Git operations stay hardcoded for now. This unit does NOT update the paper or website docs (unit-04).
