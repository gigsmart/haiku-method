---
name: unit-01-pass-definitions
status: completed
depends_on: []
bolt: 0
hat: ''
started_at: 2026-03-31T19:19:10.000Z
completed_at: 2026-03-31T19:19:10.000Z
---


# unit-01-pass-definitions

## Description

Create the built-in pass definition files and the shared resolution library that loads, merges, and serves pass definitions to the rest of the system. This is the foundational unit — all other units depend on the pass resolution logic created here.

## Domain Entities

- **PassDefinition**: The core entity. Three built-in instances (design, product, dev) plus support for project-defined custom passes.

## Data Sources

- Plugin filesystem: `plugin/passes/{design,product,dev}.md` (to be created)
- Project filesystem: `.ai-dlc/passes/*.md` (augmentation or custom passes)
- Existing workflows: `plugin/workflows.yml` (referenced by `available_workflows` in pass frontmatter)

## Technical Specification

### 1. Create `plugin/passes/` directory with three built-in pass definitions

Each file uses frontmatter-enabled markdown:

**`plugin/passes/design.md`**
- Frontmatter: `name: design`, `description: Visual and interaction design`, `available_workflows: [design]`, `default_workflow: design`
- Instructions: orient hats toward design artifacts (mockups, prototypes, design tokens, component specs). "Done" means designs are reviewed and ready to inform subsequent passes. Not production code.

**`plugin/passes/product.md`**
- Frontmatter: `name: product`, `description: Behavioral specification and gap analysis`, `available_workflows: [default, bdd]`, `default_workflow: default`
- Instructions: orient hats toward behavioral specs, acceptance criteria, edge case analysis. Use completed design artifacts as input context. "Done" means specs are detailed enough for a dev pass to implement against.

**`plugin/passes/dev.md`**
- Frontmatter: `name: dev`, `description: Working implementation`, `available_workflows: [default, tdd, adversarial, bdd]`, `default_workflow: default`
- Instructions: orient hats toward tested, deployable code. Use design artifacts and behavioral specs from prior passes as input. All completion criteria must be programmatically verifiable.

### 2. Create pass resolution functions in `plugin/lib/pass.sh`

Functions to implement:

- **`resolve_pass_definition <pass_name>`**: Returns the path to the pass definition file. Resolution: check `plugin/passes/{name}.md` for built-in, check `.ai-dlc/passes/{name}.md` for project. If both exist (same name), the plugin file is canonical.
- **`load_pass_instructions <pass_name>`**: Loads the full instructions (markdown body after frontmatter) from the pass definition. If a project file with the same name exists, appends its body as a "## Project Augmentation" section.
- **`load_pass_metadata <pass_name>`**: Returns frontmatter fields (available_workflows, default_workflow) as shell variables or JSON.
- **`list_available_passes`**: Lists all available pass names (union of plugin and project passes).
- **`validate_pass_exists <pass_name>`**: Returns 0 if a pass definition file exists (in either plugin or project), 1 otherwise.
- **`constrain_workflow <requested_workflow> <pass_name>`**: Returns the requested workflow if it's in the pass's `available_workflows`, otherwise returns the `default_workflow`.

### 3. Augmentation pattern

When loading a pass definition:
1. Always load the plugin definition first (canonical)
2. If a project `.ai-dlc/passes/{name}.md` exists with the same name, read its markdown body and append it to the plugin instructions under a `## Project Augmentation` heading
3. If a project pass has a name that doesn't match any plugin pass, it's a standalone custom pass — load it directly

This mirrors the provider loading three-tier merge pattern in `config.sh`.

## Success Criteria

- [x] `plugin/passes/design.md` exists with correct frontmatter and meaningful instructions
- [x] `plugin/passes/product.md` exists with correct frontmatter and meaningful instructions
- [x] `plugin/passes/dev.md` exists with correct frontmatter and meaningful instructions
- [x] `resolve_pass_definition` returns plugin path for built-in passes, project path for custom passes
- [x] `load_pass_instructions` returns plugin instructions with project augmentation appended when a project file with the same name exists
- [x] `load_pass_instructions` returns only project instructions for custom (non-built-in) passes
- [x] `constrain_workflow` returns the requested workflow when it's in `available_workflows`, otherwise returns `default_workflow`
- [x] `validate_pass_exists` returns 0 for built-in passes (design, product, dev) and any project-defined passes

## Risks

- **Pass instructions too vague**: If pass definitions are too generic, hats won't meaningfully change behavior. Mitigation: write specific, actionable instructions that reference concrete artifact types.
- **Shell parsing fragility**: Frontmatter parsing in bash can be brittle. Mitigation: reuse existing `_yaml_get_simple` and `dlc_frontmatter_get` patterns from dag.sh and config.sh.

## Boundaries

This unit creates the pass files and resolution library ONLY. It does NOT:
- Inject pass context into hooks (unit-03)
- Change hat resolution logic (unit-02)
- Update elaborate or execute skills (unit-04, unit-05)
- Modify the settings schema (unit-06)
- Update documentation (unit-07, unit-08)

## Notes

- Follow the existing coding style in `plugin/lib/config.sh` and `plugin/lib/dag.sh` for shell functions
- Frontmatter parsing should use `dlc_frontmatter_get` helper already available in the codebase
- The `available_workflows` field should be parsed as a YAML array, matching how `depends_on` is parsed in dag.sh
