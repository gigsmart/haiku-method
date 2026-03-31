---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities

- **Existing Feature**: The pre-existing codebase feature being adopted — identified by user description, code paths, and git history
- **Adopted Intent**: An intent.md with `status: completed` — enables /operate and /followup
- **Adopted Unit**: A unit-NN-slug.md with `status: completed` — logical piece of the adopted feature
- **Discovery Log**: Domain knowledge captured during reverse-engineering (discovery.md)
- **Success Criteria**: Verifiable criteria reconstructed from existing tests and CI
- **Operational Plan**: Collection of operation spec files in `operations/` enabling /operate
- **SKILL.md**: The skill definition file for /adopt itself

### Relationships

- Existing Feature maps to one Adopted Intent
- Adopted Intent has many Adopted Units
- Adopted Intent has one Discovery Log
- Adopted Intent has many Success Criteria (intent-level)
- Each Adopted Unit has many Success Criteria (unit-level)
- Adopted Intent has one Operational Plan
- Adopted Intent is a valid `iterates_on` target for /followup

### Data Sources

- **Codebase (filesystem)**: Source code, tests, CI config, deployment manifests
  - Available: Full file access, grep/glob search, AST-level reading
  - Missing: No semantic understanding of test intent — requires agent interpretation
- **Git history**: Commits, PRs, branches
  - Available: `git log`, `git diff`, `gh pr list`, commit messages
  - Missing: Clean feature boundaries — real history is messy, requires pragmatic restructuring
- **Plugin filesystem**: SKILL.md templates, library functions, workflows.yml
  - Available: Complete artifact format specs, all shared library functions
  - Missing: N/A — fully documented
- **User input**: Feature description, code paths, context
  - Available: Through AskUserQuestion interaction
  - Missing: User may not know all touchpoints — agent must discover them

### Data Gaps

- **Test-to-criteria mapping**: Tests exist but mapping them to high-level success criteria requires semantic interpretation, not just listing test names. Mitigation: Agent analyzes test descriptions/names and groups by behavior.
- **Messy git history**: Real development doesn't follow clean unit boundaries. Mitigation: Pragmatic blend approach — analyze actual history but restructure into clean AI-DLC units.
- **Inferred operations**: Unlike /elaborate where user defines operations, /adopt must infer them from deployment surface, CI config, and monitoring setup. Mitigation: Analyze CI workflows, Dockerfiles, k8s manifests, monitoring config to propose operations.

## Key Findings

- `/adopt` is a new skill type — no existing skill reverses the lifecycle. It's the first "import" pathway into AI-DLC.
- All 28 existing skills follow the same structure: single SKILL.md with YAML frontmatter. `/adopt` follows this pattern.
- The /operate skill expects an `operations/` directory with individual `.md` files per operation. /adopt must generate these.
- The /followup skill has NO status validation — any adopted intent with `status: completed` is a valid iteration target.
- Shared libraries (config.sh, parse.sh, state.sh, dag.sh) provide all needed utility functions — no new libraries required.
- The worktree model is designed for construction isolation. Since /adopt writes artifacts for already-completed work, it can write directly to a branch without construction worktrees.
- Intent status `completed` is the correct status for adopted features — it signals construction is done and enables both /operate and /followup.

## Open Questions

- Should /adopt support adopting features from external repositories (not the current one)? The current design assumes the feature exists in the working repository.
- Should /adopt generate a reflection artifact (like /reflect does after construction)? This could capture learnings about the adopted feature.
- How should /adopt handle features that span the entire codebase (e.g., "the authentication system") vs. features with clear boundaries? Should it enforce a scope limit?
- Should the operational plan generation be interactive (agent proposes, user confirms) or fully autonomous?

## Mockups Generated

No UI mockups needed — /adopt is a CLI skill with terminal-based interaction only (AskUserQuestion for user input, text output for results).
