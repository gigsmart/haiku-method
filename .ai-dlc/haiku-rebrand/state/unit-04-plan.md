# Unit-04: Studio Infrastructure — Tactical Plan

## Prerequisites

**Step 0: Merge rename branch into worktree**

This worktree is based on `main` (pre-rename). All lib files still use `dlc_` prefix.
Unit-01 (rename) is a declared dependency and has been merged into `ai-dlc/haiku-rebrand/main`.
The builder MUST merge or rebase onto the intent branch first so that `hku_*` functions
from parse.sh, config.sh, state.sh are available.

```bash
cd /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/haiku-rebrand-04-studio-infrastructure
git merge ai-dlc/haiku-rebrand/main --no-edit
```

After merge, verify: `grep -c '^hku_' plugin/lib/parse.sh` should show 13+.

---

## Step 1: Create `plugin/lib/studio.sh`

**File:** `plugin/lib/studio.sh`
**Pattern:** Follow hat.sh / pass.sh structure (guard, source deps, functions)

### Scaffold

```bash
#!/bin/bash
# studio.sh — Studio resolution and metadata for H·AI·K·U
#
# Studios are named lifecycle templates that define stage ordering,
# persistence type, and metadata. Definitions live in plugin/studios/
# (built-in) and .haiku/studios/ (project-level).
#
# Usage:
#   source studio.sh
#   path=$(hku_resolve_studio "software")
#   metadata=$(hku_load_studio_metadata "software")

# Guard
if [ -n "${_HKU_STUDIO_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_STUDIO_SOURCED=1

# Source config (chains to deps, parse, state)
STUDIO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$STUDIO_SCRIPT_DIR/config.sh"
```

### Functions (6 total)

#### 1.1 `hku_resolve_studio(name)`

- Validate name is `^[a-zA-Z0-9_-]+$` (path traversal guard, same as hat.sh)
- Resolution order:
  1. `.haiku/studios/{name}/STUDIO.md` (project-level, via `find_repo_root`)
  2. `plugin/studios/{name}/STUDIO.md` (built-in, via `CLAUDE_PLUGIN_ROOT`)
- Return: absolute path to STUDIO.md, or empty string + return 1

#### 1.2 `hku_load_studio_metadata(name)`

- Call `hku_resolve_studio "$name"` to get path
- If not found, return `{}` + return 1
- Extract frontmatter fields using `hku_frontmatter_get`:
  - `name`, `description`
- Extract `stages` array using `yq --front-matter=extract -o json '.stages'`
- Extract `persistence` object using `yq --front-matter=extract -o json '.persistence'`
- Build JSON object with defaults for missing persistence:
  ```json
  {"name":"...","description":"...","stages":[...],"persistence":{"type":"git","delivery":"pull-request"}}
  ```
- Return: JSON string

#### 1.3 `hku_load_studio_stages(name)`

- Call `hku_resolve_studio "$name"` to get path
- If not found, return empty + return 1
- Extract stages array: `yq --front-matter=extract -r '.stages[]' "$studio_file"`
- Return: newline-separated stage names (callers iterate with `while read`)

#### 1.4 `hku_validate_studio(name)`

- Call `hku_resolve_studio "$name"` — fail if not found
- Load stages via `hku_load_studio_stages "$name"`
- For each stage name, check that `hku_resolve_stage "$stage" "$name"` succeeds
  (stage.sh dependency — source stage.sh or call after both are loaded)
- On missing stage: stderr message `"haiku: studio '$name': stage '$stage' missing STAGE.md"`
- Return 0 if all valid, 1 if any missing

**Note:** This function depends on stage.sh. Either:
- Source stage.sh from studio.sh (creates circular risk — avoid)
- OR: validate uses inline resolution logic (check file existence directly)
- **Decision:** Use inline check — just test `[ -f "$stage_dir/STAGE.md" ]` in both
  project-level and built-in paths. No circular dependency.

#### 1.5 `hku_get_active_studio(intent_file?)`

- Fallthrough chain:
  1. If `$intent_file` provided and exists, read `studio:` from frontmatter
  2. If not found, read from `.haiku/settings.yml` via `get_setting_value "studio"`
  3. Default: `"ideation"`
- Return: studio name string

#### 1.6 `hku_list_available_studios()`

- Collect from built-in: `ls plugin/studios/` (dirs with STUDIO.md)
- Collect from project: `ls .haiku/studios/` (dirs with STUDIO.md)
- Deduplicate (project-level overrides share name with built-in)
- Sort alphabetically
- Return: newline-separated studio names

### Verification

```bash
source plugin/lib/studio.sh
# Should resolve built-in:
hku_resolve_studio "ideation"   # → .../plugin/studios/ideation/STUDIO.md
hku_resolve_studio "software"   # → .../plugin/studios/software/STUDIO.md
hku_resolve_studio "nonexist"   # → "" (return 1)

# Metadata:
hku_load_studio_metadata "ideation" | jq .

# Stages:
hku_load_studio_stages "software"
# inception
# design
# product
# development
# operations
# security

# Active:
hku_get_active_studio           # → "ideation" (default)

# List:
hku_list_available_studios
# ideation
# software

# Validate:
hku_validate_studio "ideation"  # → 0
```

---

## Step 2: Create `plugin/lib/stage.sh`

**File:** `plugin/lib/stage.sh`
**Pattern:** Same as studio.sh — guard, source deps, functions

### Scaffold

```bash
#!/bin/bash
# stage.sh — Stage resolution and metadata for H·AI·K·U
#
# Stages are lifecycle phases within a studio. Each stage has a
# STAGE.md definition and an outputs/ directory with output docs.
#
# Usage:
#   source stage.sh
#   path=$(hku_resolve_stage "design" "software")
#   metadata=$(hku_load_stage_metadata "design" "software")

# Guard
if [ -n "${_HKU_STAGE_SOURCED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
_HKU_STAGE_SOURCED=1

STAGE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$STAGE_SCRIPT_DIR/config.sh"
```

### Functions (6 total)

#### 2.1 `hku_resolve_stage(stage, studio)`

- Validate both names: `^[a-zA-Z0-9_-]+$`
- Resolution order:
  1. `.haiku/studios/{studio}/stages/{stage}/STAGE.md`
  2. `plugin/studios/{studio}/stages/{stage}/STAGE.md`
- Return: absolute path to STAGE.md, or empty string + return 1

#### 2.2 `hku_load_stage_metadata(stage, studio)`

- Call `hku_resolve_stage` to get path
- Extract frontmatter using `yq --front-matter=extract -o json` on the STAGE.md
- Return: JSON object with all frontmatter fields
- Return `{}` + return 1 if not found

#### 2.3 `hku_resolve_stage_outputs_dir(stage, studio)`

- Call `hku_resolve_stage` to get STAGE.md path
- Return: `dirname(stage_path) + "/outputs"`
- Does NOT check if dir exists (caller's responsibility)

#### 2.4 `hku_load_stage_outputs(stage, studio)`

- Call `hku_resolve_stage_outputs_dir` to get outputs/ path
- If dir doesn't exist or is empty, return `[]`
- For each `*.md` file in outputs/:
  - Extract frontmatter as JSON via `yq --front-matter=extract -o json`
  - Add `"file"` field with the filename
- Return: JSON array of output definitions

#### 2.5 `hku_resolve_stage_inputs(stage, studio, intent_dir)`

- Call `hku_load_stage_metadata` to get stage metadata
- Read `inputs` array from metadata (array of `{stage, output}` objects)
- For each input:
  - Resolve the source stage's outputs dir via `hku_resolve_stage_outputs_dir`
  - Find the matching output file
  - If intent_dir provided, resolve to intent-level artifact path
- Return: JSON array of `{ name, scope, resolved_path }`
- Return `[]` if no inputs defined

**Note:** For stub stages in this unit, inputs will mostly be empty. The function
structure matters more than having real data to resolve.

#### 2.6 `hku_list_stages_with_status(intent_file)`

- Read `studio:` from intent frontmatter via `hku_get_active_studio "$intent_file"`
- Load stages via studio.sh's `hku_load_studio_stages`
- Read `active_stage:` from intent frontmatter
- For each stage: determine status (completed / active / pending)
  - Heuristic: stages before active_stage = completed, active_stage = active, rest = pending
- Return: newline-separated `"stage_name:status"` pairs

### Verification

```bash
source plugin/lib/stage.sh
source plugin/lib/studio.sh

hku_resolve_stage "design" "software"
# → .../plugin/studios/software/stages/design/STAGE.md

hku_load_stage_metadata "design" "software" | jq .

hku_resolve_stage_outputs_dir "design" "software"
# → .../plugin/studios/software/stages/design/outputs

hku_load_stage_outputs "design" "software" | jq .
# → JSON array of output doc frontmatter
```

---

## Step 3: Create Studio Directories

### 3.1 Ideation Studio

```
plugin/studios/ideation/
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
```

### 3.2 Software Studio

```
plugin/studios/software/
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

---

## Step 4: Create STUDIO.md Files

### 4.1 `plugin/studios/ideation/STUDIO.md`

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

General-purpose lifecycle for creative, analytical, or exploratory work that
doesn't fit a specialized domain. Works for content creation, research projects,
documentation initiatives, or any work that follows a gather-create-review-deliver pattern.
```

### 4.2 `plugin/studios/software/STUDIO.md`

```yaml
---
name: software
description: Standard software development lifecycle
stages: [inception, design, product, development, operations, security]
persistence:
  type: git
  delivery: pull-request
---

# Software Studio

Full software development lifecycle from inception through security review.
Supports both single-stage (all disciplines merged) and multi-stage (sequential
discipline progression) execution modes.
```

---

## Step 5: Create STAGE.md Stubs

Each STAGE.md is a minimal stub with frontmatter. Detailed content is deferred to unit-05.

### Stub Template

```yaml
---
name: {stage_name}
description: {one-line description}
---

# {Stage Name}

Stage definition stub. Full content including hats, review configuration,
and detailed guidance will be added in a subsequent unit.
```

### Ideation Stages

| Stage | Description |
|-------|-------------|
| research | Gather context, prior art, and domain knowledge |
| create | Produce the primary deliverable |
| review | Adversarial review and quality assessment |
| deliver | Package and deliver the final output |

### Software Stages

| Stage | Description |
|-------|-------------|
| inception | Discovery and requirements gathering |
| design | Visual and interaction design |
| product | Behavioral specification and data contracts |
| development | Implementation and architecture |
| operations | Deployment, runbooks, and operational readiness |
| security | Threat modeling and vulnerability assessment |

---

## Step 6: Create Output Doc Stubs

Each output doc is a minimal `.md` file with frontmatter defining the output schema.

### Output Doc Frontmatter Schema

```yaml
---
name: {OUTPUT-NAME}
description: {one-line description}
scope: intent | unit
format: markdown | json | yaml
required: true | false
---
```

All output docs use scope `intent` and format `markdown` by default.
All are `required: true` unless noted.

### Files to Create

**Ideation outputs:**
- `research/outputs/RESEARCH-BRIEF.md` — Research findings and context summary
- `create/outputs/DRAFT-DELIVERABLE.md` — Primary draft output
- `review/outputs/REVIEW-REPORT.md` — Review findings and recommendations
- `deliver/outputs/FINAL-DELIVERABLE.md` — Final packaged deliverable

**Software outputs:**
- `inception/outputs/DISCOVERY.md` — Discovery findings and requirements
- `design/outputs/DESIGN-BRIEF.md` — Design direction and visual specs
- `design/outputs/DESIGN-TOKENS.md` — Design token definitions
- `product/outputs/BEHAVIORAL-SPEC.md` — Behavioral specifications
- `product/outputs/DATA-CONTRACTS.md` — API and data contracts
- `development/outputs/CODE.md` — Implementation guidance and patterns
- `development/outputs/ARCHITECTURE.md` — Architecture decisions
- `operations/outputs/RUNBOOK.md` — Operational runbook
- `operations/outputs/DEPLOYMENT-CONFIG.md` — Deployment configuration
- `security/outputs/THREAT-MODEL.md` — Threat model documentation
- `security/outputs/VULN-REPORT.md` — Vulnerability findings

Total: 15 output doc stubs.

---

## Step 7: Update Settings Schema

**File:** `plugin/schemas/settings.schema.json`

Add `studio` field to the top-level `properties`:

```json
"studio": {
  "type": "string",
  "description": "The studio (lifecycle template) for this project. Studios define the ordered sequence of stages.",
  "default": "ideation",
  "examples": ["ideation", "software"]
}
```

This is a sibling of `git`, `jj`, `providers`, etc. in the schema.

---

## Step 8: Verification Checklist

Run from the worktree root:

```bash
# 1. studio.sh exists and sources cleanly
source plugin/lib/studio.sh && echo "studio.sh OK"

# 2. stage.sh exists and sources cleanly
source plugin/lib/stage.sh && echo "stage.sh OK"

# 3. Studio resolution
[ -n "$(hku_resolve_studio ideation)" ] && echo "ideation resolves"
[ -n "$(hku_resolve_studio software)" ] && echo "software resolves"

# 4. Metadata parsing
hku_load_studio_metadata ideation | jq -e '.stages | length == 4'
hku_load_studio_metadata software | jq -e '.stages | length == 6'

# 5. Stage resolution
hku_resolve_stage research ideation | grep -q STAGE.md && echo "ideation/research OK"
hku_resolve_stage development software | grep -q STAGE.md && echo "software/development OK"

# 6. Validation
hku_validate_studio ideation && echo "ideation valid"
hku_validate_studio software && echo "software valid"

# 7. Active studio default
[ "$(hku_get_active_studio)" = "ideation" ] && echo "default is ideation"

# 8. List studios
hku_list_available_studios | wc -l  # Should be 2

# 9. Outputs
hku_load_stage_outputs design software | jq -e 'length == 2'
hku_load_stage_outputs development software | jq -e 'length == 2'

# 10. Settings schema
jq '.properties.studio' plugin/schemas/settings.schema.json | jq -e '.default == "ideation"'

# 11. All stage dirs have STAGE.md
find plugin/studios -name STAGE.md | wc -l  # Should be 10

# 12. All output dirs have at least one file
find plugin/studios -path '*/outputs/*.md' | wc -l  # Should be 15
```

---

## Implementation Order

The builder should execute in this order:

1. **Step 0** — Merge rename branch (prerequisite)
2. **Step 3** — Create directory structure (mkdir -p all dirs)
3. **Step 4** — Write STUDIO.md files (ideation, software)
4. **Step 5** — Write STAGE.md stubs (10 files)
5. **Step 6** — Write output doc stubs (15 files)
6. **Step 1** — Write `studio.sh` (depends on dirs existing for testing)
7. **Step 2** — Write `stage.sh` (depends on dirs existing for testing)
8. **Step 7** — Update settings schema (independent)
9. **Step 8** — Run verification

Steps 3-6 can be done as one batch (all content creation).
Steps 1, 2, and 7 can be done in parallel after dirs exist.
Step 8 is the final gate.

---

## Risk Notes

- **Circular dependency avoidance:** studio.sh validates stages by checking file existence
  directly, NOT by calling stage.sh functions. This avoids circular sourcing.
- **Rename merge conflicts:** The worktree has pre-rename code. Merging may cause conflicts
  in files modified by both unit-01 (rename) and this branch. New files (studio.sh, stage.sh,
  studios/) won't conflict since they don't exist in either branch.
- **yq dependency:** All frontmatter parsing uses yq (mikefarah/Go). The `hku_require_yq`
  guard in deps.sh handles missing yq gracefully.
