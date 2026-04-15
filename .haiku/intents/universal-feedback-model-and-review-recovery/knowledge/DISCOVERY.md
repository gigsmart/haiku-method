# Discovery: Universal Feedback Model and Review Recovery

## Business Context

### Problem Statement

Two concrete defects are hitting users in production:

1. **Auto-completion bug (enforce-iteration.ts:119-131).** The `findUnitFiles()` function in `packages/haiku/src/hooks/utils.ts:150-165` globs unit files across *all* stage directories under an intent. When the enforce-iteration hook checks completion at lines 119-131, it counts completed units against `unitFiles.length`. Stages that haven't been elaborated yet have zero unit files on disk, so the count only reflects the already-complete stage. The hook concludes "all complete" and flips `intent.status = completed` prematurely — while stages remain unstarted. The `cowork-mcp-apps-integration` intent was observed flipping to `completed` mid-development because of this.

2. **Adversarial review soft gap.** When the orchestrator enters the review phase (`orchestrator.ts:1597-1633`), it validates stage outputs, runs quality gates, and then immediately advances the FSM phase from `review` to `gate` (`fsmAdvancePhase` at line 1625). The return payload tells the parent agent to "run adversarial review agents" but the FSM has *already moved to gate*. Review subagent findings are relayed back only in the `withInstructions` instruction builder (line 3128-3148), which tells the parent agent: "Collect findings. If HIGH severity findings exist, fix them and re-review (up to 3 cycles). Then call `haiku_run_next`." This enforcement is purely conversational — findings live in the parent agent's context window and are lost on `/clear`, compaction, context overflow, session restart, or crash. The FSM never sees the findings and has no structural mechanism to prevent advancing past them.

### Why Now

These bugs are actively degrading the user experience. The auto-completion bug causes intents to silently close while work remains. The review soft gap means adversarial review is theater — an agent can (intentionally or accidentally) advance past HIGH-severity findings with no structural enforcement. Both bugs have been observed in real intent execution.

### Success Criteria

- Review findings persist as durable files on disk that survive session restarts, compaction, and context loss.
- The FSM structurally blocks the review-to-gate transition when pending feedback exists (no prompt-level enforcement).
- `enforce-iteration.ts` keys intent completion off per-stage `state.json` status, not a unit-file glob across all stages.
- Feedback from all sources (adversarial review subagents, external PR/MR comments, review-UI annotations, user chat, agent-generated) flows through a single unified model.
- Author-based guards prevent agents from bypassing user-authored feedback.

---

## Technical Landscape

### Entity Inventory

#### Feedback File Schema

**Location:** `.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md`

**Frontmatter fields:**
| Field | Type | Description |
|---|---|---|
| `status` | enum | `pending`, `addressed`, `closed`, `rejected` |
| `origin` | enum | `adversarial-review`, `external-pr`, `external-mr`, `user-visual`, `user-chat`, `agent` |
| `author` | string | Who wrote it — `user` for human, agent name for subagents |
| `author_type` | enum | `human`, `agent` |
| `created_at` | ISO8601 | Creation timestamp |
| `visit` | number | Which visit (stage.visits value) this feedback was created in |
| `source_ref` | string | Optional — PR URL, review agent name, annotation ID, etc. |
| `addressed_by` | string | Optional — unit slug that claims to address this feedback |

**Body:** The feedback text (markdown).

**Naming convention:** `01-descriptive-slug.md`, `02-another-finding.md`, etc. Sequential numbering within the stage's feedback directory. The `FB-NN` identifier referenced in unit `closes:` fields maps to the numeric prefix.

#### State Changes

**`state.json` (per stage):**
- Add `visits: number` — incremented each time the FSM rolls review back to elaborate due to pending feedback.

**Unit frontmatter (new field):**
- `closes: [FB-01, FB-03]` — list of feedback identifiers this unit claims to address. Used in additive elaborate mode (visits > 0).

**Intent frontmatter:** No new fields required.

### Existing Architecture — Key Code Paths

#### Review Phase Handler (`orchestrator.ts:1597-1633`)

The current flow:
1. Validate stage outputs (`validateStageOutputs`)
2. Run quality gates (`runQualityGates`) — hard gate, loops on failure
3. **Immediately** advance FSM to gate phase (`fsmAdvancePhase(slug, currentStage, "gate")` at line 1625)
4. Return `action: "review"` with instructions to spawn review subagents

**Problem:** Step 3 happens *before* review agents run. The FSM is already at `gate` when the agent receives the instruction to spawn review subagents. After agents report findings, the next `haiku_run_next` call enters the gate phase handler — the FSM never checks whether findings were addressed.

**Required change:** After review subagents complete and the parent calls `haiku_run_next`, the orchestrator must check for pending feedback files in `.haiku/intents/{slug}/stages/{stage}/feedback/`. If any have `status: pending`, roll the FSM phase back to `elaborate` and increment `visits`.

#### Gate Phase Handler (`orchestrator.ts:1653+`)

The gate handler resolves `reviewType` from the studio stage definition and decides between auto-advance, ask, external, or compound gates. It calls `_openReviewAndWait` which blocks on user input via the review UI.

**Required change:** Before entering any gate logic, check pending feedback count. If > 0, roll phase to elaborate and increment visits instead of proceeding to the gate.

#### Review Instruction Builder (`orchestrator.ts:3128-3148`)

Currently generates `<subagent>` blocks for each review agent with instructions to "Report findings as: severity (HIGH/MEDIUM/LOW), file, line, description" and parent instructions to "fix HIGH and re-review up to 3 cycles."

**Required change:** Review subagent prompts must be updated to call `haiku_feedback` directly to persist findings. The parent agent no longer collects and self-enforces findings — the feedback files ARE the enforcement mechanism. The parent's instructions become: "spawn review subagents (they will persist findings via haiku_feedback), then call haiku_run_next."

#### Elaborate Phase Handler (`orchestrator.ts:1256+`)

Handles `phase === "elaborate"` or `phase === "decompose"`. Checks if units exist, validates DAG, enforces collaborative elaboration turns.

**Required change:** When `visits > 0` (stage has been revisited due to feedback), switch to additive elaborate mode:
- Existing completed units are read-only.
- New units must declare `closes: [FB-NN]` for each pending feedback item they claim to address.
- The elaboration instruction builder must include the list of pending feedback items so the agent knows what to address.

#### Enforce-Iteration Hook (`hooks/enforce-iteration.ts`)

The `findUnitFiles()` function (`hooks/utils.ts:150-165`) searches all stage directories under an intent for unit files. The enforce-iteration hook (`enforce-iteration.ts:119-131`) uses the result to determine if all work is complete.

**Bug mechanism:** An intent with stages [inception, design, development, security] where only inception has been elaborated will have unit files only in `stages/inception/units/`. When those units complete, `unitFiles.length` equals the completed count, and the hook flips `intent.status = completed` — even though design, development, and security haven't started.

**Required fix:** Instead of globbing unit files, read each stage's `state.json` status. Intent is complete only when all declared stages (from `intent.md` frontmatter `stages:` array) have `state.json` status `completed`.

#### Changes-Requested Handler (`orchestrator.ts:3793-3828`)

When the review UI returns `changes_requested`, the orchestrator currently returns the feedback string and annotations as part of the action payload. This is consumed by the instruction builder (`orchestrator.ts:3306-3319`) which generates a `## Changes Requested` section with the feedback text.

**Required change:** When `changes_requested` is received from the review UI, the orchestrator should write each annotation/comment as a feedback file via the feedback writer (origin: `user-visual`). The rollback to elaborate then happens naturally on the next `haiku_run_next` when the pending feedback check fires.

#### Git Commit Pattern (`state-tools.ts:1715-1739`)

`gitCommitState(message)` adds the `.haiku/` root, commits, and pushes. Feedback file writes should use this same pattern to ensure feedback is persisted in git alongside other state.

#### Subagent Context (`hooks/subagent-context.ts`)

Subagents run as Claude Code `Task` tool invocations. They receive context via the `generateSubagentContext` function. **Subagents inherit MCP tool access from the parent by default** — when the `tools` field is omitted in an `AgentDefinition`, all available tools (including MCP tools) are accessible to the subagent. This is confirmed in the Claude Code subagent documentation.

**Review subagents CAN call `haiku_feedback` directly.** The subagent's prompt template should instruct them to call `haiku_feedback` for each finding as it is discovered. Findings persist the instant the subagent writes them — no parent mediation, no conversational relay. This is structurally superior: the parent agent cannot accidentally or intentionally suppress findings because the subagent wrote them directly to disk via the MCP tool.

**Implementation:** Update the review subagent `<subagent>` block template (~line 3132) to instruct each subagent to call `haiku_feedback({intent, stage, title, body, origin: "adversarial-review", author: agentName})` for every finding. The subagent returns only a summary count ("logged N findings via haiku_feedback"). The parent agent's instructions simplify to: "spawn review subagents, wait for completion, then call haiku_run_next — the structural gate handles the rest."

#### Review App Architecture (`packages/haiku/review-app/`)

The review app is a React SPA served by the HTTP server (`http.ts`). Key components:

- **ReviewPage.tsx** — Main review view with tabs (Overview, Units, Knowledge, Outputs, Domain Model)
- **ReviewSidebar.tsx** — Decision buttons (Approve, Request Changes, Submit for External Review) and comment management
- **InlineComments.tsx** — Text selection → comment creation on rendered markdown
- **AnnotationCanvas.tsx** — Pin annotation on images
- **useSession.ts** — Session fetching and decision submission (WebSocket with HTTP fallback)

**Current flow for comments:**
1. User selects text or drops pins in the review UI
2. Comments accumulate in React state (sidebar `SidebarComment[]` array)
3. On "Request Changes", all comments are serialized into a `feedback` string and `annotations` object
4. Submitted via `submitDecision()` → `POST /review/{sessionId}/decide`
5. `handleDecidePost()` in `http.ts` calls `updateSession()` which triggers `notifySessionUpdate()`
6. The waiting `_openReviewAndWait` handler resolves
7. Orchestrator receives `{ decision: "changes_requested", feedback, annotations }`
8. Feedback string and annotations are passed through to the agent via the instruction builder

**Comment persistence gap:** Comments exist only in browser React state until submission. If the user closes the tab before submitting, all comments are lost. The design calls for debounced incremental persistence of draft comments, but this is a v2 enhancement.

**Required changes for feedback integration:**
- New CRUD API endpoints for feedback files: `GET /api/feedback/{intent}/{stage}`, `POST /api/feedback/{intent}/{stage}`, `PUT /api/feedback/{intent}/{stage}/{id}`, `DELETE /api/feedback/{intent}/{stage}/{id}`
- Review UI should display existing feedback items alongside the review content
- "Request Changes" flow should write feedback files server-side, not just pass a string
- The review UI could show feedback status (pending/addressed/closed/rejected) for revisit cycles

#### Session Model (`sessions.ts`)

Sessions are in-memory only (Map with 100-cap and 30-minute TTL). Session types: `review`, `question`, `design_direction`. The `ReviewSession` interface includes `feedback: string` and `annotations?: ReviewAnnotations`.

The session model doesn't need fundamental changes — it's a transient bridge between the review UI and the orchestrator. Feedback persistence is a separate concern (files on disk).

### API Surface — New MCP Tools

#### `haiku_feedback` (create)

**Input:**
- `intent` (string, required) — intent slug
- `stage` (string, required) — stage name
- `title` (string, required) — short title for the feedback item
- `body` (string, required) — markdown body describing the finding
- `origin` (string, optional) — enum: adversarial-review, external-pr, external-mr, user-visual, user-chat, agent
- `source_ref` (string, optional) — PR URL, review agent name, etc.
- `author` (string, optional) — who created it (defaults to "agent")

**Output:** Feedback file path and FB-NN identifier

**Side effects:** Creates `.haiku/intents/{intent}/stages/{stage}/feedback/NN-{slug}.md`, calls `gitCommitState`.

**Note:** The existing `haiku_feedback` tool name in `server.ts:349` is used for Sentry bug reports ("Submit user feedback or a bug report to the H-AI-K-U team via Sentry"). This will need to be renamed to `haiku_report` or similar to free the name for the new feedback-file tool.

#### `haiku_feedback_update`

**Input:** intent, stage, feedback_id, fields to update (status, addressed_by)

**Guards:** Agents cannot change `status` to `closed` on human-authored feedback — only `addressed` or `rejected`. Only the original author_type can delete.

#### `haiku_feedback_delete`

**Input:** intent, stage, feedback_id

**Guards:** Cannot delete `status: pending` items (prevents bypass). Agent-authored items only deletable by agents. Human-authored items only deletable via review UI.

#### `haiku_feedback_reject`

**Input:** intent, stage, feedback_id, reason

**Guards:** Only works on agent-authored feedback. Human-authored feedback cannot be rejected by agents — only by the user through the review UI.

#### `haiku_feedback_list`

**Input:** intent, stage (optional — lists all stages if omitted), status filter (optional)

**Output:** Array of feedback items with frontmatter fields.

### Review Server CRUD Endpoints

New HTTP endpoints for the review app SPA:

| Method | Path | Description |
|---|---|---|
| GET | `/api/feedback/{intent}/{stage}` | List feedback items for a stage |
| POST | `/api/feedback/{intent}/{stage}` | Create a feedback item (from review UI) |
| PUT | `/api/feedback/{intent}/{stage}/{id}` | Update a feedback item |
| DELETE | `/api/feedback/{intent}/{stage}/{id}` | Delete a feedback item |

These endpoints write feedback files to disk and call `gitCommitState`. The review app uses these to persist comments as feedback files rather than holding them only in React state.

---

## Considerations and Risks

### Backward Compatibility

Existing intents have no `feedback/` directories under their stage dirs. All code that reads feedback files must handle the absent-directory case gracefully (return empty array, not throw). The `visits` field in `state.json` defaults to `0` when missing. Units without `closes:` fields work normally — the field is only required in additive elaborate mode (visits > 0).

### Review Subagent Tool Access

Review subagents are spawned as Claude Code `Task` tool invocations (confirmed in `orchestrator.ts:3142` — `<subagent tool="Task">`). **Task subagents inherit MCP tool access from the parent by default** (per Claude Code subagent documentation — tools are inherited when the `tools` field is omitted). Review subagents CAN call `haiku_feedback` directly.

**Implication:** No parent mediation needed. Each subagent writes findings directly to feedback files via the MCP tool as it discovers them. Findings persist the instant they are written — surviving parent-agent crashes, context compaction, and session restarts. The parent's only job is to spawn the subagents and call `haiku_run_next` when they're done.

### Feedback File Naming Collision

Concurrent agents writing feedback for the same stage could create files with the same numeric prefix. **Mitigation:** Use a read-then-increment pattern with the highest existing NN + 1. File creation is sequential within a single MCP server process. For concurrent processes (unlikely in normal operation), include a random suffix or timestamp in the slug.

### Git Commit Strategy

Feedback files live in `.haiku/intents/{slug}/stages/{stage}/feedback/`. The `gitCommitState` function adds the entire `.haiku/` root and commits. Each feedback write should commit individually (one commit per feedback item) to maintain clean git history and enable per-feedback rollback. Batch creation (e.g., all review agent findings at once) could use a single commit.

### Name Collision with Existing `haiku_feedback` Tool

The existing `haiku_feedback` MCP tool (`server.ts:349-371`) is a Sentry bug-report submission tool. The new feedback-file tool needs the same name for semantic clarity. **Resolution:** Rename the existing Sentry tool to `haiku_report` (and update the `/haiku:report` skill accordingly), freeing `haiku_feedback` for the new tool.

### Additive Elaborate Mode Complexity

When visits > 0, the elaborate phase must operate in additive mode: completed units are frozen, and new units must declare `closes: [FB-NN]`. This introduces complexity in the elaborate instruction builder and DAG validation. The orchestrator must:
1. Read pending feedback files and include them in the elaborate instruction.
2. Validate that new units' `closes:` references map to real feedback IDs.
3. Prevent edits to completed units from prior visits.

### External Review Integration

When external review (PR/MR) returns `changes_requested`, the orchestrator receives the signal via branch-merge detection or CLI probing (`orchestrator.ts:3779-3791`). Currently, `external_review_requested` just blocks the stage as "blocked." The feedback model extends this: when changes-requested is detected on an external review, the orchestrator (or a provider-specific handler) should create feedback files from PR review comments. This requires parsing provider-specific comment formats (GitHub review comments, GitLab MR discussions, etc.) — likely a v2 concern, with v1 creating a single feedback file summarizing the external review outcome.

### Performance

Reading feedback files on every `haiku_run_next` call adds filesystem I/O. For a stage with N feedback files, that's N file reads (frontmatter parse). **Mitigation:** Feedback files are small (frontmatter + short body). Stages rarely have more than 20 feedback items. The `readdirSync` + `readFileSync` pattern is already used extensively for unit files. No performance concern at expected scale.

---

## UI Impact

### Review App Changes

1. **Feedback panel in review UI.** When the review UI opens for a stage gate, it should display any existing feedback items (from prior visits or adversarial review). This gives the reviewer context on what was previously found and whether it was addressed.

2. **CRUD endpoints.** The review app needs server-side endpoints to create, update, and delete feedback files. Current "Request Changes" flow serializes comments into a string — new flow should write individual feedback files.

3. **Feedback status display.** Each feedback item should show its status (pending/addressed/closed/rejected) and who authored it. This is essential for revisit cycles where the reviewer needs to verify that prior feedback was addressed.

4. **Comment-to-feedback flow.** The existing InlineComments and AnnotationCanvas components create comments in React state. On submission, each comment should become a feedback file. The mapping: inline comment → feedback file with `origin: user-visual`, pin annotation → feedback file with `origin: user-visual`.

5. **Annotation canvas already exists.** The `AnnotationCanvas.tsx` component supports pin placement on images. The `InlineComments.tsx` component supports text selection → comment. These components don't need fundamental changes — they just need their output to flow to feedback files instead of being serialized into a single feedback string.

---

## Implementation Sequence (suggested)

1. **Rename existing `haiku_feedback` → `haiku_report`** — unblocks the tool name.
2. **Feedback file writer** — core function that creates feedback files with proper frontmatter, numbering, and git commit.
3. **`haiku_feedback` MCP tool** — create, backed by the writer.
4. **CRUD companions** — update, delete, reject, list tools.
5. **Review phase gate check** — in the review→gate transition, read pending feedback and roll to elaborate if any exist. Increment `visits`.
6. **Review subagent instruction update** — change parent instructions to call `haiku_feedback` per finding.
7. **Changes-requested handler** — write feedback files from review UI annotations.
8. **Additive elaborate mode** — when visits > 0, include pending feedback in elaborate instructions, require `closes:` on new units.
9. **Enforce-iteration fix** — rewrite to check per-stage `state.json` status instead of globbing unit files.
10. **Review app CRUD endpoints** — HTTP endpoints for feedback file management.
11. **Review app UI** — display feedback items, status indicators, feedback-aware comment flow.

---

## Key Files Referenced

| File | Relevance |
|---|---|
| `packages/haiku/src/orchestrator.ts` | FSM driver — review phase (1597-1633), gate phase (1653+), elaborate phase (1256+), instruction builder (2540+, 3128+), changes_requested handler (3793+), revisit (2034+) |
| `packages/haiku/src/hooks/enforce-iteration.ts` | Buggy completion check (119-131) — needs rewrite |
| `packages/haiku/src/hooks/utils.ts` | `findUnitFiles` (150-165) — the cross-stage glob that causes the bug |
| `packages/haiku/src/state-tools.ts` | Tool registration pattern (stateToolDefs at 1971+), `gitCommitState` (1715-1739), `handleStateTool` (2281+) |
| `packages/haiku/src/server.ts` | MCP server setup, existing `haiku_feedback` Sentry tool (349-371), tool routing (400-453) |
| `packages/haiku/src/sessions.ts` | Session model — review sessions with feedback/annotations |
| `packages/haiku/src/http.ts` | HTTP server routes — `handleDecidePost` (120-180), session API |
| `packages/haiku/src/hooks/subagent-context.ts` | Subagent context generation — confirms Task subagents lack MCP access |
| `packages/haiku/review-app/src/components/ReviewPage.tsx` | Review UI main view — needs feedback panel |
| `packages/haiku/review-app/src/components/ReviewSidebar.tsx` | Decision buttons and comment management — needs feedback-file integration |
| `packages/haiku/review-app/src/components/InlineComments.tsx` | Inline comment creation — output needs to flow to feedback files |
| `packages/haiku/review-app/src/hooks/useSession.ts` | Session hooks and decision submission — needs CRUD endpoint integration |
