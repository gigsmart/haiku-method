---
status: pending
last_updated: ""
depends_on: [unit-01-lib-hooks-rename]
branch: ai-dlc/haiku-rebrand/04-studio-infrastructure
discipline: backend
stage: ""
workflow: ""
ticket: ""
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
      research/STAGE.md
      create/STAGE.md
      review/STAGE.md
      deliver/STAGE.md
  software/
    STUDIO.md
    stages/
      inception/STAGE.md
      design/STAGE.md
      product/STAGE.md
      development/STAGE.md
      operations/STAGE.md
      security/STAGE.md
```

Project-level overrides:
```
.haiku/studios/
  software/              # Override built-in software studio
    STUDIO.md            # Override stage list
    stages/
      custom-stage/STAGE.md   # Add custom stage
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
hku_load_stage_metadata() {
  local stage_name="$1"
  local studio_name="$2"
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

- [ ] `plugin/lib/studio.sh` exists with all 6 functions implemented
- [ ] `hku_resolve_studio` correctly resolves project-level overrides before built-in
- [ ] `hku_load_studio_metadata` parses STUDIO.md frontmatter correctly
- [ ] `hku_validate_studio` checks that all referenced stages have STAGE.md files
- [ ] `hku_get_active_studio` falls through: intent -> settings -> default
- [ ] `hku_list_available_studios` returns both built-in and project-level studios
- [ ] `plugin/lib/stage.sh` resolves stages relative to studios
- [ ] Studio directories created: `plugin/studios/ideation/`, `plugin/studios/software/`
- [ ] STUDIO.md files created for ideation and software studios (frontmatter + body)
- [ ] Settings schema includes `studio` field with default `"ideation"`
- [ ] Stage STAGE.md stub files exist (detailed content in unit-05)

## Risks

- **Resolution ambiguity**: Project-level studios might partially override built-in ones (e.g., adding a stage but not redefining STUDIO.md). Mitigation: resolution is per-file — STUDIO.md resolves independently of individual STAGE.md files. A project can override just the STUDIO.md (to add stages) while still using built-in STAGE.md files for existing stages.
- **Shell performance**: Multiple file lookups for resolution could be slow. Mitigation: cache resolved paths in shell variables during a session.
- **Circular references**: A stage referencing another studio's stage. Mitigation: validation checks that all stages exist within the resolved studio's namespace.

## Boundaries

This unit creates the studio infrastructure (library, schema, directory structure). It does NOT write detailed stage content (unit-05), create the orchestrator (unit-06), or implement persistence adapters (unit-08). Stage STAGE.md files created here are stubs — unit-05 fills in the full content with hats, review modes, and guidance.
