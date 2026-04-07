# H·AI·K·U Plugin Validation

This document defines the expected behaviors, success criteria, and invariants that the H·AI·K·U plugin must satisfy. An LLM can validate against these scenarios by reading the skills, MCP tools, hooks, and studio definitions.

## Core Invariants

These must ALWAYS be true regardless of studio, stage, or user action.

### State Integrity

- [ ] Intent state lives in `intent.md` frontmatter — never in ephemeral files
- [ ] Unit state lives in `unit-*.md` frontmatter (`bolt`, `hat`, `status`, `started_at`, `completed_at`)
- [ ] Stage state lives in `stages/{stage}/state.json` (`phase`, `status`, `started_at`, `completed_at`, `gate_entered_at`, `gate_outcome`)
- [ ] No lifecycle state is stored in `state/iteration.json` (deprecated)
- [ ] Stage/intent lifecycle transitions are performed by the `haiku_run_next` FSM driver — the agent never mutates stage or intent state directly. Intent creation goes through `haiku_intent_create`. Unit-level writes go through `haiku_unit_start`, `haiku_unit_advance_hat`, `haiku_unit_complete`, `haiku_unit_fail`, `haiku_unit_increment_bolt`, and `haiku_unit_set`. Exception: hooks may write directly for auto-reconciliation (post-merge, auto-complete)
- [ ] Lifecycle transitions (stage start/complete, unit start/complete) are committed to git automatically. Incremental updates (hat advance, bolt increment, phase set) are committed by the agent as part of its workflow.

### Orchestration

- [ ] `haiku_run_next` is the sole authority on what happens next — the agent follows its action, not prose instructions
- [ ] The stage loop always follows the sequence: elaborate → execute → review → gate (no separate persist step)
- [ ] Continuous mode auto-advances through stages when gates pass; discrete mode always stops
- [ ] Neither mode skips or collapses stages — every stage runs the full four-step loop
- [ ] An agent never autonomously resets `active_stage` to a prior stage (full stage-backs are human-initiated)
- [ ] Stage-scoped refinements (upstream side-trips) do NOT reset current stage progress

### Collaborative Elaboration

- [ ] Elaboration MUST be a multi-turn conversation — agent MUST NOT research, write units, and present a finished plan in a single pass
- [ ] Agent MUST ask questions iteratively: architecture preferences, constraints, edge cases, unknowns
- [ ] Agent MUST validate assumptions with the user before writing them into units
- [ ] Agent MUST present options and tradeoffs when decisions exist — MUST NOT silently choose
- [ ] Elaboration continues until both agent and user are confident the plan is solid
- [ ] All skills and stage definitions use RFC 2119 language (MUST, MUST NOT, SHALL, REQUIRED) for mandatory behavior

### Visual Review Enforcement (RFC 2119)

- [ ] Elaboration plan MUST be presented via review UI — never as plain conversation text
- [ ] FSM handles this internally via `haiku_run_next` (blocks until user responds)
- [ ] Gates are handled by the FSM — `haiku_run_next` opens review UI, blocks, returns decision (`advance_stage` or `changes_requested`)
- [ ] Rich content during elaboration (specs, wireframes, comparisons) MUST use `ask_user_visual_question`
- [ ] Design direction choices MUST use `pick_design_direction`
- [ ] Plain conversation text is ONLY for simple clarification questions — MUST NOT present plans or reviews as text
- [ ] Agent MUST NOT dump unit lists, criteria tables, or stage summaries as conversation text when visual tools are available

### Quality Enforcement

- [ ] Quality gates run on the Stop hook — the agent cannot bypass them
- [ ] An agent cannot declare a unit complete if completion criteria checkboxes are unchecked
- [ ] Review agents run during the adversarial review step (4.3), not during execution
- [ ] The builder hat never reviews its own output — hat isolation is structural

### Delivery

- [ ] One PR per intent — units do not produce separate PRs
- [ ] Intent branches follow: `haiku/{intent-slug}/main`

### Session Integrity

- [ ] One intent per session — `haiku_intent_create` rejects if the session already has an active intent
- [ ] Session events are logged to `haiku.jsonl` for auditability
- [ ] Worktree isolation — intent branch and unit worktrees keep work separate from the main tree

---

## Scenario 1: New Intent Through Full Lifecycle (Software Studio)

**Trigger:** User runs `/haiku:new` with a description.

### Expected Flow

1. **Intent creation** (via `haiku_intent_create` with elicitation):
   - [ ] `haiku_intent_create` uses MCP elicitation to gather title, studio, mode from the user
   - [ ] `intent.md` created with: title, studio: software, stages: [...], mode, status: active, started_at: now
   - [ ] `.haiku/intents/{slug}/` directory created with `knowledge/` subdirectory
   - [ ] Intent fields set during creation (mode, studio, etc.)
   - [ ] One intent per session — `haiku_intent_create` rejects if session already has an active intent

2. **First `/haiku:run`:**
   - [ ] `haiku_run_next` returns `start_stage` with stage: inception, hats: [architect, elaborator]
   - [ ] Orchestrator performs FSM side effects: writes `state.json` (status: active, phase: elaborate), sets `active_stage`, creates intent branch
   - [ ] Agent follows the returned action

3. **Elaboration:**
   - [ ] `haiku_run_next` returns `elaborate`
   - [ ] Agent reads STAGE.md for inception: inputs, unit_types, criteria guidance
   - [ ] Agent writes unit files to `stages/inception/units/`
   - [ ] Agent calls `haiku_run_next` — orchestrator detects units exist, advances phase to execute
   - [ ] Spec review gate opens between elaborate and execute (user must approve specs)
   - [ ] Unit type validation blocks transition if units have wrong types for the stage

4. **Execution:**
   - [ ] `haiku_run_next` returns `start_unit` with first ready unit and first hat
   - [ ] Wave-based execution — units grouped by dependency depth, independent units run in parallel
   - [ ] Agent spawns one subagent per hat — main agent orchestrates
   - [ ] Agent calls `haiku_unit_start { intent, stage, unit, hat }`
   - [ ] Agent loads hat definition from `stages/inception/hats/{hat}.md`
   - [ ] Subagent executes hat's work
   - [ ] Subagent calls `haiku_unit_advance_hat` (success) or `haiku_unit_fail` (failure)
   - [ ] Agent calls `haiku_unit_complete` when all hats pass
   - [ ] If criteria not met: `haiku_unit_increment_bolt` and retry
   - [ ] Output validation blocks execute to review transition if required outputs missing

5. **Adversarial review:**
   - [ ] `haiku_run_next` returns `review` when all units complete
   - [ ] Agent loads review agents from `stages/inception/review-agents/`
   - [ ] Agent loads cross-stage includes from `review-agents-include` in STAGE.md
   - [ ] Agents run in parallel, findings collected
   - [ ] HIGH findings trigger fixes (up to 3 cycles)

6. **Gate:**
   - [ ] `haiku_run_next` returns appropriate gate action based on `review:` in STAGE.md
   - [ ] Inception has `review: auto` → orchestrator auto-advances (completes stage, sets active_stage)
   - [ ] For `review: ask` gates, `haiku_run_next` opens review UI internally, blocks, returns `advance_stage` (approved) or `changes_requested` (denied)
   - [ ] `haiku_run_next` returns `advance_stage` with mutations already applied

7. **Continuous mode:**
   - [ ] After gate passes, `haiku_run_next` returns `start_stage` for design
   - [ ] Cycle repeats for each stage: design → product → development → operations → security
   - [ ] Each stage uses its own hats, review agents, and gate type

8. **Completion:**
   - [ ] After final stage gate passes, `haiku_run_next` returns `intent_complete`
   - [ ] Orchestrator has already marked intent as completed (status: completed, completed_at: now)

### Telemetry Verification

- [ ] `haiku.intent.created` emitted on intent creation
- [ ] `haiku.stage.started` emitted for each stage
- [ ] `haiku.stage.completed` emitted with gate_outcome
- [ ] `haiku.unit.started` emitted with hat
- [ ] `haiku.unit.completed` emitted
- [ ] `haiku.unit.failed` emitted on hat failure
- [ ] `haiku.hat.transition` emitted for each hat change
- [ ] `haiku.bolt.iteration` emitted for each retry

---

## Scenario 2: Discrete Mode

**Trigger:** User creates intent with mode: discrete.

- [ ] After each stage gate passes, `haiku_run_next` returns `stage_complete_discrete` (not `advance_stage`)
- [ ] Agent stops and tells user to run `/haiku:run` for next stage
- [ ] Even `review: auto` gates stop in discrete mode

---

## Scenario 3: Ask Gate

**Trigger:** Stage has `review: ask` (e.g., development stage).

- [ ] `haiku_run_next` handles the gate internally — opens review UI, blocks until user responds
- [ ] `haiku_run_next` returns `advance_stage` (approved, continuous) or `stage_complete_discrete` (approved, discrete)
- [ ] `haiku_run_next` returns `changes_requested` (denied) — agent addresses feedback
- [ ] If review UI fails, falls back to MCP elicitation

---

## Scenario 4: Await Gate

**Trigger:** Stage has `review: await` (e.g., sales proposal).

- [ ] `haiku_run_next` returns `gate_await` — orchestrator enters the gate (sets gate_entered_at)
- [ ] Agent reports what is being awaited
- [ ] Intent blocks until user runs `/haiku:run` again
- [ ] On resume: agent confirms event occurred, then advances

---

## Scenario 5: External Gate

**Trigger:** Stage has `review: external` (e.g., product stage).

- [ ] `haiku_run_next` returns `gate_external` — orchestrator enters the gate (sets gate_entered_at)
- [ ] FSM returns `external_review_requested` — agent/user submits for review through their project's process
- [ ] Intent blocks until external review resolves

---

## Scenario 6: Stage-Scoped Refinement

**Trigger:** During development elaboration, agent discovers design stage output is missing a screen.

- [ ] Agent invokes `/haiku:refine stage:design`
- [ ] A new unit is created in `stages/design/units/`
- [ ] That unit runs through design stage's hats (designer, design-reviewer)
- [ ] Updated design output is persisted
- [ ] Agent returns to development elaboration with the gap filled
- [ ] Development stage's active phase is unchanged — no reset

---

## Scenario 7: Template Instantiation

**Trigger:** User runs `/haiku:new --template new-feature --param feature="OAuth login"`.

- [ ] Template resolved from `studios/software/templates/new-feature.md`
- [ ] Parameters substituted: `{{ feature }}` → "OAuth login" in all criteria
- [ ] Pre-filled units created in appropriate stages
- [ ] First `/haiku:run` skips elaboration (units already exist)
- [ ] `haiku_run_next` returns `advance_phase` from elaborate to execute

---

## Scenario 8: Composite Intent

**Trigger:** User runs `/haiku:composite` selecting software + marketing.

- [ ] Intent created with `composite:` frontmatter listing both studios and their stages
- [ ] `sync:` rules defined (e.g., marketing:launch waits for software:development)
- [ ] `composite_state:` tracks per-studio active stage
- [ ] `haiku_run_next` returns `composite_run_stage` for the first runnable studio:stage
- [ ] Parallel tracks execute independently until sync points
- [ ] Sync-blocked stages are not returned by `haiku_run_next` until dependencies complete
- [ ] Intent completes when all studios complete all stages

---

## Scenario 9: Resume After Context Loss

**Trigger:** User `/clear`s without stop hook, or starts a new session.

- [ ] Session start hook (`inject-context`) reads committed artifacts
- [ ] Intent, stage, and unit state reconstructed from frontmatter and state.json
- [ ] `haiku_run_next` returns the correct action based on persisted state
- [ ] No work is lost — committed artifacts survive context resets
- [ ] Agent resumes from exact position (correct stage, phase, unit, hat, bolt)

---

## Scenario 10: Migration from AI-DLC

**Trigger:** Repo has `.ai-dlc/` intents, user opens Claude Code session.

- [ ] `inject-context` hook detects unmigrated `.ai-dlc/` intents
- [ ] `haiku migrate` runs automatically
- [ ] Completed intents: migrated as historical records with checked criteria
- [ ] Active intents: intent.md + knowledge migrated, stages reset for fresh start
- [ ] Migrated intents include `stages:` field from studio definition
- [ ] `.haiku/intents/` created with proper directory structure
- [ ] Browse shows migrated intents correctly

---

## Scenario 11: Provider Sync

**Trigger:** Ticketing provider configured (e.g., Jira).

- [ ] During elaboration: epic created (or existing epic linked) via ticketing provider
- [ ] Each unit gets a ticket linked to the epic
- [ ] During execution: ticket status synced (pending → active → completed)
- [ ] Blocker documentation pushed to ticket comments
- [ ] On intent completion: epic updated

---

## Scenario 12: Browse Renders Correctly

**Trigger:** User opens `/browse/github.com/org/repo/`.

- [ ] Portfolio shows all intents sorted by status then date
- [ ] Each intent shows: title, studio, stage, status, dates, duration, progress
- [ ] Board view shows all studio stages as columns (even empty ones)
- [ ] Clicking intent shows stage pipeline with phase badges
- [ ] Clicking unit shows: criteria checkboxes, bolt count, hat, timestamps, duration
- [ ] Knowledge files are expandable and render as markdown
- [ ] Design artifacts (design_ref, wireframe) shown as clickable links
- [ ] URLs are shareable via hash: `#intent=slug&unit=name&stage=name`
- [ ] Browser back button navigates correctly within the SPA
- [ ] UTF-8 characters (em dashes, middle dots) render correctly
- [ ] Rate limiting shows helpful message (not "private repo")

---

## Scenario 13: Hook Execution

**Trigger:** Various Claude Code lifecycle events.

### SessionStart
- [ ] `inject-context`: auto-migrates `.ai-dlc/` intents, injects full H·AI·K·U context
- [ ] `ensure-deps`: no-op (Node is the only dependency)

### PreToolUse
- [ ] `redirect-plan-mode`: blocks EnterPlanMode, suggests `/haiku:new`
- [ ] `inject-state-file`: injects `state_file` arg into `haiku_` MCP tool calls
- [ ] `guard-fsm-fields`: blocks direct edits to FSM-controlled fields in haiku state files
- [ ] `prompt-guard`: warns on injection patterns in `.haiku/` file writes
- [ ] `workflow-guard`: warns on edits outside active hat scope
- [ ] `subagent-hook`: injects H·AI·K·U context into Agent/Task/Skill calls

### PostToolUse
- [ ] `validate-unit-type`: warns on unit file writes with wrong types for the stage
- [ ] `context-monitor`: warns at 35% and 25% context remaining

### Stop
- [ ] `quality-gate`: runs configured gate commands (test, lint, typecheck, build)
- [ ] `quality-gate`: blocks stop if gates fail
- [ ] `enforce-iteration`: rescues from premature stop, checks DAG status

### All hooks
- [ ] Execute via `${CLAUDE_PLUGIN_ROOT}/bin/haiku hook <name>` — no shell scripts
- [ ] Read stdin JSON, write stdout text
- [ ] Non-fatal: hook failure doesn't crash the session

---

## Scenario 14: Binary Modes

**Trigger:** The `haiku` binary is invoked.

- [ ] `haiku mcp`: starts MCP server on stdio with all tools (state, orchestrator, review)
- [ ] `haiku hook <name>`: executes the named hook
- [ ] `haiku migrate`: migrates `.ai-dlc/` to `.haiku/`
- [ ] Unknown command: exits with error and usage message
- [ ] Binary is a single file at `plugin/bin/haiku` (~1.1MB minified, includes review SPA inlined)
- [ ] Shebang (`#!/usr/bin/env node`) makes it directly executable
- [ ] Zero external dependencies at runtime (no jq, yq, or npm install)

---

## Scenario 15: Artifact Flow (Discovery + Output Chaining)

**Trigger:** Agent completes a stage that has artifact definitions and advances to a downstream stage that declares those as inputs.

### Artifact Definition Structure

- [ ] Discovery artifacts are defined in `studios/{studio}/stages/{stage}/discovery/{ARTIFACT}.md` — knowledge produced during elaboration
- [ ] Output artifacts are defined in `studios/{studio}/stages/{stage}/outputs/{ARTIFACT}.md` — work products produced during execute
- [ ] Each artifact definition has frontmatter with: `name`, `location`, `scope`, `format`, `required`
- [ ] The `location:` field specifies where the artifact is written (e.g., `knowledge/DISCOVERY.md`, or project source tree)
- [ ] Downstream stages declare `inputs:` in their STAGE.md frontmatter, referencing `stage:` and either `discovery:` or `output:` names

### Software Studio Input/Output Chain

- [ ] Inception produces discovery `discovery` → written to `.haiku/intents/{slug}/knowledge/DISCOVERY.md`
- [ ] Design consumes inception/discovery (discovery); produces discovery `design-brief` (→ `stages/design/DESIGN-BRIEF.md`), discovery `design-tokens` (→ `knowledge/DESIGN-TOKENS.md`), and output `design-artifacts` (→ `stages/design/artifacts/` — hi-fi mockups stored inside the intent as part of the spec)
- [ ] Product consumes inception/discovery, design/design-brief, design/design-tokens (all discovery); produces discovery `behavioral-spec` (→ `knowledge/BEHAVIORAL-SPEC.md`) and discovery `data-contracts` (→ `knowledge/DATA-CONTRACTS.md`)
- [ ] Development consumes discovery artifacts from inception, design, product + output `design-artifacts` from design; produces output `code` (→ project source tree) and discovery `architecture` (→ `.haiku/knowledge/ARCHITECTURE.md`)
- [ ] Operations consumes inception/discovery, product/behavioral-spec (discovery) + development/code (output), development/architecture (discovery)
- [ ] Security consumes inception/discovery, product/behavioral-spec, product/data-contracts (discovery) + development/code (output), development/architecture (discovery)

### Execution Flow

- [ ] During elaboration, the agent reads the stage's STAGE.md `inputs:` to discover required upstream artifacts
- [ ] The agent reads each referenced artifact definition (from `discovery/` or `outputs/` in the upstream stage) to find the `location:` where the artifact lives
- [ ] The agent loads the artifact from that location and uses it to inform elaboration
- [ ] If an input artifact is missing or stale, the agent invokes `/haiku:refine stage:{upstream}` for a scoped side-trip
- [ ] During execution, the agent writes output artifacts to the locations specified in the stage's output definitions
- [ ] Artifact persistence promotes discovery/output files to their scoped knowledge directories (auto-commit on unit/stage complete)

### Invariants

- [ ] `produces:` is NOT a field in STAGE.md frontmatter — artifacts are file-based definitions in `stages/{stage}/discovery/` and `stages/{stage}/outputs/`
- [ ] Input/output chains must form a valid DAG — no circular dependencies between stages
- [ ] All `inputs:` references in STAGE.md must use `discovery:` or `output:` to reference artifacts in the corresponding directory of the upstream stage
- [ ] The `location:` in artifact definitions determines where the artifact lives — not the agent's discretion

---



### File Layout

```
plugin/
  bin/haiku                    # compiled binary (MCP + hooks + migrate)
  .mcp.json                    # points to bin/haiku mcp
  hooks/hooks.json             # points all hooks to bin/haiku hook <name>
  skills/                      # prose instructions referencing MCP tools
  studios/                     # studio definitions (source of truth)
    {studio}/
      STUDIO.md                # stages, persistence, delivery
      stages/{stage}/
        STAGE.md               # hats, review, inputs, gate-protocol
        hats/{hat}.md           # behavioral role definitions
        review-agents/{agent}.md # adversarial review mandates
        discovery/{artifact}.md # knowledge artifact definitions (research, specs, models)
        outputs/{artifact}.md   # work product definitions (code, config, deliverables)
      operations/{op}.md        # post-delivery operation templates
      reflections/{dim}.md      # reflection analysis dimensions
      templates/{template}.md   # intent templates with parameters

packages/
  haiku/                        # TypeScript source (NOT shipped)
    src/
      main.ts                   # entry point: mcp | hook | migrate
      server.ts                 # MCP server with all tools
      orchestrator.ts           # haiku_run_next logic
      state-tools.ts            # CRUD tools for intents, stages, units
      telemetry.ts              # automatic OTEL event emission
      migrate.ts                # .ai-dlc → .haiku migration
      hooks/                    # all hooks in TypeScript
```

### MCP Tools (23 total)

**Orchestrator (3):**

| Tool | Purpose |
|------|---------|
| `haiku_run_next` | Get next orchestrator action (FSM driver) |
| `haiku_go_back` | Navigate to a prior stage or phase |
| `haiku_intent_create` | Create a new intent (with elicitation) |

**Unit write (6):**

| Tool | Purpose |
|------|---------|
| `haiku_unit_start` | Start a unit (set hat, status: active) |
| `haiku_unit_advance_hat` | Advance to next hat (success) |
| `haiku_unit_complete` | Mark unit complete |
| `haiku_unit_fail` | Mark hat failure on a unit |
| `haiku_unit_increment_bolt` | Increment bolt (retry cycle) |
| `haiku_unit_set` | Write arbitrary unit frontmatter fields |

**Read-only (11):**

| Tool | Purpose |
|------|---------|
| `haiku_intent_get` | Read intent frontmatter |
| `haiku_intent_list` | List all intents |
| `haiku_stage_get` | Read stage state.json |
| `haiku_unit_get` | Read unit frontmatter |
| `haiku_unit_list` | List units in a stage |
| `haiku_knowledge_list` | List knowledge artifacts |
| `haiku_knowledge_read` | Read a knowledge artifact |
| `haiku_studio_list` | List available studios |
| `haiku_studio_get` | Read studio definition |
| `haiku_studio_stage_get` | Read a stage definition within a studio |
| `haiku_settings_get` | Read plugin settings |

**Visual (3):**

| Tool | Purpose |
|------|---------|
| `ask_user_visual_question` | Ask the user questions via a rich HTML page in the browser |
| `pick_design_direction` | Open a browser-based visual picker for choosing a design direction |
| `get_review_status` | Check the status and decision of a review session |

### Automatic Telemetry

Every MCP state transition emits its OTEL event — no manual calls needed:

| Source | Event |
|--------|-------|
| `haiku_intent_create` | `haiku.intent.created` |
| `haiku_run_next` (FSM: start_stage) | `haiku.stage.started` |
| `haiku_run_next` (FSM: complete_stage) | `haiku.stage.completed` |
| `haiku_run_next` (FSM: advance_phase) | `haiku.stage.phase` |
| `haiku_run_next` (FSM: gate_ask/external/await) | `haiku.gate.entered` |
| `haiku_run_next` (FSM: gate resolved) | `haiku.gate.resolved` |
| `haiku_run_next` (FSM: intent_complete) | `haiku.intent.completed` |
| `haiku_run_next` | `haiku.orchestrator.action` |
| `haiku_go_back` | `haiku.go_back.stage` / `haiku.go_back.phase` |
| `haiku_unit_start` | `haiku.unit.started` |
| `haiku_unit_complete` | `haiku.unit.completed` |
| `haiku_unit_fail` | `haiku.unit.failed` |
| `haiku_unit_advance_hat` | `haiku.hat.transition` |
| `haiku_unit_increment_bolt` | `haiku.bolt.iteration` |

---

## How to Validate

An LLM validates this document by:

1. **Reading the run skill** (`plugin/skills/run/SKILL.md`) and confirming the action reference matches the orchestrator's return types
2. **Reading the orchestrator** (`packages/haiku/src/orchestrator.ts`) and confirming it produces the documented actions
3. **Reading the state tools** (`packages/haiku/src/state-tools.ts`) and confirming they write to the documented locations
4. **Reading the hooks** (`packages/haiku/src/hooks/`) and confirming they match the hook scenarios
5. **Reading the studio definitions** and confirming hats, review agents, and gate types match
6. **Tracing a scenario end-to-end** through the code and confirming each step produces the expected state changes

If any invariant or scenario fails validation, the plugin has a bug that must be fixed before release.
