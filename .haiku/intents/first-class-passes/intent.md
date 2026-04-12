---
title: First-Class Passes
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
started_at: 2026-03-31T10:24:05.000Z
completed_at: 2026-04-01T13:21:44.000Z
created_at: '2026-04-12T23:20:53.029Z'
---


# First-Class Passes

## Problem

Passes currently only control scheduling — which units execute when and when to transition between passes. They do not influence how hats behave during construction. A builder in a design pass produces the same production-code-oriented output as a builder in a dev pass. There is no mechanism for projects to define custom passes, augment built-in passes with project-specific instructions, or constrain which workflows are available per pass. Additionally, the hat resolution pattern allows project hats to fully override plugin hats, which can cause unpredictable behavior.

## Solution

Make passes a first-class concept that shapes construction behavior:

1. **Pass definition files** (`plugin/passes/*.md`) — frontmatter-enabled markdown files declaring available workflows, default workflow, and instructions that get injected into hat context during construction
2. **Augmentation pattern** for both passes and hats — plugin definitions are canonical (never overridden); project definitions with matching names append instructions; new names are custom additions
3. **Pass context injection** — hooks read active_pass from intent frontmatter, load the pass definition, and inject instructions into subagent context
4. **Workflow constraints** — only workflows listed in the active pass's definition are available for units in that pass
5. **User-confirmed passes** — elaboration presents configured passes as a suggestion, user confirms or overrides per intent
6. **Paper and website sync** — documentation accurately describes the pass loop, pass-backs, and customization

## Domain Model

### Entities
- **PassDefinition**: Typed pass with instructions and workflow constraints — Fields: name, description, available_workflows, default_workflow, instructions (markdown body)
- **Intent**: Overall feature being built — Fields: workflow, git config, passes (ordered array), active_pass (current), status
- **Unit**: Discrete work item — Fields: status, depends_on, discipline, pass (which pass it belongs to), workflow
- **Hat**: Construction role — Fields: name, description, instructions (markdown body)
- **Workflow**: Named sequence of hats — Fields: name, description, hats (ordered array)

### Relationships
- PassDefinition constrains available Workflows (via `available_workflows`)
- Hat receives PassDefinition instructions during construction (via hook injection)
- ProjectPassDefinition augments PluginPassDefinition (same name = append)
- ProjectHat augments PluginHat (same name = append, new name = custom)

### Data Sources
- Plugin filesystem: `plugin/passes/*.md`, `plugin/hats/*.md`, `plugin/workflows.yml`
- Project filesystem: `.ai-dlc/passes/*.md`, `.ai-dlc/hats/*.md`, `.ai-dlc/workflows.yml`
- Settings: `.ai-dlc/settings.yml` `default_passes` field

## Success Criteria
- [x] Built-in pass definition files exist at `plugin/passes/{design,product,dev}.md` with frontmatter (name, description, available_workflows, default_workflow) and markdown instructions
- [x] Pass instructions are injected into hat subagent context during construction via `inject-context.sh` and `subagent-context.sh`
- [x] Workflow selection is constrained to the active pass's `available_workflows` — units requesting unavailable workflows fall back to the pass's `default_workflow`
- [x] Hat resolution uses augmentation pattern: plugin hat always loads, project `.ai-dlc/hats/{name}.md` appends instructions (never replaces)
- [x] Pass resolution uses same augmentation pattern: plugin pass always loads, project `.ai-dlc/passes/{name}.md` appends instructions (never replaces)
- [x] Project-defined passes with new names (not matching plugin passes) are recognized as custom passes
- [x] Settings schema `default_passes` accepts any string (no hardcoded enum), validated against available pass definition files
- [x] Phase 5.95 of elaborate skill presents configured passes as suggestion, user confirms or overrides per intent
- [x] Execute skill pass transition logic notifies user and stops for re-elaboration when a pass completes
- [x] Paper section "Iteration Through Passes" accurately describes the pass loop, pass definitions, pass-backs, and customization
- [x] Website docs and homepage reflect the pass concept accurately
- [x] Single-pass (dev only) remains the default — multipass is opt-in via `default_passes` setting
- [x] All existing quality gates pass (bun run lint, bun run build)

## Context
- Provider loading in config.sh uses a three-tier merge pattern (plugin + settings inline + project override) that serves as the precedent for pass/hat augmentation
- The DAG library (dag.sh) is already pass-aware with `find_ready_units_for_pass()` and `parse_unit_pass()`
- The paper currently shows structured pass objects with per-pass status, but the implementation uses flat string arrays — the paper should be updated to match implementation
- Execute skill already has pass transition logic at Step 5c — it needs to work with the new pass definitions
- The design workflow (`planner → designer → reviewer`) naturally maps to the design pass's available_workflows
