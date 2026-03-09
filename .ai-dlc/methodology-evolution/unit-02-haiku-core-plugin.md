---
status: completed
depends_on: [unit-01-haiku-foundation]
branch: ai-dlc/methodology-evolution/02-haiku-core-plugin
discipline: backend
workflow: ""
ticket: ""
---

# unit-02: HAIKU Core Plugin

## Description
Build the HAIKU core plugin — a universal Claude Code plugin that implements the 4-phase lifecycle (Elaboration, Execution, Operation, Reflection) in a domain-agnostic way. This plugin works in both git repos and plain folders (auto-detect). It provides configurable quality gates, domain-agnostic hats, and flexible workflows. This is the largest technical unit.

## Discipline
backend

## Domain Entities
- HAIKU (framework), Phase, Intent, Unit, Bolt, Hat, Workflow, Quality Gate, Storage Backend

## Data Sources
- AI-DLC plugin source code (`plugin/` in the AI-DLC repo) — reference architecture for skills, hats, hooks, DAG system, config loading
- Discovery log — detailed analysis of current plugin architecture at `.ai-dlc/methodology-evolution/discovery.md`
- Claude Code plugin development docs — for plugin structure, hooks, skills format

## Technical Specification

### Plugin Structure (in HAIKU repo at `plugin/`)
```
plugin/
  .claude-plugin/
    plugin.json          # Plugin metadata: name "haiku-method"
    hooks.json           # Hook registrations
  hats/                  # Domain-agnostic hat definitions
    planner.md           # Creates tactical plans
    executor.md          # Executes work (replaces "builder")
    reviewer.md          # Validates completion
    integrator.md        # Cross-unit validation
    operator.md          # NEW: manages operational tasks
    reflector.md         # NEW: analyzes outcomes, captures learnings
  hooks/
    inject-context.sh    # SessionStart: load state, display context
    subagent-context.sh  # SubagentPrompt: scope context for subagents
    enforce-iteration.sh # Stop: check if work remains
  skills/
    elaborate/SKILL.md   # Mob elaboration (adapted from AI-DLC)
    execute/SKILL.md     # Autonomous execution loop (adapted from construct)
    operate/SKILL.md     # Operation phase (NEW — see unit-03)
    reflect/SKILL.md     # Reflection phase (NEW — see unit-04)
    advance/SKILL.md     # Move to next hat
    resume/SKILL.md      # Resume interrupted work
    setup/SKILL.md       # Project configuration
  lib/
    config.sh            # Config loading with storage abstraction
    dag.sh               # DAG resolution (filesystem-only compatible)
    storage.sh           # NEW: storage abstraction layer
  schemas/
    settings.schema.json # Settings validation
    providers/           # Provider schemas (reuse from AI-DLC)
  workflows.yml          # Default workflows
```

### Storage Abstraction Layer (`lib/storage.sh`)
The core innovation for universal compatibility:

**Auto-detection:**
```bash
detect_storage_mode() {
  if git rev-parse --git-dir >/dev/null 2>&1; then
    echo "git"
  else
    echo "folder"
  fi
}
```

**Git mode** (when in a git repo):
- Uses worktrees for isolation (existing AI-DLC pattern)
- State persisted via han keep on branches
- Branch-based intent/unit isolation

**Folder mode** (when NOT in a git repo):
- State persists in `.haiku/{intent-slug}/state/` directory
  - `iteration.json` — current phase, hat, workflow, unit states
  - `scratchpad.md`, `blockers.md`, `current-plan.md` — unit-level state
- Intent isolation via subdirectories (no worktrees needed)
- No git commands executed — pure filesystem operations
- DAG resolution reads unit frontmatter from `.haiku/{intent-slug}/unit-*.md`

**Unified API:**
```bash
# These functions work in both modes:
storage_save_state "iteration.json" "$STATE"
storage_load_state "iteration.json"
storage_save_unit_state "unit-01" "scratchpad.md" "$CONTENT"
storage_load_unit_state "unit-01" "scratchpad.md"
storage_list_intents
storage_get_intent_dir "$SLUG"
```

### Configurable Quality Gates
In `.haiku/settings.yml` (or `.ai-dlc/settings.yml` for backward compat):
```yaml
gates:
  - name: "tests"
    command: "npm test"
    event: Stop
    enabled: true
  - name: "peer-review"
    type: manual
    description: "Stakeholder reviews and approves the deliverable"
    enabled: true
  - name: "metrics-check"
    command: "./scripts/check-metrics.sh"
    event: Stop
    enabled: false
```

Gate types:
- `command` — automated, runs a shell command (like current backpressure)
- `manual` — requires human confirmation (for non-automatable checks)
- `criteria` — checks against defined success criteria (reviewer validates)

Default gates: none (profiles add their own). Software profile (AI-DLC) adds tests/lint/types.

### Domain-Agnostic Hats
- `planner.md` — Creates tactical execution plans (identical concept to AI-DLC)
- `executor.md` — Executes the plan (replaces "builder" — domain-agnostic language)
- `reviewer.md` — Validates completion criteria
- `integrator.md` — Cross-unit validation
- `operator.md` — NEW: Manages operational tasks defined during execution
- `reflector.md` — NEW: Analyzes outcomes, captures learnings

Hats are behavioral templates, not rigid roles. The executor hat adapts based on discipline (software executor writes code, marketing executor produces campaigns).

### Workflows
```yaml
default:
  description: Standard workflow
  hats: [planner, executor, reviewer]

operational:
  description: Workflow that includes operational setup
  hats: [planner, executor, operator, reviewer]

reflective:
  description: Full lifecycle with reflection
  hats: [planner, executor, operator, reflector, reviewer]
```

### Settings Schema
Extend settings to support domain-agnostic configuration:
```yaml
# .haiku/settings.yml
gates: [...]           # Configurable quality gates
hats_dir: .haiku/hats  # Custom hat overrides
workflows_file: .haiku/workflows.yml  # Custom workflows
storage_dir: .haiku    # Where state is stored (default: .haiku)
providers:             # Same provider system as AI-DLC
  ticketing: { ... }
  spec: { ... }
  design: { ... }
  comms: { ... }
```

### DAG System
Port `dag.sh` from AI-DLC with one key change: all functions must work from filesystem alone (no git branch queries in folder mode). The storage abstraction layer handles where files live; DAG reads unit frontmatter regardless of storage mode.

### Elaboration Skill
Port the elaborate skill from AI-DLC with these changes:
- Use "Execution" not "Construction" in all prompts and output
- Reference HAIKU methodology, not AI-DLC
- Support folder mode (no worktree creation when not in git)
- Quality gates configured from settings, not hardcoded

### Execution Skill (replaces /construct)
Port the construct skill with:
- Rename to `/execute`
- Use `executor` hat instead of `builder`
- Read quality gates from settings
- Support folder mode for state persistence
- During execution, produce `operations.md` alongside deliverables (guidance for the Operation phase)

## Success Criteria
- [ ] HAIKU core plugin installs and runs in Claude Code
- [ ] `detect_storage_mode()` correctly identifies git vs folder environments
- [ ] Folder mode: all state persists in `.haiku/` directories with no git commands
- [ ] Git mode: works identically to current AI-DLC patterns (worktrees, branches, han keep)
- [ ] Quality gates are read from `.haiku/settings.yml`, not hardcoded
- [ ] `/elaborate` skill works in both git and folder modes
- [ ] `/execute` skill runs the autonomous loop with configurable gates
- [ ] DAG resolution works from filesystem alone
- [ ] Hats are domain-agnostic (executor, not builder)
- [ ] All 3 default workflows defined and functional

## Risks
- **Storage abstraction complexity**: Two storage modes means double the testing surface. Mitigation: unified API with clear mode-specific implementations behind it.
- **AI-DLC divergence**: HAIKU core may diverge from AI-DLC patterns. Mitigation: unit-06 (AI-DLC Integration) handles reconciliation.
- **han keep dependency**: In folder mode, han keep may not work. Mitigation: storage.sh provides its own file-based persistence that doesn't depend on han keep.

## Boundaries
This unit builds the core plugin infrastructure. It does NOT implement the Operation phase (unit-03), Reflection phase (unit-04), or AI-DLC integration (unit-06). The `/operate` and `/reflect` skills are stubs that unit-03 and unit-04 flesh out.

## Notes
- Reference the AI-DLC plugin heavily but don't copy-paste — adapt for domain-agnosticism
- The executor hat should be usable for ANY domain, not just code
- Test in both a git repo AND a plain folder to verify storage abstraction
- The plugin name in plugin.json should be "haiku-method"
