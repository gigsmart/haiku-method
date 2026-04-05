---
intent: methodology-evolution
created: 2026-03-05
status: active
---

# Discovery Log: Methodology Evolution

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.


## Paper Analysis: ai-dlc-2026.md

**Discovered:** 2026-03-05

### Current Phase Structure
1. **Inception** (Mob Elaboration) — Intent → Units → Completion Criteria → Bolt planning
2. **Construction** (Bolts) — Execute Units via HITL/OHOTL/AHOTL modes, iterate until criteria met
3. **Operations** — Deploy, monitor, autonomous response within runbook boundaries

### Terminology That Must Evolve
| Current (Software) | Needed (Domain-Agnostic) |
|---|---|
| Builder (hat) | Executor / Implementer |
| Construction (phase) | Execution |
| Code, codebase | Artifacts, Deliverables |
| Tests, lint, typecheck | Verification gates, Quality checks |
| Deployment | Release, Operationalization |
| Backpressure | Quality enforcement |
| Commit, branch, PR | Checkpoint, version, review |

### What's Missing
- NO Reflection phase — no structured learning loop
- NO post-deployment review ritual
- NO outcome assessment ("did the Intent achieve its goal?")
- NO organizational learning capture
- Operations outputs are undefined (Inception and Construction have clear artifacts)
- Operations section ends at paper line 1052 with no closure ritual

### What's Already Domain-Agnostic
- The core flow (Intent → Units → Bolts → Checkpoints) is conceptually universal
- Operating modes (HITL/OHOTL/AHOTL) apply to any human-AI collaboration
- The "collapse" of traditional phases is a universal principle
- Completion criteria as a concept work for any domain

### Key Paper Sections for Evolution
- Phase definitions: lines 824-1000
- Operating modes: lines 156-246
- Lifecycle flow/diagram: lines 1056-1088
- Glossary: lines 1390-1410
- Operations: lines 1002-1052


## Plugin Architecture: Core Structure

**Discovered:** 2026-03-05

### Stats
- 14 hats, 17 skills, 4 workflows
- Plugin version: 1.20.6
- Architecture: Hook-based events + han keep state + git worktrees

### Git Dependency Map (PERVASIVE)
- **Worktree isolation**: Intent and unit worktrees for parallel work
- **Branch state**: `han keep` stores iteration.json, scratchpad, blockers on git branches
- **Branch discovery**: `dag.sh` scans `ai-dlc/*` branches for intents
- **Remote sync**: Push/pull/upstream tracking in construct skill
- **Merge strategies**: Unit branches merge to default or intent branch
- **PR creation**: `gh pr create` in advance skill
- **VCS abstraction exists** in config.sh (detects jj vs git) but ONLY git is implemented

### Lifecycle (Currently)
1. `/elaborate` → Write intent.md + unit-*.md to intent worktree
2. `/construct` → DAG-driven loop: planner → builder → reviewer per unit
3. Integrator validates all units → mark intent complete → PR/MR
4. **STOP** — no operation, monitoring, or reflection

### State Storage
- `iteration.json` (han keep on intent branch): hat, status, workflow, unitStates
- `scratchpad.md` (han keep on unit branch): progress notes
- `blockers.md` (han keep on unit branch): blocker context
- `current-plan.md` (han keep on unit branch): planner output
- Filesystem: intent.md + unit-*.md frontmatter (committed to git)

### Quality Gates (Backpressure)
- Autonomous: tests, typecheck, lint, build, security scan
- Enforced via han-plugin.yml Stop hooks
- Builder hat must run checks after every change
- Reviewer validates criteria, not code quality (gates already passed)

### Hats: Domain Analysis
- **Domain-agnostic (11/14)**: planner, builder, reviewer, integrator, red-team, blue-team, observer, hypothesizer, experimenter, analyst, test-writer
- **Software-specific (3/14)**: designer (UI/UX), implementer, refactorer
- Builder hat has discipline-awareness (frontend/backend/docs → different agent types)

### Workflows
- `default`: planner → builder → reviewer
- `adversarial`: planner → builder → red-team → blue-team → reviewer
- `design`: planner → designer → reviewer
- `hypothesis`: observer → hypothesizer → experimenter → analyst


## Config & Settings: Infrastructure Analysis

**Discovered:** 2026-03-05

### Settings Schema
- Location: `plugin/schemas/settings.schema.json`
- Sections: VCS strategy (git/jj), Providers, Mockup format
- Config precedence: intent frontmatter > repo settings > built-in defaults

### Provider System (4 categories)
- **Ticketing**: Jira, Linear, GitHub Issues, GitLab Issues
- **Spec**: Notion, Confluence, Google Docs
- **Design**: Figma
- **Comms**: Slack, Teams, Discord
- Each has a JSON schema, instruction file, and 3-tier loading (built-in → inline → project override)

### State Persistence (han keep)
- Branch-scoped: intent state on intent branch, unit state on unit branch
- Keys: iteration.json, scratchpad.md, blockers.md, current-plan.md, next-prompt.md
- Cross-branch access via --branch flag
- **Entirely git-dependent** — no fallback for non-git environments

### DAG System (dag.sh, 704 lines)
- Declarative dependencies in unit frontmatter `depends_on:`
- Functions: find_ready_units, find_blocked_units, are_deps_completed
- Fast YAML extraction (no subprocess overhead)
- Status flow: pending → in_progress → completed (or blocked)

### Hook System (4 hooks)
- SessionStart: inject-context.sh (652 lines) — loads state, displays context
- SubagentPrompt: subagent-context.sh (300 lines) — scopes context for subagents
- PreToolUse: redirect-plan-mode.sh — intercepts /plan → /elaborate
- Stop: enforce-iteration.sh — checks if work remains, prompts /construct

### Key Infrastructure Files
| File | Lines | Purpose |
|---|---|---|
| plugin/lib/config.sh | 559 | Config loading, VCS detection, provider system |
| plugin/lib/dag.sh | 704 | DAG resolution, unit status tracking |
| plugin/hooks/inject-context.sh | 652 | SessionStart context injection |
| plugin/hooks/subagent-context.sh | 300 | Subagent context scoping |
| plugin/skills/construct/SKILL.md | 1117 | Core construction loop |
| plugin/skills/elaborate/SKILL.md | ~900 | Mob elaboration workflow |
| plugin/skills/execute/subskills/advance/SKILL.md | ~150 | Hat progression + merge |

### What Must Change for Git-Optional
1. han keep needs a file-based fallback (folder mode)
2. Worktree isolation needs folder-based alternative (subdirectories?)
3. Branch discovery (dag.sh) needs filesystem-only mode
4. Remote sync (push/pull) must be optional
5. PR/MR creation must be optional
6. Config detection must work without .git directory

