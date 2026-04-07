# H·AI·K·U Plugin Validation

This document defines the expected behaviors, success criteria, and invariants that the H·AI·K·U plugin must satisfy. An LLM can validate against these scenarios by reading the skills, MCP tools, hooks, and studio definitions.

## Core Invariants

These must ALWAYS be true regardless of studio, stage, or user action.

### State Integrity

- [ ] Intent state lives in `intent.md` frontmatter — never in ephemeral files
- [ ] Unit state lives in `unit-*.md` frontmatter (`bolt`, `hat`, `status`, `started_at`, `completed_at`)
- [ ] Stage state lives in `stages/{stage}/state.json` (`phase`, `status`, `started_at`, `completed_at`, `gate_entered_at`, `gate_outcome`)
- [ ] No lifecycle state is stored in `state/iteration.json` (deprecated)
- [ ] Every state write goes through MCP tools (`haiku_intent_set`, `haiku_stage_set`, `haiku_unit_set`, etc.) — exception: hooks may write directly for auto-reconciliation (post-merge, auto-complete)
- [ ] Lifecycle transitions (stage start/complete, unit start/complete) are committed to git automatically. Incremental updates (hat advance, bolt increment, phase set) are committed by the agent as part of its workflow.

### Orchestration

- [ ] `haiku_run_next` is the sole authority on what happens next — the agent follows its action, not prose instructions
- [ ] The stage loop always follows the sequence: elaborate → execute → review → gate (no separate persist step)
- [ ] Continuous mode auto-advances through stages when gates pass; discrete mode always stops
- [ ] Neither mode skips or collapses stages — every stage runs the full four-step loop
- [ ] An agent never autonomously resets `active_stage` to a prior stage (full stage-backs are human-initiated)
- [ ] Stage-scoped refinements (upstream side-trips) do NOT reset current stage progress

### Visual Review Enforcement

- [ ] Elaboration plan MUST be presented via `open_review` — never as plain conversation text
- [ ] `open_review` MUST run in a background subagent (it blocks until user responds)
- [ ] Gate ask MUST use `open_review` or verify the auto-opened review — never text-only approval
- [ ] Rich content during elaboration (specs, wireframes, comparisons) MUST use `ask_user_visual_question`
- [ ] Design direction choices MUST use `pick_design_direction`
- [ ] Plain conversation text is only for simple clarification questions, not for presenting plans or reviews
- [ ] The agent NEVER dumps unit lists, criteria tables, or stage summaries as conversation text when visual tools are available

### Quality Enforcement

- [ ] Quality gates run on the Stop hook — the agent cannot bypass them
- [ ] An agent cannot declare a unit complete if completion criteria checkboxes are unchecked
- [ ] Review agents run during the adversarial review step (4.3), not during execution
- [ ] The builder hat never reviews its own output — hat isolation is structural

### Delivery

- [ ] One PR per intent — units do not produce separate PRs
- [ ] Intent branches follow: `haiku/{intent-slug}/main`

---

## Scenario 1: New Intent Through Full Lifecycle (Software Studio)

**Trigger:** User runs `/haiku:new` with a description.

### Expected Flow

1. **Intent creation:**
   - [ ] `intent.md` created with: title, studio: software, stages: [...], mode, status: active, started_at: now
   - [ ] `.haiku/intents/{slug}/` directory created with `knowledge/` subdirectory
   - [ ] MCP tool `haiku_intent_set` used to set initial fields

2. **First `/haiku:run`:**
   - [ ] `haiku_run_next` returns `start_stage` with stage: inception, hats: [architect, decomposer]
   - [ ] Agent calls `haiku_stage_start { intent, stage: inception }`
   - [ ] `state.json` created with phase: decompose

3. **Elaboration:**
   - [ ] `haiku_run_next` returns `decompose`
   - [ ] Agent reads STAGE.md for inception: inputs, unit_types, criteria guidance
   - [ ] Agent writes unit files to `stages/inception/units/`
   - [ ] Agent calls `haiku_stage_set { phase: execute }`

4. **Execution:**
   - [ ] `haiku_run_next` returns `start_unit` with first ready unit and first hat
   - [ ] Agent calls `haiku_unit_start { intent, stage, unit, hat }`
   - [ ] Agent loads hat definition from `stages/inception/hats/{hat}.md`
   - [ ] Agent executes hat's work
   - [ ] Agent calls `haiku_unit_advance_hat` for next hat, or `haiku_unit_complete` when done
   - [ ] If criteria not met: `haiku_unit_increment_bolt` and retry

5. **Adversarial review:**
   - [ ] `haiku_run_next` returns `review` when all units complete
   - [ ] Agent loads review agents from `stages/inception/review-agents/`
   - [ ] Agent loads cross-stage includes from `review-agents-include` in STAGE.md
   - [ ] Agents run in parallel, findings collected
   - [ ] HIGH findings trigger fixes (up to 3 cycles)

6. **Persist + Gate:**
   - [ ] Stage outputs persisted to scoped locations
   - [ ] `haiku_run_next` returns appropriate gate action based on `review:` in STAGE.md
   - [ ] Inception has `review: auto` → returns `advance_stage`
   - [ ] Agent calls `haiku_stage_complete` + `haiku_intent_set { active_stage: design }`

7. **Continuous mode:**
   - [ ] After gate passes, `haiku_run_next` returns `start_stage` for design
   - [ ] Cycle repeats for each stage: design → product → development → operations → security
   - [ ] Each stage uses its own hats, review agents, and gate type

8. **Completion:**
   - [ ] After final stage gate passes, `haiku_run_next` returns `intent_complete`
   - [ ] Agent calls `haiku_intent_set { status: completed, completed_at: now }`

### Telemetry Verification

- [ ] `haiku.stage.started` emitted for each stage
- [ ] `haiku.stage.completed` emitted with gate_outcome
- [ ] `haiku.unit.started` emitted with hat
- [ ] `haiku.unit.completed` emitted
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

- [ ] `haiku_run_next` returns `gate_ask`
- [ ] Agent presents stage summary via `AskUserQuestion`
- [ ] On approval: agent calls `haiku_gate_approve { intent, stage }`
- [ ] `haiku_run_next` then returns `advance_stage` (continuous) or `stage_complete_discrete` (discrete)
- [ ] On denial: agent stops, no state change

---

## Scenario 4: Await Gate

**Trigger:** Stage has `review: await` (e.g., sales proposal).

- [ ] `haiku_run_next` returns `gate_await`
- [ ] Agent reports what is being awaited
- [ ] Agent calls `haiku_stage_complete { gate_outcome: awaiting }`
- [ ] Intent blocks until user runs `/haiku:run` again
- [ ] On resume: agent confirms event occurred, then advances

---

## Scenario 5: External Gate

**Trigger:** Stage has `review: external` (e.g., product stage).

- [ ] `haiku_run_next` returns `gate_external`
- [ ] Agent pushes branch and creates PR/MR
- [ ] Agent calls `haiku_stage_complete { gate_outcome: blocked }`
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
- [ ] `haiku_run_next` returns `advance_phase` from decompose to execute

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
- [ ] `redirect-plan-mode`: blocks EnterPlanMode, suggests `/haiku:elaborate`
- [ ] `prompt-guard`: warns on injection patterns in `.haiku/` file writes
- [ ] `workflow-guard`: warns on edits outside active hat scope
- [ ] `subagent-hook`: injects H·AI·K·U context into Agent/Task/Skill calls

### PostToolUse
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
- [ ] Binary is a single file at `plugin/bin/haiku` (~500KB minified)
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
      hooks/                    # all 10 hooks in TypeScript
```

### MCP Tools (16 state/knowledge + 2 orchestrator + 4 review/visual = 22 total)

| Tool | Purpose |
|------|---------|
| `haiku_intent_get/set/list` | Read/write intent frontmatter |
| `haiku_stage_get/set/start/complete` | Read/write stage state.json |
| `haiku_unit_get/set/list/start/complete/advance_hat/increment_bolt` | Read/write unit frontmatter |
| `haiku_knowledge_list/read` | Read knowledge artifacts |
| `haiku_run_next` | Get next orchestrator action |
| `haiku_gate_approve` | Approve an ask gate |
| `open_review` | Open visual review page in the browser for an intent or unit |
| `get_review_status` | Check the status and decision of a review session |
| `ask_user_visual_question` | Ask the user questions via a rich HTML page in the browser |
| `pick_design_direction` | Open a browser-based visual picker for choosing a design direction |

### Automatic Telemetry

Every MCP state transition emits its OTEL event — no manual calls needed:

| MCP Tool | Event |
|----------|-------|
| `haiku_stage_start` | `haiku.stage.started` |
| `haiku_stage_complete` | `haiku.stage.completed` |
| `haiku_stage_set(phase)` | `haiku.stage.phase` |
| `haiku_stage_set(gate_entered_at)` | `haiku.gate.entered` |
| `haiku_unit_start` | `haiku.unit.started` |
| `haiku_unit_complete` | `haiku.unit.completed` |
| `haiku_unit_advance_hat` | `haiku.hat.transition` |
| `haiku_unit_increment_bolt` | `haiku.bolt.iteration` |
| `haiku_run_next` | `haiku.orchestrator.action` |

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
