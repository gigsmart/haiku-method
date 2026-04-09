---
title: "Core Workflow Prompts — Discovery"
unit: unit-02-core-prompts
stage: inception
---

# Core Workflow Prompts — Discovery

Analysis of the 5 core workflow prompts (`haiku:start`, `haiku:resume`, `haiku:refine`, `haiku:review`, `haiku:reflect`) and what each needs to become an MCP prompt handler.

## 1. haiku:start

### State Read

- `haiku_settings_get { field: "studio" }` -- project-level studio constraint
- `haiku_studio_list` -- all available studios (name, description, stages, category, body)
- `haiku_studio_get { studio }` -- validate selected studio, get stages
- `haiku_intent_list` -- check for existing active intents (warn/confirm)
- Git repo check (`git rev-parse --show-toplevel`)
- Cowork mode check (`CLAUDE_CODE_IS_COWORK`)

### Arguments

| Argument | Required | Completer |
|----------|----------|-----------|
| `description` | No | None (free text) |
| `template` | No | `completeTemplate(value, context)` |
| `params` | No | None (key=value pairs) |

### Side Effects (before returning prompt)

1. **Elicitation: studio selection** -- when no project-level override and ambiguous fit, use `elicitation/create` (form mode) to ask the user to pick a studio from candidates. The server resolves this before constructing the prompt.
2. **Elicitation: active intent conflict** -- if an active intent exists, elicit whether to create new or resume existing.
3. **No mode elicitation** -- mode defaults to `continuous`; the server picks it. No user question needed.

### Side Effects (after agent executes prompt)

The prompt instructs the agent to:
1. Write `.haiku/intents/{slug}/intent.md` with frontmatter
2. Create workspace directories (`knowledge/`, `stages/`, `state/`)
3. `git add` + `git commit`
4. Call `ask_user_visual_question` to present intent direction for review
5. On approval, invoke `/haiku:resume` (continuous) or report ready (discrete)

### Message Construction

```
User: "Create a new H-AI-K-U intent: {description}"
Assistant: "I'll set up this intent. Let me configure the workspace."
User: [Full instruction payload]
  - Selected studio: {name} (stages: [...])
  - Mode: {mode}
  - Template: {if applicable, pre-filled units}
  - Instructions for writing intent.md, creating workspace
  - Instructions for visual review via ask_user_visual_question
  - Instructions for starting execution after approval
```

The server pre-resolves studio selection via elicitation. The user message payload contains the fully resolved studio, mode, and template so the agent only needs to execute file writes and visual review.

### Template Mode Specifics

When `--template` is provided:
- Server reads `plugin/studios/{studio}/templates/{name}.md` (or `.haiku/studios/` override)
- Parses `parameters:` from template frontmatter
- If required params are missing, uses elicitation to gather them
- Applies `{{ param }}` substitution
- Returns pre-filled units in the prompt payload so the agent writes them directly
- Prompt instructions include "skip elaboration -- units are pre-defined"

### Dependencies

- `prompts/completions.ts` -- for template auto-completion
- `state-tools.ts` path helpers (exported) -- for checking active intents
- Elicitation capability from the MCP SDK

---

## 2. haiku:resume

### State Read

This is the most complex prompt. It calls the orchestrator internally and constructs different prompts based on the returned action.

**Always read:**
- `haiku_intent_list` or `haiku_intent_get { slug }` -- resolve active intent
- `haiku_run_next { intent }` -- get current action from orchestrator

**Per-action additional reads:**

| Action | Additional State |
|--------|-----------------|
| `start_stage` | STAGE.md (hats, elaboration mode, inputs), hat definitions from `stages/{stage}/hats/*.md`, parent knowledge if `follows` is set |
| `decompose` | STAGE.md (elaboration mode, unit_types, criteria guidance), `stages/{stage}/discovery/*.md` definitions, upstream stage outputs (from `inputs:` field) |
| `start_unit` / `start_units` | Unit file(s) (`refs:`, criteria, description), hat definition for `first_hat`, stage artifact definitions (`discovery/*.md`, `outputs/*.md`) |
| `continue_unit` | Unit file (current hat, bolt, refs, criteria), current hat definition, stage artifact definitions |
| `advance_phase` | None beyond orchestrator response |
| `review` | Review agent definitions from `stages/{stage}/review-agents/*.md`, included agents from `review-agents-include` in STAGE.md, diff context |
| `gate_ask` | Stage summary, next stage info |
| `gate_external` | Branch info, browse URL |
| `gate_await` | What is being awaited |
| `advance_stage` | Next stage info |
| `stage_complete_discrete` | Next stage info |
| `intent_complete` | Studio info, completion summary |
| `blocked` | Blocked unit details |
| `composite_run_stage` | Same as `start_stage` but for composite |

### Arguments

| Argument | Required | Completer |
|----------|----------|-----------|
| `intent` | No | `completeIntentSlug(value)` |

### Side Effects (before returning prompt)

1. **`gate_ask` action: `open_review`** -- The server MUST call `open_review` (or check if already opened via `review_url` in orchestrator response) BEFORE returning the prompt. The prompt then instructs the agent to wait for the review decision. This is the critical visual review enforcement.
2. **`decompose` action: elaboration mode detection** -- The server reads `elaboration:` from STAGE.md and includes mode-specific instructions in the prompt.

### Elaboration Mode Behavior

The `decompose` action prompt changes based on elaboration mode:

**Collaborative (default):**
- Prompt includes multi-turn conversation instructions
- Agent MUST engage user iteratively -- ask questions, get answers, refine
- Agent MUST use `ask_user_visual_question` for rich content
- Agent MUST present final plan via `open_review` in background subagent
- Instructions are verbose with interaction patterns and tool usage rules

**Autonomous:**
- Prompt is concise -- directives without interaction patterns
- Agent MAY drive elaboration independently
- Agent SHOULD still present final plan via `open_review`
- Agent MAY skip iterative questions if upstream specs are clear

### Message Construction (per action)

**`start_stage`:**
```
User: "Run intent {slug}"
Assistant: "The orchestrator says to start stage '{stage}'."
User: [Payload]
  - Call haiku_stage_start { intent, stage }
  - If follows: load parent knowledge via haiku_knowledge_read
  - Call haiku_run_next again
```

**`decompose`:**
```
User: "Run intent {slug}"
Assistant: "Stage '{stage}' needs elaboration."
User: [Payload]
  - STAGE.md content (criteria guidance, unit_types, inputs)
  - Discovery definitions from stages/{stage}/discovery/*.md
  - Upstream stage outputs (resolved from inputs field)
  - Elaboration mode: {collaborative|autonomous}
  - [If collaborative: multi-turn conversation rules, visual tool mandates]
  - [If autonomous: concise directive to elaborate and present plan]
  - Unit writing instructions
  - open_review mandate for final plan
```

**`start_unit` / `continue_unit`:**
```
User: "Run intent {slug}"
Assistant: "Working on unit '{unit}'."
User: [Payload]
  - Hat definition (full content of stages/{stage}/hats/{hat}.md)
  - Unit content (description, completion criteria)
  - Refs: resolved artifact content (read each path in refs array)
  - Stage artifact definitions
  - MCP tools available: haiku_unit_start, haiku_unit_advance_hat, haiku_unit_reject_hat, haiku_unit_increment_bolt
  - "Call haiku_run_next when done"
```

**`start_units` (parallel):**
```
User: "Run intent {slug}"
Assistant: "{N} units ready for parallel execution."
User: [Payload]
  - For each unit: name, criteria, refs, hat definition
  - Instructions to spawn Agent per unit with worktree isolation
  - Each agent prompt template with unit-specific content inlined
  - "Wait for all, then call haiku_run_next"
```

**`review`:**
```
User: "Run intent {slug}"
Assistant: "Running adversarial review."
User: [Payload]
  - Review agent definitions (from stages/{stage}/review-agents/)
  - Included agents from review-agents-include
  - Instructions to spawn one subagent per review agent
  - Fix loop instructions (up to 3 cycles for HIGH findings)
  - haiku_stage_set phase=gate after review
```

**`gate_ask`:**
```
User: "Run intent {slug}"
Assistant: "Awaiting approval."
User: [Payload]
  - Stage summary
  - Review is already open (server called open_review)
  - "Wait for review decision"
  - If approved: haiku_gate_approve then haiku_run_next
  - If changes_requested: analyze annotations, route to refine
```

**Other actions** (`advance_phase`, `advance_stage`, `stage_complete_discrete`, `intent_complete`, `blocked`, `error`): straightforward state transitions or terminal messages. Prompt is minimal.

### Dependencies

- `orchestrator.ts` -- `runNext()` function (or call via MCP tool)
- `state-tools.ts` path helpers -- for reading STAGE.md, hat files, discovery files, unit files
- `sessions.ts` / `http.ts` -- for `open_review` side effect on `gate_ask`
- Studio/stage resolution helpers -- `resolveStudioStages`, `resolveStageHats`

---

## 3. haiku:refine

### State Read

- Active intent: `haiku_intent_get { slug }` -- status, active_stage, studio
- `haiku_stage_get { intent, stage, field: "phase" }` -- current phase
- Stage metadata: STAGE.md for the target stage (hats, inputs)
- Unit listing: `haiku_unit_list { intent, stage }` -- for unit-level refinement
- Unit details: `haiku_unit_get` -- for specific unit
- Upstream stage outputs: list completed units and their outputs for stage-scoped refinement

### Arguments

| Argument | Required | Completer |
|----------|----------|-----------|
| `target` | No | Custom completer: returns unit slugs + "stage:{name}" entries |

### Side Effects (before returning prompt)

1. **Elicitation: refinement target** -- If no argument, the server uses elicitation to ask what to refine (intent-level, specific unit, upstream stage output). For "Specific unit" it lists units; for "Upstream stage" it lists stages.

### Message Construction

**Intent-level refinement:**
```
User: "Refine intent {slug}"
Assistant: "Let me load the current intent spec."
User: [Payload]
  - Full intent.md content
  - Aspect selection instructions (criteria, spec, boundaries, domain model)
  - Write-back instructions (preserve frontmatter)
  - Re-queue instructions for affected units
```

**Unit-level refinement:**
```
User: "Refine unit {unit} in intent {slug}"
Assistant: "Let me load this unit."
User: [Payload]
  - Full unit file content
  - Same aspect selection and write-back
  - Re-queue only this unit
```

**Stage-scoped refinement:**
```
User: "Refine stage:{stage} for intent {slug}"
Assistant: "Running targeted refinement on upstream stage."
User: [Payload]
  - Target stage definition (STAGE.md)
  - Existing stage outputs (completed units and their outputs)
  - Instructions to create a new unit in the upstream stage
  - Run hat sequence for that unit only
  - Return to current stage after
```

### Dependencies

- `state-tools.ts` -- intent/unit/stage reading
- Stage resolution helpers
- Elicitation for target selection

---

## 4. haiku:review

### State Read

- Diff target: detect if inside intent worktree, determine `DIFF_BASE`
- `git diff {DIFF_BASE}...HEAD` -- full diff, stat, changed files
- `REVIEW.md` -- project review guidelines (root + directory-level)
- `CLAUDE.md` -- project instructions
- `haiku_settings_get { field: "review_agents" }` -- enabled agents config
- Intent context (optional): if in an intent worktree, load intent metadata

### Arguments

| Argument | Required | Completer |
|----------|----------|-----------|
| `intent` | No | `completeIntentSlug(value)` |

### Side Effects (before returning prompt)

1. **Compute diff** -- The server computes `git diff` against the base branch and includes the full diff, stat, and file list in the prompt payload. This avoids the agent needing to run git commands.
2. **Load review guidelines** -- Server reads REVIEW.md and CLAUDE.md and inlines them.

### Message Construction

```
User: "Review changes for intent {slug}"
Assistant: "I'll run a multi-agent code review."
User: [Payload]
  - Diff stats summary
  - Full diff content
  - REVIEW.md content
  - CLAUDE.md content
  - Review agent mandates (core: correctness, security, performance, architecture, test_quality)
  - Optional agents from settings
  - Instructions to spawn agents in parallel
  - Finding collection and deduplication rules
  - Fix loop instructions (HIGH findings -> fix -> re-review, up to 3 cycles)
  - Report format
  - Post-review options (push+PR or done)
```

### Dependencies

- Git operations (child_process `git diff`)
- File reads for REVIEW.md, CLAUDE.md
- `state-tools.ts` -- for settings

---

## 5. haiku:reflect

### State Read

- `haiku_intent_list` / `haiku_intent_get { slug }` -- intent metadata
- `haiku_unit_list { intent, stage }` -- all units across all stages
- `haiku_unit_get { intent, stage, unit, field }` -- per-unit metrics (bolt count, status)
- `haiku_stage_get { intent, stage, field }` -- stage state (phase, timestamps)
- Intent artifacts: `intent.md`, `operations.md`, `completion-criteria.md`
- Session transcripts (JSONL from Claude Code project sessions)
- `docs/solutions/` -- compound learnings (if exists)
- `haiku_settings_get { field: "workspace" }` -- org memory config

### Arguments

| Argument | Required | Completer |
|----------|----------|-----------|
| `intent` | No | `completeIntentSlug(value)` |

### Side Effects (before returning prompt)

1. **Gather metrics** -- Server pre-computes execution metrics (units completed, total bolts, studio used, blockers) and includes them in the prompt. This is a convenience -- the agent could compute these too, but pre-computing avoids redundant MCP tool calls.

### Message Construction

```
User: "Reflect on intent {slug}"
Assistant: "I'll analyze the execution cycle."
User: [Payload]
  - Intent metadata (studio, mode, dates, status)
  - Per-stage summary (phase, status, unit counts, timestamps)
  - Per-unit summary (status, bolt count, hat progression)
  - Pre-computed metrics summary
  - Instructions for session transcript analysis
  - Structured reflection template (execution patterns, criteria satisfaction, process observations, blocker analysis)
  - Compound learning aggregation instructions
  - Output format for reflection.md and settings-recommendations.md
  - Next steps options (Apply, Iterate, Close)
```

### Dependencies

- `state-tools.ts` -- extensive state reading
- Git operations -- for execution history
- File system -- for session transcripts, solution files

---

## Cross-Cutting Concerns

### Prompt Registration Pattern

All 5 prompts follow the same registration pattern from PROMPTS-SERVER-DISCOVERY.md:

```typescript
// prompts/core/start.ts
import { registerPrompt } from "../index.js"

registerPrompt({
  name: "haiku:start",
  title: "Start Intent",
  description: "Start a new H-AI-K-U intent",
  arguments: [...],
  handler: async (args) => {
    // 1. Read state
    // 2. Execute side effects (elicitation, open_review)
    // 3. Construct messages
    return { messages: [...] }
  }
})
```

### File Organization

```
packages/haiku/src/prompts/
  index.ts           -- registry (from unit-01)
  types.ts           -- PromptDef (from unit-01)
  completions.ts     -- completion providers (from unit-01)
  core/
    new.ts           -- haiku:start handler
    run.ts           -- haiku:resume handler (largest file)
    refine.ts        -- haiku:refine handler
    review.ts        -- haiku:review handler
    reflect.ts       -- haiku:reflect handler
```

### Shared Filesystem Reads

All 5 prompts need access to the same filesystem helpers. Per PROMPTS-SERVER-DISCOVERY.md, these are exported from `state-tools.ts`:

- `findHaikuRoot()` -- locate `.haiku/` directory
- `intentDir(slug)` -- path to intent directory
- `stageDir(slug, stage)` -- path to stage directory
- `unitPath(slug, stage, unit)` -- path to unit file
- `readFrontmatter(path)` -- parse YAML frontmatter from markdown
- `readJson(path)` -- parse JSON file

Additionally, prompts need studio/stage resolution helpers from `orchestrator.ts`:
- `resolveStudioStages(studio)` -- get stage list for a studio
- `resolveStageHats(studio, stage)` -- get hat list for a stage
- `resolveStageReview(studio, stage)` -- get review type for a stage

These are currently not exported. They need to be exported or extracted to a shared module.

### Elicitation vs. Visual Review

The prompts use two different user-interaction mechanisms:

| Mechanism | Used By | Purpose |
|-----------|---------|---------|
| **Elicitation** (form mode) | `haiku:start` (studio picker, active intent conflict), `haiku:refine` (target picker) | Structured questions with known option sets. Server asks user directly via MCP client UI. Blocks until answer. |
| **open_review** (browser page) | `haiku:resume` (gate_ask, elaboration plan) | Rich content review with annotations, inline comments, design review. Uses HTTP server + templates. |
| **ask_user_visual_question** (browser page) | `haiku:start` (direction review), `haiku:resume` (decompose -- rich questions) | Rich content questions with markdown rendering, images, structured input. Uses HTTP server + templates. |

The server handles elicitation directly (no agent involvement). Visual review and visual questions are side effects the server triggers, then the prompt instructs the agent to wait for the result.

### Error Handling

All prompts need consistent error handling:

| Scenario | Response |
|----------|----------|
| No `.haiku/` directory | Return error message in prompt: "No H-AI-K-U workspace found. Run /haiku:start to create one." |
| Intent not found | Return error: "Intent '{slug}' not found." |
| Intent completed | Return error: "Intent is already completed." |
| Cowork mode | Return error: "Cannot run in cowork mode." (for new, run, refine) |
| No git repo | Return error: "Must be in a git repository." (for new, review) |
| No diff | Return informational: "No changes to review." (for review) |

Errors are returned as `GetPromptResult` with a single user message containing the error text, not thrown as exceptions. This keeps the agent conversation clean.

---

## Technical Risks

| Risk | Severity | Affected Prompts | Mitigation |
|------|----------|-----------------|------------|
| `haiku:resume` handler size | High | run | The run handler dispatches 12+ action types with different state reads and message construction. Risk of becoming a monolithic file. Mitigate by extracting per-action builders into separate functions or files. |
| Orchestrator coupling | Medium | run | The prompt handler calls `runNext()` directly (in-process), not via MCP tool call. This is efficient but couples the prompts module to orchestrator internals. If orchestrator changes its return shape, prompts break. Mitigate by using the existing `OrchestratorAction` interface as a contract. |
| Side effect ordering for gate_ask | High | run | The server MUST call `open_review` BEFORE returning the prompt. If the HTTP server fails to start or the session creation fails, the prompt can't be returned. Mitigate by falling back to a text-only gate prompt if visual review fails. |
| Diff size in review prompt | Medium | review | Large diffs could exceed message size limits. The current skill has the agent run `git diff` itself. If the server pre-computes it, very large diffs need truncation or chunking. Mitigate by setting a size limit and truncating with a "diff too large, agent should read files individually" note. |
| Elicitation SDK support | Medium | new, refine | Elicitation (`elicitation/create`) requires SDK and client support. If the SDK version or client doesn't support it, fall back to including the question in the prompt and letting the agent ask. |
| Session transcript access | Low | reflect | Session logs are in a platform-specific directory. The path may not be accessible from the MCP server process. Mitigate by having the prompt instruct the agent to read transcripts (agent has file access). |
| Shared helpers not exported | Low | all | `state-tools.ts` path helpers and `orchestrator.ts` resolution helpers are currently not exported. The extraction is straightforward but must be done carefully to avoid breaking existing tool handlers. |

---

## Complexity Ranking

1. **`haiku:resume`** -- Most complex by far. 12+ action types, each with different state reads, different message payloads, side effects (open_review for gate_ask), elaboration mode branching. Estimated ~400-600 lines.
2. **`haiku:review`** -- Medium complexity. Needs git diff computation, review agent loading, multi-agent prompt construction. Estimated ~150-200 lines.
3. **`haiku:reflect`** -- Medium complexity. Extensive state reading across all stages/units, metrics computation, session analysis instructions. Estimated ~150-200 lines.
4. **`haiku:start`** -- Medium-low complexity. Studio resolution with elicitation fallback, template mode, workspace creation instructions. Estimated ~100-150 lines.
5. **`haiku:refine`** -- Lowest complexity. Target resolution with elicitation, load target artifact, construct refinement instructions. Estimated ~80-120 lines.
