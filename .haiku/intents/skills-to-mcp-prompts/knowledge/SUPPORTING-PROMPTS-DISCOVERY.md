---
title: "Supporting + Reporting + Niche Prompts — Discovery"
unit: unit-03-supporting-prompts
stage: inception
---

# Supporting + Reporting + Niche Prompts — Discovery

## 1. Prompt Inventory

All 16 prompts with complexity, state requirements, and side effects derived from reading the existing skill files.

| # | Prompt | Category | Complexity | State Needed | Side Effects | Elicitation Needed |
|---|--------|----------|------------|-------------|--------------|-------------------|
| 1 | `haiku:composite` | Supporting | Complex | Studios list, intent state | Creates intent workspace, writes intent.md with composite frontmatter | Yes — studio multi-select (2+ required), stage multi-select per studio, sync point definition |
| 2 | `haiku:autopilot` | Supporting | Complex | Git status, active intents, env vars | Sets mode=continuous, chains to new then run, creates PR | Yes — scope confirmation if >5 units, delivery confirmation |
| 3 | `haiku:setup` | Supporting | Complex | Filesystem (.haiku/settings.yml), MCP tool discovery, git remotes, CI detection | Writes .haiku/settings.yml, optional .haiku/providers/*.md, git commits | Yes — multi-phase: provider confirmation, visual review toggle, workflow tuning, VCS strategy, studio selection, announcements |
| 4 | `haiku:migrate` | Supporting | Medium | .ai-dlc/ legacy dirs, intent files | Runs `haiku migrate` binary, creates .haiku/intents/ dirs, symlinks, backup, git commits | Yes — intent selection, gap-stage planning confirmation |
| 5 | `haiku:scaffold` | Supporting | Medium | Studio/stage existence validation | Creates directory structure and template files under .haiku/ | Yes — artifact type selection if no args, overwrite confirmation |
| 6 | `haiku:operate` | Supporting | Complex | Intent operations/*.md files, state/operation-status.json, stack config | Executes scripts, writes status JSON, generates deploy manifests, removes manifests (teardown) | Yes — teardown confirmation |
| 7 | `haiku:triggers` | Supporting | Complex | Providers config, trigger-poll.json, active intent await gates, studio trigger declarations | Updates poll timestamp, may create intents (auto triggers), advances await gates | Yes — intent creation confirmation, gate advancement confirmation (interactive mode) |
| 8 | `haiku:dashboard` | Reporting | Simple | .haiku/ directory (all intents, units, DAGs) | None (generates static HTML to .haiku/dashboard/ or custom dir) | No |
| 9 | `haiku:backlog` | Reporting | Simple | .haiku/backlog/*.md files | add: creates files; promote: deletes file + chains to elaborate; review: may delete files | No (subcommand-driven) |
| 10 | `haiku:capacity` | Reporting | Medium | Intent frontmatter timestamps, stage state.json, unit metadata, git log | None (read-only analysis) | No |
| 11 | `haiku:release-notes` | Reporting | Simple | CHANGELOG.md at repo root | None (read-only display) | No |
| 12 | `haiku:adopt` | Niche | Complex | Git repo, codebase files, CI config, test files | Creates intent artifacts with status=completed, operations, discovery.md; creates branch; opens PR | Yes — feature description, code paths, git refs, intent/unit review, criteria review, operations review, next steps |
| 13 | `haiku:quick` | Niche | Complex | Git status, active intent check, stage/hat definitions | Creates temporary .haiku/quick/ state, spawns subagent hat loop, creates PR, cleans up | Yes — scope confirmation if task is complex |
| 14 | `haiku:seed` | Niche | Simple | .haiku/seeds/*.md files | plant: creates seed file + git commit; check: updates seed status + git commit | Yes — plant: idea + trigger; check: harvest/surface/prune |
| 15 | `haiku:ideate` | Niche | Medium | Codebase files, git log (churn analysis) | None (read-only analysis, presents ideas) | No (but offers next-step choices) |
| 16 | `haiku:pressure-testing` | Niche | Complex | Hat definitions from studios, existing pressure test artifacts | Creates .haiku/pressure-tests/ artifacts, may edit hat definition files | Yes — hat selection, scenario approval, anti-rationalization row approval |

## 2. Grouping by Category

### Supporting (6 prompts)

These extend the core workflow with alternative modes and project configuration.

| Prompt | Purpose | Core Dependency |
|--------|---------|----------------|
| `composite` | Multi-studio intents with sync points | Chains to `new` + `run` |
| `autopilot` | Full autonomous lifecycle | Chains to `new` + `run` |
| `setup` | Project configuration wizard | Independent (writes settings) |
| `migrate` | Legacy .ai-dlc format conversion | Calls `haiku migrate` binary |
| `scaffold` | Create custom studio/stage/hat artifacts | Independent (writes templates) |
| `operate` | Post-delivery operational management | Reads intent operations/ dir |
| `triggers` | Poll external providers for events | Reads providers config |

### Reporting (4 prompts)

Read-only or near-read-only prompts that display state.

| Prompt | Purpose | Data Source |
|--------|---------|-------------|
| `dashboard` | Static HTML generation from .haiku/ data | All intent/unit artifacts |
| `backlog` | Idea parking lot (CRUD operations) | .haiku/backlog/*.md |
| `capacity` | Historical throughput analysis | Intent timestamps, git log |
| `release-notes` | Display changelog | CHANGELOG.md |

### Niche (5 prompts)

Specialized workflows for specific use cases.

| Prompt | Purpose | When Used |
|--------|---------|-----------|
| `adopt` | Reverse-engineer existing feature into artifacts | Retrofitting existing code |
| `quick` | Streamlined path for trivial tasks | Typos, config changes, renames |
| `seed` | Forward-looking idea garden | Capturing future ideas with triggers |
| `ideate` | Adversarial improvement analysis | Proactive codebase analysis |
| `pressure-testing` | Hat definition evaluation (EDD) | Testing hat robustness |

## 3. Common Patterns Across Prompts

### Pattern A: State Read + Instruction Return (8 prompts)

The simplest pattern. The prompt handler reads filesystem state and returns instructions as PromptMessage[].

**Prompts:** dashboard, backlog (list), capacity, release-notes, ideate, seed (list), backlog (review), operate (list/status)

**Implementation:** Read files from `.haiku/`, format as context messages. No elicitation needed for the read path. Return multi-message conversation with state context + instructions.

### Pattern B: Elicitation + Side Effect (5 prompts)

The handler needs structured user input before it can construct the prompt messages.

**Prompts:** composite, setup, scaffold, seed (plant), adopt

**Implementation:** Use `elicitation/create` for structured questions (studio selection, mode choice, provider config). Execute side effects (mkdir, write files) server-side. Return instruction messages after side effects complete.

### Pattern C: Mode Setting + Chain (2 prompts)

Set a mode flag and then chain to another prompt.

**Prompts:** autopilot (sets mode=continuous, chains to new+run), composite (sets composite config, chains to new)

**Implementation:** Write mode/config state, then return messages that instruct the agent to invoke the chained prompt. The prompt response includes the context for the next prompt to pick up.

### Pattern D: External Binary Invocation (2 prompts)

The prompt needs to run an external binary or script.

**Prompts:** migrate (runs `haiku migrate`), dashboard (runs bun dashboard generator)

**Implementation:** The server could execute the binary before returning messages, or return instructions for the agent to execute it. Given the prompts-not-tools model, the handler should return instructions that tell the agent what command to run, with pre-computed context.

### Pattern E: Subcommand Dispatch (3 prompts)

The prompt has distinct sub-modes selected by the first argument.

**Prompts:** backlog (add|list|review|promote), seed (plant|list|check), operate (list|overview|execute|deploy|status|teardown)

**Implementation:** The prompt argument includes the subcommand. The handler dispatches to different message construction logic based on the subcommand. Consider whether each subcommand should be a separate prompt or one prompt with argument-driven dispatch. Recommendation: single prompt with subcommand argument for each, matching the existing skill UX.

### Pattern F: Subagent Orchestration (2 prompts)

The prompt orchestrates multiple subagent spawns.

**Prompts:** adopt (5 parallel explore subagents), quick (sequential hat loop subagents)

**Implementation:** The prompt returns instructions that tell the agent to spawn subagents. The MCP prompt cannot spawn agents itself (no sampling support yet). The returned messages contain the subagent prompts and orchestration instructions.

## 4. Argument and Completion Requirements

| Prompt | Arguments | Completions Needed |
|--------|-----------|-------------------|
| `composite` | `description` (optional) | Studio names |
| `autopilot` | `description` (required) | None |
| `setup` | None | None |
| `migrate` | `intent-slug` (optional) | Legacy intent slugs from .ai-dlc/ |
| `scaffold` | `type name [parent] [grandparent]` | Artifact types, studio names, stage names |
| `operate` | `intent-slug` (optional), `operation` (optional), flags | Intent slugs, operation names |
| `triggers` | `--poll category`, `--check-gates`, `--dry-run` | Provider categories |
| `dashboard` | `--output dir` (optional) | None |
| `backlog` | `subcommand` + `description/id` | Subcommands (add/list/review/promote), backlog item IDs |
| `capacity` | `studio-name` (optional) | Studio names |
| `release-notes` | `version` or `--last n` (optional) | Version numbers from CHANGELOG.md |
| `adopt` | `feature-description` (optional) | None |
| `quick` | `[stage-name] task-description` | Stage names |
| `seed` | `subcommand` (plant/list/check) | Subcommands |
| `ideate` | `area` (optional) | Directory paths |
| `pressure-testing` | `hat-name` (optional) | Hat names from studios |

## 5. Elicitation Requirements

Prompts that need structured user input via `elicitation/create`:

| Prompt | Elicitation Points | Form Fields |
|--------|-------------------|-------------|
| `composite` | Studio selection, stage selection per studio, sync point definition | Multi-select (studios), multi-select per studio (stages), free text (sync rules) |
| `autopilot` | Scope confirmation (>5 units), delivery confirmation | Single choice (continue/manual/re-plan), single choice (yes/no/review) |
| `setup` | Settings confirmation, provider selection, visual review, workflow mode, studio, announcements, VCS strategy | Single choice (per category), multi-select (review agents), single choice (multiple phases) |
| `scaffold` | Artifact type (if no args), overwrite confirmation | Single choice (type), yes/no (overwrite) |
| `adopt` | Feature description, code paths, git refs, intent review, criteria review, ops review, next steps | Free text, single choice (multiple phases) |
| `seed` | Idea + trigger (plant subcommand), action per seed (check subcommand) | Free text (plant), single choice per seed (check) |
| `pressure-testing` | Hat selection, scenario approval, anti-rationalization approval | Single choice (hat), yes/modify/different (scenario), yes/modify (row) |

## 6. Side Effect Classification

### Write Side Effects (file/state changes)

| Prompt | What It Writes |
|--------|---------------|
| `composite` | .haiku/intents/{slug}/ with composite frontmatter |
| `autopilot` | Chains to new (creates intent) + run (creates branch, units, commits, PR) |
| `setup` | .haiku/settings.yml, optional .haiku/providers/*.md |
| `migrate` | .haiku/intents/{slug}/ (from .ai-dlc/), backups, symlinks |
| `scaffold` | .haiku/studios/ or .haiku/providers/ template files |
| `operate` | state/operation-status.json, operations/deploy/ manifests |
| `triggers` | .haiku/trigger-poll.json, may create intents, may advance gates |
| `backlog` | .haiku/backlog/{slug}.md (add/review/promote) |
| `seed` | .haiku/seeds/{slug}.md (plant/check) |
| `adopt` | .haiku/intents/{slug}/ with intent, units, discovery, operations |
| `quick` | .haiku/quick/ (temporary), feature branch, PR |
| `pressure-testing` | .haiku/pressure-tests/{hat}/, may edit hat definition files |

### Read-Only

| Prompt | What It Reads |
|--------|--------------|
| `dashboard` | All .haiku/ data (generates HTML output but doesn't modify .haiku/) |
| `capacity` | Intent/stage/unit timestamps + git log |
| `release-notes` | CHANGELOG.md |
| `ideate` | Codebase files + git log |

## 7. Technical Risks

| Risk | Severity | Affected Prompts | Mitigation |
|------|----------|-----------------|------------|
| Complex elicitation flows may not map cleanly to MCP elicitation forms | High | setup, composite, adopt | Design elicitation forms carefully; some multi-phase flows may need multiple sequential elicitations. Test with Claude Code's elicitation support. |
| Subcommand dispatch creates argument parsing complexity | Medium | backlog, seed, operate | Define the subcommand as the first argument with a completer that returns valid subcommands. The handler parses and dispatches. |
| External binary invocation (migrate, dashboard) cannot be done server-side in prompts | Medium | migrate, dashboard | Return instructions in PromptMessage[] telling the agent what command to run. The agent executes the command itself. |
| Chaining prompts (autopilot -> new -> run) requires the agent to invoke subsequent prompts | Medium | autopilot, composite | Return messages with explicit instructions to invoke the next prompt. The agent follows the instructions and calls the next prompt. |
| Side effects during prompt construction (setup writes settings.yml) may need to happen before returning messages | Medium | setup, scaffold, migrate | For prompts with side effects: either (a) the handler performs the side effect and returns confirmation messages, or (b) the handler returns instructions for the agent to perform the side effect. Pattern (b) is more consistent with the prompts model. |
| Subagent orchestration prompts (adopt, quick) cannot spawn agents server-side | Low | adopt, quick | Return detailed subagent instructions in the prompt messages. The agent handles spawning. This is the same as current skill behavior. |
| Large prompt messages for complex prompts (setup has 8 phases) | Low | setup, adopt, operate | Keep messages focused. Break long instructions into logical sections. The agent processes sequentially. |
| Operate's deploy mode generates infrastructure-specific manifests | Low | operate | The prompt returns instructions; the agent generates manifests. Templates can be included in messages. |

## 8. Implementation Sizing

### Simple (return state + instructions, no elicitation): ~30-50 lines each

- `haiku:dashboard` — Read .haiku/ state, return formatted status + bun command
- `haiku:release-notes` — Read CHANGELOG.md, parse, return formatted entries
- `haiku:capacity` — Read intent/stage/unit state, compute metrics, return report
- `haiku:ideate` — Return analysis instructions with codebase context

**Subtotal: 4 prompts, ~150 lines**

### Medium (subcommand dispatch or single elicitation): ~60-100 lines each

- `haiku:backlog` — Dispatch on subcommand, read/write .haiku/backlog/
- `haiku:seed` — Dispatch on subcommand, read/write .haiku/seeds/
- `haiku:scaffold` — Elicit type if needed, return template creation instructions
- `haiku:migrate` — Elicit intent selection, return binary invocation instructions

**Subtotal: 4 prompts, ~320 lines**

### Complex (multi-phase elicitation or orchestration): ~100-200 lines each

- `haiku:composite` — Multi-select studios, per-studio stage selection, sync points
- `haiku:autopilot` — Mode setting, guardrail checks, chain instructions
- `haiku:setup` — 8-phase configuration wizard with extensive elicitation
- `haiku:operate` — 8 sub-modes with status tracking and deploy generation
- `haiku:triggers` — Provider polling logic, gate matching, event classification
- `haiku:adopt` — 7-phase exploration + artifact generation orchestration
- `haiku:quick` — Scope validation, hat loop orchestration, PR delivery
- `haiku:pressure-testing` — RED/GREEN/REFACTOR cycle with subagent orchestration

**Subtotal: 8 prompts, ~1200 lines**

### Total estimate: ~1670 lines across 16 prompt handlers

This fits within the binary size constraint (<1.5MB). The existing server is ~3924 lines; adding ~1670 lines for these 16 prompts plus the ~500 lines from unit-02's core prompts keeps the total under 6100 lines.

## 9. Dependency on Unit-01 and Unit-02

These 16 prompts depend on infrastructure from unit-01 (prompts/index.ts registry, completions.ts, types.ts) and share patterns with unit-02's core prompts (new, run, refine, review, reflect).

Key shared infrastructure:
- `registerPrompt()` from prompts/index.ts
- `completeIntentSlug()`, `completeStudio()`, `completeStage()` from completions.ts
- Filesystem helpers (findHaikuRoot, intentDir, stageDir, readFrontmatter)
- PromptDef interface from types.ts

New completion providers needed for this unit:
- `completeLegacyIntents()` — scan .ai-dlc/ for migrate
- `completeBacklogItems()` — scan .haiku/backlog/ for backlog promote
- `completeOperations()` — scan intent operations/ for operate
- `completeHatNames()` — scan studio stage hats for pressure-testing
- `completeSubcommand()` — static lists for backlog, seed, operate
- `completeVersions()` — parse CHANGELOG.md headings for release-notes
