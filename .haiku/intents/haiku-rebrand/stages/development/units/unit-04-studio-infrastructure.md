---
name: unit-04-studio-infrastructure
type: backend
status: completed
inputs: ["knowledge/DISCOVERY.md"]
depends_on: [unit-01-lib-hooks-rename]
bolt: 0
hat: ""
started_at: 2026-04-03T01:34:30Z
completed_at: 2026-04-03T01:34:30Z
---


# unit-04-studio-infrastructure

## Description

Create the studio infrastructure layer that makes H·AI·K·U domain-agnostic. Studios are named lifecycle templates that define stage ordering, persistence type, and metadata. This unit builds the resolution, loading, and validation logic, the STUDIO.md schema, and updates the settings to reference studios.

## Discipline

backend - Shell library functions, markdown schema definition, and settings integration.

## Domain Entities

- `plugin/lib/studio.sh` — studio resolution, loading, and validation functions
- `plugin/lib/stage.sh` — updated to resolve stages relative to studios
- `plugin/studios/` — directory structure for built-in studios
- `plugin/schemas/settings.schema.json` — `studio:` field (default: `"ideation"`)
- STUDIO.md schema — the file format for studio definitions

## Technical Specification

### STUDIO.md Schema

Each studio is defined by a `STUDIO.md` file with YAML frontmatter:

```yaml
---
name: ideation
description: Universal lifecycle for any creative or analytical work
stages: [research, create, review, deliver]
persistence:
  type: filesystem
  delivery: local
---

# Ideation Studio

Free-form documentation about the studio's purpose, philosophy, and when to use it.
```

Frontmatter fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Studio identifier (must match directory name) |
| `description` | string | yes | One-line description |
| `stages` | string[] | yes | Ordered list of stage names |
| `persistence` | object | no | Persistence configuration (default: `{ type: git, delivery: pull-request }`) |
| `persistence.type` | string | no | Adapter name: `git`, `filesystem`, `notion` (default: `git`) |
| `persistence.delivery` | string | no | How completed work is delivered: `pull-request`, `local`, `export` (default: `pull-request`) |

### Directory Structure

```
plugin/studios/
  ideation/
    STUDIO.md
    stages/
      research/
        STAGE.md
        outputs/
          RESEARCH-BRIEF.md
      create/
        STAGE.md
        outputs/
          DRAFT-DELIVERABLE.md
      review/
        STAGE.md
        outputs/
          REVIEW-REPORT.md
      deliver/
        STAGE.md
        outputs/
          FINAL-DELIVERABLE.md
  software/
    STUDIO.md
    stages/
      inception/
        STAGE.md
        outputs/
          DISCOVERY.md
      design/
        STAGE.md
        outputs/
          DESIGN-BRIEF.md
          DESIGN-TOKENS.md
      product/
        STAGE.md
        outputs/
          BEHAVIORAL-SPEC.md
          DATA-CONTRACTS.md
      development/
        STAGE.md
        outputs/
          CODE.md
          ARCHITECTURE.md
      operations/
        STAGE.md
        outputs/
          RUNBOOK.md
          DEPLOYMENT-CONFIG.md
      security/
        STAGE.md
        outputs/
          THREAT-MODEL.md
          VULN-REPORT.md
```

Project-level overrides:
```
.haiku/studios/
  software/              # Override built-in software studio
    STUDIO.md            # Override stage list
    stages/
      custom-stage/
        STAGE.md
        outputs/
          CUSTOM-OUTPUT.md   # scope: intent, format: text
```

### Studio Library (`plugin/lib/studio.sh`)

Functions to implement:

```bash
# Resolve a studio definition file path
# Resolution order: .haiku/studios/{name}/ -> plugin/studios/{name}/
# Returns: absolute path to STUDIO.md, or "" if not found
hku_resolve_studio() {
  local studio_name="$1"
  # ...
}

# Load studio metadata from STUDIO.md frontmatter
# Returns: JSON object with name, description, stages, persistence
hku_load_studio_metadata() {
  local studio_name="$1"
  # ...
}

# Load the ordered list of stage names for a studio
# Returns: space-separated stage names
hku_load_studio_stages() {
  local studio_name="$1"
  # ...
}

# Validate that a studio and all its referenced stages exist
# Returns: 0 if valid, 1 if invalid (with error message to stderr)
hku_validate_studio() {
  local studio_name="$1"
  # ...
}

# Get the active studio for the current project
# Reads from: intent frontmatter -> settings.yml -> default ("ideation")
# Returns: studio name string
hku_get_active_studio() {
  local intent_file="${1:-}"
  # ...
}

# List all available studios (built-in + project-level)
# Returns: newline-separated studio names
hku_list_available_studios() {
  # ...
}
```

### Stage Library Updates (`plugin/lib/stage.sh`)

Update `resolve_stage_definition` (or equivalent) to resolve stages relative to studios:

```bash
# Resolve a stage definition file path within a studio
# Resolution order:
#   .haiku/studios/{studio}/stages/{stage}/STAGE.md
#   plugin/studios/{studio}/stages/{stage}/STAGE.md
# Returns: absolute path to STAGE.md
hku_resolve_stage() {
  local stage_name="$1"
  local studio_name="$2"
  # ...
}

# Load stage metadata from STAGE.md frontmatter
# Returns: JSON with name, description, hats, review, unit_types, inputs
hku_load_stage_metadata() {
  local stage_name="$1"
  local studio_name="$2"
  # ...
}

# Resolve the outputs/ directory for a stage
# Resolution order mirrors stage resolution
# Returns: absolute path to outputs/ directory
hku_resolve_stage_outputs_dir() {
  local stage_name="$1"
  local studio_name="$2"
  # Returns: dirname(resolve_stage) + "/outputs"
}

# List all output definitions for a stage
# Reads frontmatter from each *.md file in the outputs/ directory
# Returns: JSON array of { name, location, scope, format, required }
hku_load_stage_outputs() {
  local stage_name="$1"
  local studio_name="$2"
  # ...
}

# Resolve inputs for a stage using qualified references (stage + output pairs)
# For each {stage, output} input, looks up the named output directly in the
# specified stage's outputs/ directory — no cross-stage search needed
# Returns: JSON array of { name, scope, resolved_path }
hku_resolve_stage_inputs() {
  local stage_name="$1"
  local studio_name="$2"
  local intent_dir="$3"
  # ...
}

# Get all stages for the active studio with their status
hku_list_stages_with_status() {
  local intent_file="$1"
  # ...
}
```

### Settings Schema Update

Add/confirm `studio` field in `plugin/schemas/settings.schema.json`:

```json
{
  "studio": {
    "type": "string",
    "description": "The studio (lifecycle template) for this project.",
    "default": "ideation",
    "examples": ["ideation", "software"]
  }
}
```

The default is `"ideation"` — every project has a studio, and the default works for any domain.

### Intent Frontmatter Update

Update the intent frontmatter schema to include studio reference:

```yaml
---
studio: software
stages: [inception, design, product, development, operations, security]
active_stage: design
# ... existing fields ...
---
```

When an intent is created, the studio is resolved from settings (or user choice) and the stage list is populated from the studio's definition.

### Resolution Priority

1. Intent frontmatter `studio:` field (if intent specifies one)
2. Project settings `.haiku/settings.yml` `studio:` field
3. Default: `"ideation"`

For stages within a studio:
1. Project-level override: `.haiku/studios/{name}/stages/{stage}/STAGE.md`
2. Built-in: `plugin/studios/{name}/stages/{stage}/STAGE.md`

This allows projects to add stages to a built-in studio or override individual stages without copying the entire studio.

## Success Criteria

- [x] `plugin/lib/studio.sh` exists with all 6 functions implemented
- [x] `hku_resolve_studio` correctly resolves project-level overrides before built-in
- [x] `hku_load_studio_metadata` parses STUDIO.md frontmatter correctly
- [x] `hku_validate_studio` checks that all referenced stages have STAGE.md files
- [x] `hku_get_active_studio` falls through: intent -> settings -> default
- [x] `hku_list_available_studios` returns both built-in and project-level studios
- [x] `plugin/lib/stage.sh` resolves stages relative to studios
- [x] `hku_resolve_stage_outputs_dir` resolves the `outputs/` directory for a stage
- [x] `hku_load_stage_outputs` reads frontmatter from all output docs in `outputs/`
- [x] `hku_resolve_stage_inputs` maps input names to prior stage output locations
- [x] Studio directories created: `plugin/studios/ideation/`, `plugin/studios/software/`
- [x] STUDIO.md files created for ideation and software studios (frontmatter + body)
- [x] Settings schema includes `studio` field with default `"ideation"`
- [x] Stage STAGE.md stub files and `outputs/` directories exist (detailed content in unit-05)

## Risks

- **Resolution ambiguity**: Project-level studios might partially override built-in ones (e.g., adding a stage but not redefining STUDIO.md). Mitigation: resolution is per-file — STUDIO.md resolves independently of individual STAGE.md files. A project can override just the STUDIO.md (to add stages) while still using built-in STAGE.md files for existing stages.
- **Shell performance**: Multiple file lookups for resolution could be slow. Mitigation: cache resolved paths in shell variables during a session.
- **Circular references**: A stage referencing another studio's stage. Mitigation: validation checks that all stages exist within the resolved studio's namespace.

## Boundaries

This unit creates the studio infrastructure (library, schema, directory structure). It does NOT write detailed stage content or output docs (unit-05), create the orchestrator (unit-06), or implement persistence adapters (unit-08). Stage STAGE.md files and `outputs/` directories created here are stubs — unit-05 fills in the full content with hats, review modes, guidance, and output definitions.
