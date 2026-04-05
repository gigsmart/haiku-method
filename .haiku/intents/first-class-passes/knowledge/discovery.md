---
intent: first-class-passes
created: 2026-03-31
status: active
---

# Discovery Log: First-Class Passes

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

## Codebase Context

**Stack:** Shell (hooks/lib), TypeScript (shared parser, CLI dashboard, MCP server), Next.js 15 (website)
**Architecture:** Monorepo with three components — plugin (Claude Code plugin), website (Next.js static site), paper (methodology spec). Plugin uses bash hooks and SKILL.md-based agent orchestration.
**Build tools:** Bun (lockfile present: `bun.lock`), Biome (linting/formatting), npm workspaces (`website`, `plugin/shared`, `plugin/mcp-server`, `plugin/cli`)
**Conventions:** YAML frontmatter in markdown files for metadata, bash hooks for lifecycle events, shell libraries in `plugin/lib/`, hat definitions as markdown in `plugin/hats/`, skills as `SKILL.md` files in `plugin/skills/{name}/`
**Concerns:** Hat resolution currently uses override semantics (project `.ai-dlc/hats/` replaces plugin `hats/`), needs to change to augmentation. No pass definition files exist yet (`plugin/passes/` directory missing). Pass types are hardcoded as an enum in settings schema.

## Codebase Pattern: Current Pass Implementation

Passes currently exist as a scheduling/metadata concept only -- they control which units execute in a given phase but do NOT influence how hats behave during construction. Here is a comprehensive map of every file that touches passes:

### Data Model (types.ts)
- `IntentFrontmatter.passes?: string[]` -- ordered pass array on the intent
- `IntentFrontmatter.active_pass?: string` -- currently active pass
- `UnitFrontmatter.pass?: string` -- which pass a unit belongs to

### Settings Schema (settings.schema.json)
- `default_passes` property: `type: "array"`, items: `enum: ["design", "product", "dev"]`
- **Problem:** Hardcoded enum. Custom passes (e.g., "security", "accessibility") cannot be added without schema changes.
- Default is `[]` (empty = single implicit dev pass)

### Elaborate Skill (Phase 5.95)
- Reads `default_passes` from `.ai-dlc/settings.yml` via yq
- If <2 entries: sets `passes: []`, `active_pass: ""` (skip)
- If >=2 entries: sets `passes` to configured array, `active_pass` to first entry
- Override via `.ai-dlc/{intent}/settings.yml`
- Unit template includes `pass: ""` field

### Execute Skill (Step 5c completion)
- On intent completion, checks for next pass in the sequence
- Parses `passes:` and `active_pass:` from intent.md via grep/sed
- If next pass exists: updates `active_pass`, notifies user to re-elaborate, saves `status=pass_transition`
- If no next pass: marks intent complete

### DAG Library (dag.sh)
- `parse_unit_pass()` function extracts `pass` field from unit frontmatter
- `find_ready_units_for_pass()` function filters ready units by active_pass
- When `active_pass` is empty, returns all ready units (backward compatible)

### Hook Injection (inject-context.sh and subagent-context.sh)
- **inject-context.sh** (lines 615-665): Hat resolution uses override pattern:
  1. Check `.ai-dlc/hats/${HAT}.md` (project override)
  2. If not found, check `${PLUGIN_ROOT}/hats/${HAT}.md` (plugin built-in)
  - Project file completely replaces plugin file (no augmentation)
  - **No pass context is injected** -- hats get no awareness of the active pass
- **subagent-context.sh** (lines 186-214): Same override pattern for hat resolution
  - Again, project `.ai-dlc/hats/` completely replaces plugin hats
  - No pass context injection

### Paper Documentation
- **Section: "Iteration Through Passes"** (line 373): Well-documented conceptual model with mermaid diagram showing design/product/dev passes with backward flow
- **Glossary entry "Pass"** (line 698): Documents pass structure, built-in types table, and frontmatter format
- **Note:** The paper shows pass frontmatter as `- type: design / status: completed` (structured objects), but the actual implementation uses flat string arrays (`passes: [design, dev]`). This is a paper-implementation mismatch.

### Website Docs (concepts.md)
- Lines 61-87: Pass types table, configuration example, basic explanation
- Lines 355-380: "When to Use Passes" section, backward flow diagram
- Fairly complete but lacks detail on pass-backs and lifecycle

### Workflows (workflows.yml)
- 6 named workflows: default, adversarial, design, hypothesis, tdd, bdd
- **No pass-to-workflow mapping** -- passes don't constrain which workflows are available
- The `design` workflow uses `[planner, designer, reviewer]` hats -- this is relevant for design passes but there's no mechanism linking them

### What's Missing (The Gap)
1. **No pass definition files** -- `plugin/passes/` directory doesn't exist
2. **No pass-to-hat context injection** -- hats don't know what pass they're in
3. **No per-pass workflow constraints** -- any workflow can be used in any pass
4. **No project-level pass customization** -- can't add/augment passes per project
5. **Hat resolution is override-only** -- project hats replace, not augment
6. **Settings schema hardcodes pass enum** -- can't add custom pass types
7. **Paper-implementation mismatch** on pass frontmatter format

## Codebase Pattern: Hat Resolution and Context Injection

### Current Hat Resolution Pattern

Both `inject-context.sh` (SessionStart hook) and `subagent-context.sh` (SubagentPrompt hook) use the same override pattern:

**inject-context.sh (lines 615-665):**
```bash
# Resolution order: 1) User override (.ai-dlc/hats/), 2) Plugin built-in (hats/)
HAT_FILE=""
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$PLUGIN_ROOT" ] && [ -f "${PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

**subagent-context.sh (lines 186-214):**
```bash
if [ -f ".ai-dlc/hats/${HAT}.md" ]; then
  HAT_FILE=".ai-dlc/hats/${HAT}.md"
elif [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md" ]; then
  HAT_FILE="${CLAUDE_PLUGIN_ROOT}/hats/${HAT}.md"
fi
```

**Problem:** This is a pure override pattern -- if `.ai-dlc/hats/builder.md` exists, it completely replaces `plugin/hats/builder.md`. The user must copy the entire canonical hat definition just to add a few lines.

### Desired Pattern (from intent description)

The new pattern should be **augmentation, not override**:
1. Plugin hat definitions are canonical (always loaded)
2. Project `.ai-dlc/hats/{hat}.md` with matching name **appends** instructions
3. Project `.ai-dlc/hats/{hat}.md` with a new name is a custom hat (no plugin equivalent)

This matches how workflows already work -- `plugin/workflows.yml` provides defaults, `.ai-dlc/workflows.yml` can override/add entries. But for hats, we want append, not replace.

### Context Injection Insertion Point

Both hooks build context output as sequential echo statements. The hat injection is near the end:
- `inject-context.sh`: lines 627-665 (hat instructions section)
- `subagent-context.sh`: lines 185-215 (hat instructions section)

The pass context should be injected AFTER the hat instructions, as an additional context block. This is where pass definition instructions would go.

### Current Workflow Loading Pattern

Workflows use a merge pattern in `inject-context.sh` (lines 65-119):
1. Parse plugin workflows first
2. Parse project workflows (override or add by name)
3. Build merged workflow list

This is the precedent for the pass definition loading pattern.

### Provider Loading Pattern

Config.sh `load_provider_instructions()` (lines 374-412) uses a three-tier merge:
1. Built-in default (`plugin/providers/{category}.md`)
2. Inline instructions from settings.yml
3. Project override from `.ai-dlc/providers/{type}.md`

Each tier appends; nothing is replaced. This is closest to the desired hat/pass augmentation pattern.

## Architecture Decision: Pass Definition Files

### Proposed Structure

Create `plugin/passes/*.md` files with YAML frontmatter + markdown instructions:

```markdown
---
name: "Design"
description: "Visual and interaction design pass"
available_workflows: [design, default]
default_workflow: design
---

# Design Pass Instructions

When working in the design pass, focus on...
{instructions that get injected into hat context}
```

### File Location Resolution

Same pattern as providers (three-tier merge):

1. **Plugin built-in**: `plugin/passes/{pass-name}.md` (canonical, always loaded)
2. **Project augmentation**: `.ai-dlc/passes/{pass-name}.md` (appends to matching built-in)
3. **Project custom**: `.ai-dlc/passes/{new-name}.md` (new pass not in plugin)

Built-in pass definitions to create:
- `plugin/passes/design.md` -- design pass instructions
- `plugin/passes/product.md` -- product pass instructions
- `plugin/passes/dev.md` -- dev pass instructions (implicit default)

### Frontmatter Schema

```yaml
name: string          # Display name
description: string   # Short description
available_workflows:  # Workflows allowed in this pass
  - design
  - default
default_workflow: string  # Fallback workflow for units in this pass
```

### Injection Point

The pass definition instructions should be injected into hat context during construction (SessionStart and SubagentPrompt hooks):

1. Read `active_pass` from intent.md frontmatter
2. Load the pass definition (plugin + project augmentation)
3. Inject the pass instructions as a new section after hat instructions

This means modifying `inject-context.sh` and `subagent-context.sh` to:
- After loading hat instructions, check for active_pass
- If active_pass is set, load the pass definition
- Inject pass instructions as a `### Active Pass Context` section

### Workflow Constraint Enforcement

Currently `workflow-guard.sh` and the elaborate skill don't consider pass constraints. The implementation should:

1. During elaboration: when assigning workflows to units, check the active pass's `available_workflows`
2. During execution: `workflow-guard.sh` should verify the unit's workflow is allowed for the active pass
3. Fallback: if a unit requests a workflow not in the pass's list, use `default_workflow`

### Settings Schema Change

Current `default_passes` in `settings.schema.json`:
```json
"default_passes": {
  "type": "array",
  "items": { "type": "string", "enum": ["design", "product", "dev"] }
}
```

Should change to:
```json
"default_passes": {
  "type": "array",
  "items": { "type": "string" },
  "default": []
}
```

Any string is valid as long as a matching pass definition file exists (plugin or project level). Validation happens at runtime, not at schema level.

## Architecture Decision: Hat Augmentation Pattern

### Current vs. Proposed

**Current:** Project file replaces plugin file.
```
.ai-dlc/hats/builder.md  →  replaces  →  plugin/hats/builder.md
```

**Proposed:** Plugin file is always loaded. Project file with same name appends.
```
plugin/hats/builder.md     →  always loaded (canonical)
.ai-dlc/hats/builder.md   →  appended after (augmentation)
.ai-dlc/hats/my-custom.md →  standalone custom hat (no plugin equivalent)
```

### Implementation in inject-context.sh

Replace the current if/elif with:

```bash
# Always load plugin hat first (canonical)
HAT_CONTENT=""
PLUGIN_HAT="${PLUGIN_ROOT}/hats/${HAT}.md"
PROJECT_HAT=".ai-dlc/hats/${HAT}.md"

if [ -f "$PLUGIN_HAT" ]; then
  HAT_CONTENT=$(cat "$PLUGIN_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  NAME=$(dlc_frontmatter_get "name" "$PLUGIN_HAT")
  DESC=$(dlc_frontmatter_get "description" "$PLUGIN_HAT")
fi

# Append project augmentation (if exists and plugin hat exists)
if [ -f "$PROJECT_HAT" ] && [ -f "$PLUGIN_HAT" ]; then
  PROJECT_INSTRUCTIONS=$(cat "$PROJECT_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  HAT_CONTENT="${HAT_CONTENT}

### Project Augmentation
${PROJECT_INSTRUCTIONS}"
elif [ -f "$PROJECT_HAT" ] && [ ! -f "$PLUGIN_HAT" ]; then
  # Custom hat (no plugin equivalent)
  HAT_CONTENT=$(cat "$PROJECT_HAT" | sed '1,/^---$/d' | sed '1,/^---$/d')
  NAME=$(dlc_frontmatter_get "name" "$PROJECT_HAT")
  DESC=$(dlc_frontmatter_get "description" "$PROJECT_HAT")
fi
```

### Same Change in subagent-context.sh

The same pattern must be applied in `subagent-context.sh` lines 186-214.

## Existing Implementations: Cross-Component Consistency Check

### Files That Must Be Updated

This intent touches all three components. Here is the full manifest of files requiring changes:

**Plugin (primary implementation):**
- `plugin/passes/design.md` -- NEW: design pass definition
- `plugin/passes/product.md` -- NEW: product pass definition
- `plugin/passes/dev.md` -- NEW: dev pass definition
- `plugin/hooks/inject-context.sh` -- MODIFY: hat augmentation + pass injection
- `plugin/hooks/subagent-context.sh` -- MODIFY: hat augmentation + pass injection
- `plugin/schemas/settings.schema.json` -- MODIFY: remove hardcoded pass enum
- `plugin/skills/elaborate/SKILL.md` -- MODIFY: Phase 5.95 wording, pass definition resolution
- `plugin/skills/execute/SKILL.md` -- MODIFY: pass-aware workflow constraint enforcement
- `plugin/lib/dag.sh` -- VERIFY: `find_ready_units_for_pass()` already pass-aware (likely no changes)
- `plugin/shared/src/types.ts` -- VERIFY: `passes` and `active_pass` fields already present (likely no changes)
- `plugin/workflows.yml` -- VERIFY: may need documentation comments about pass constraints

**Paper (methodology documentation):**
- `website/content/papers/ai-dlc-2026.md` -- MODIFY: Document pass loop, pass-backs, pass customization, fix frontmatter format mismatch

**Website (user-facing documentation):**
- `website/content/docs/concepts.md` -- MODIFY: Update pass section with definition files, customization, augmentation
- Other docs pages may need minor updates

### Paper-Implementation Mismatch Detail

The paper (line 717-728) shows pass frontmatter as structured objects:
```yaml
passes:
  - type: design
    status: completed
  - type: product
    status: active
```

But the actual implementation uses flat string arrays:
```yaml
passes: [design, product, dev]
active_pass: "design"
```

The flat format is simpler and sufficient. The paper should be updated to match the implementation, not the other way around. Pass status is derived from unit completion, not stored in the passes array.

## Deployment Architecture: CI/CD

**CI Platform:** GitHub Actions (`.github/workflows/`)

Workflows present:
- `bump-plugin-version.yml` -- auto-bumps plugin version
- `claude-code-review.yml` -- Claude-powered PR review
- `claude-conflict-resolver.yml` -- automated merge conflict resolution
- `claude.yml` -- Claude Code execution
- `deploy-website.yml` -- website deployment on push to main

No CI changes needed for this intent -- pass definition files are markdown consumed at runtime by Claude Code hooks, not built artifacts.

## Quality Gate Candidates

Detected from project tooling:

| Gate | Command | Source |
|------|---------|--------|
| lint | `bun run lint` | `package.json` `scripts.lint` (uses Biome) |
| build | `bun run build` | `package.json` `scripts.build` (builds all workspaces) |

**Note:** `bun.lock` present, so all npm commands should use `bun` instead.

No test runner detected -- `package.json` has no `scripts.test` entry. The plugin is primarily markdown/shell-based; tests would be shell script tests if any existed.

Recommended `quality_gates:` YAML block:
```yaml
quality_gates:
  - name: lint
    command: bun run lint
  - name: build
    command: bun run build
```

## Domain Model

### Entities

- **PassDefinition**: A typed pass with instructions and workflow constraints -- Fields: name, description, available_workflows, default_workflow, instructions (markdown body)
- **Intent**: The overall feature being built -- Fields: workflow, git config, passes (ordered array), active_pass (current), status, units
- **Unit**: A discrete work item within an intent -- Fields: status, depends_on, branch, discipline, pass (which pass it belongs to), workflow
- **Hat**: A role in the construction workflow -- Fields: name, description, instructions (markdown body)
- **Workflow**: A named sequence of hats -- Fields: name, description, hats (ordered array)
- **Settings**: Project-level configuration -- Fields: default_passes, providers, quality_gates, etc.

### Relationships

- Intent has many Units
- Intent has an ordered sequence of Passes (via `passes` array)
- Intent has one active Pass (via `active_pass`)
- Unit belongs to one Pass (via `pass` field)
- PassDefinition constrains available Workflows (via `available_workflows`)
- Workflow defines a sequence of Hats (via `hats` array)
- Hat receives PassDefinition instructions during construction (via hook injection)
- Settings provides default Passes for new Intents (via `default_passes`)
- ProjectPassDefinition augments a PluginPassDefinition (same name = append)
- ProjectHat augments a PluginHat (same name = append, new name = custom)

### Data Sources

- **Plugin filesystem** (markdown files):
  - Available: hat definitions, skill definitions, workflow definitions, hook scripts, settings schema
  - Missing: pass definition files (to be created)
  - Real sample: `plugin/hats/builder.md` with frontmatter + markdown body

- **Project filesystem** (.ai-dlc/ directory):
  - Available: intent.md, unit-*.md, settings.yml, custom workflows, custom hats
  - Missing: custom pass definitions (`.ai-dlc/passes/`)
  - Real sample: `.ai-dlc/settings.yml` with `default_passes: [design, dev]`

- **TypeScript parser** (plugin/shared/src/):
  - Available: IntentFrontmatter with `passes?` and `active_pass?`, UnitFrontmatter with `pass?`
  - Missing: PassDefinition type (new), no changes needed to existing types

### Data Gaps

- **Pass definition content**: Need to author the actual instructions for design, product, and dev passes. These should describe what hats should focus on during each pass type. Research into design methodology, product management practices, and development best practices needed to write high-quality instructions.
- **Workflow constraint validation**: Need to determine what happens when a unit's workflow conflicts with the pass's allowed workflows. The intent description says "fall back to default_workflow" which is straightforward.
- **Pass-back mechanism detail**: The intent describes backward pass transitions but the implementation details are sparse. Need to define: who triggers a pass-back, how is `active_pass` updated, are existing units in the new active pass re-elaborated or just new units added?

