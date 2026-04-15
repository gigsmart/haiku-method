# Implementation Map: Universal Feedback Model and Review Recovery

---

## Group 1: Feedback File Schema + `writeFeedbackFile` Helper

**Complexity:** M
**Dependencies:** None (foundation for all other groups)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/state-tools.ts` | Add `writeFeedbackFile()` function (~after line 1739) that creates `.haiku/intents/{slug}/stages/{stage}/feedback/NN-{slug}.md` with frontmatter (status, origin, author, author_type, created_at, visit, source_ref, addressed_by) and markdown body; auto-increments NN from highest existing; calls `gitCommitState`. |
| `packages/haiku/src/state-tools.ts` | Add `readFeedbackFiles(intentSlug, stage)` function that returns parsed feedback items from the feedback directory (frontmatter + body + id). |
| `packages/haiku/src/state-tools.ts` | Add `countPendingFeedback(intentSlug, stage)` convenience function — returns count of items where `status: pending`. |
| `packages/haiku/src/state-tools.ts` | Add `updateFeedbackFile(intentSlug, stage, feedbackId, fields)` function that patches frontmatter fields on an existing feedback file and calls `gitCommitState`. |
| `packages/haiku/src/state-tools.ts` | Add `deleteFeedbackFile(intentSlug, stage, feedbackId)` function with guards (no delete on pending items; author_type enforcement). |

### Test Approach

- Unit tests in `test/state-tools.test.mjs`: create temp `.haiku/` structure, call `writeFeedbackFile`, verify file exists with correct frontmatter and sequential numbering. Test read, update, delete, and the pending-count function. Test guard enforcement (agent can't delete human-authored, can't delete pending).

---

## Group 2: `haiku_feedback` MCP Tool

**Complexity:** M
**Dependencies:** Group 1

### Files

| File | Change |
|---|---|
| `packages/haiku/src/state-tools.ts` | Add `haiku_feedback` to `stateToolDefs` array (~after line 2079) with inputSchema: `intent` (string, required), `stage` (string, required), `title` (string, required), `body` (string, required), `origin` (string, optional — enum), `source_ref` (string, optional), `author` (string, optional). |
| `packages/haiku/src/state-tools.ts` | Add handler in `handleStateTool()` (~after line 2281) that calls `writeFeedbackFile` and returns the file path + FB-NN identifier. |
| `packages/haiku/test/state-tools-handlers.test.mjs` | Add test cases for the `haiku_feedback` tool handler — verify tool creates feedback file, returns path, handles missing required fields. |
| `packages/haiku/test/server-tools.test.mjs` | Verify `haiku_feedback` appears in the tool list returned by the MCP server. |

### Test Approach

- Unit tests: call `handleStateTool("haiku_feedback", {...})` directly, verify file creation and response shape. Test validation (missing intent, missing title, etc.).

---

## Group 3: CRUD Companion Tools (update, delete, reject, list)

**Complexity:** M
**Dependencies:** Group 1, Group 2

### Files

| File | Change |
|---|---|
| `packages/haiku/src/state-tools.ts` | Add `haiku_feedback_update` to `stateToolDefs`: inputSchema with `intent`, `stage`, `feedback_id`, `status`, `addressed_by`. |
| `packages/haiku/src/state-tools.ts` | Add `haiku_feedback_delete` to `stateToolDefs`: inputSchema with `intent`, `stage`, `feedback_id`. |
| `packages/haiku/src/state-tools.ts` | Add `haiku_feedback_reject` to `stateToolDefs`: inputSchema with `intent`, `stage`, `feedback_id`, `reason`. Guards: only works on agent-authored feedback. |
| `packages/haiku/src/state-tools.ts` | Add `haiku_feedback_list` to `stateToolDefs`: inputSchema with `intent`, `stage` (optional), `status` (optional filter). |
| `packages/haiku/src/state-tools.ts` | Add handlers for all four tools in `handleStateTool()` — each calls the corresponding helper from Group 1. `haiku_feedback_update` enforces: agents cannot set `status: closed` on human-authored feedback. `haiku_feedback_reject` enforces: only agent-authored items rejectable by agents. `haiku_feedback_delete` enforces: can't delete pending items; author_type check. |
| `packages/haiku/test/state-tools-handlers.test.mjs` | Test each CRUD tool: create → list → update status → reject (agent-authored) → delete. Test guard enforcement (agent tries to close human-authored → error). |

### Test Approach

- Unit tests for each handler. Integration test: create 3 feedback items, list with/without status filter, update one to addressed, reject one (agent-authored), verify list reflects changes. Test all guard paths (human vs agent author_type).

---

## Group 4: Rename Existing `haiku_feedback` Sentry Tool to `haiku_report`

**Complexity:** S
**Dependencies:** Group 2 (must happen before or with Group 2 to avoid name collision)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/server.ts` | Rename tool definition at line 349: `name: "haiku_feedback"` → `name: "haiku_report"`. Update `description` to clarify it submits bug reports. |
| `packages/haiku/src/server.ts` | Rename handler check at line 416: `if (name === "haiku_feedback")` → `if (name === "haiku_report")`. |
| `plugin/skills/report/SKILL.md` | Line 12: change `haiku_feedback` → `haiku_report` in the instruction to call the tool. |
| `plugin/bin/haiku` | Update any references to `haiku_feedback` in the CLI binary (if present — grep shows it's referenced there). |
| `packages/haiku/test/server-tools.test.mjs` | Update test expectations: the Sentry tool should appear as `haiku_report`, not `haiku_feedback`. |

### Test Approach

- Verify `haiku_report` appears in tool list. Verify `haiku_feedback` is no longer the Sentry tool (it's now the feedback-file tool from Group 2). Manual: invoke `/haiku:report` skill and confirm it still works.

---

## Group 5: Gate-Phase Pending-Feedback Check + Auto-Revisit

**Complexity:** L
**Dependencies:** Group 1 (needs `countPendingFeedback`)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/orchestrator.ts` | Gate phase handler (~line 1669, at the top of the `if (phase === "gate")` block): insert a pending-feedback check before any gate logic. Call `countPendingFeedback(slug, currentStage)`. If count > 0, increment `state.visits`, set `phase: "elaborate"`, call `writeJson` to persist, and return a new action `"feedback_revisit"` with the pending count and list of pending items. |
| `packages/haiku/src/orchestrator.ts` | Add `"feedback_revisit"` case to the `withInstructions` instruction builder (~after the `"review"` case at line 3151). The instruction should tell the agent: "N pending feedback items require attention. Elaborate new units with `closes: [FB-NN]` for each. Then call `haiku_run_next`." Include the feedback item summaries in the instruction. |
| `packages/haiku/src/state-tools.ts` | Ensure `readFeedbackFiles` is exported (from Group 1) so the orchestrator can import it. |

### Test Approach

- Unit test in `test/orchestrator.test.mjs`: set up a stage at `gate` phase with pending feedback files in the feedback directory. Call `runNext`. Verify the FSM rolls to `elaborate`, `visits` is incremented, and the returned action is `feedback_revisit`. Test the zero-feedback path: no pending items → normal gate logic proceeds.

---

## Group 6: Review-UI `changes_requested` -> Feedback File Writes

**Complexity:** M
**Dependencies:** Group 1

### Files

| File | Change |
|---|---|
| `packages/haiku/src/orchestrator.ts` | In the `changes_requested` handler (~lines 3819-3828, the stage-gate `changes_requested` path): before returning the action, iterate over `reviewResult.annotations` and `reviewResult.feedback`. For each annotation/comment, call `writeFeedbackFile(slug, stage, ...)` with `origin: "user-visual"` and `author_type: "human"`. For the general feedback string, write a single feedback file with `origin: "user-chat"` if non-empty. |
| `packages/haiku/src/orchestrator.ts` | Similarly update the `elaborate_to_execute` changes_requested path (~line 3806-3818) and the intent-review changes_requested path (~line 3793-3805) to write feedback files appropriate to context. |
| `packages/haiku/src/orchestrator.ts` | Update the `changes_requested` instruction builder case (~line 3306-3319) to reference the newly-created feedback files instead of inlining annotations. |

### Test Approach

- Integration test: simulate a review session returning `changes_requested` with annotations and feedback text. Verify feedback files are created in the correct directory with correct origin and author_type fields. Verify the instruction builder references the feedback files.

---

## Group 7: Review Subagent Prompt Update (Direct `haiku_feedback` Calls)

**Complexity:** M
**Dependencies:** Group 2 (subagents need the `haiku_feedback` tool to exist)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/orchestrator.ts` | Update the `"review"` case in `withInstructions` (~lines 3128-3151). Change the subagent `<subagent>` template (~line 3142) to instruct each review agent to call `haiku_feedback` for every finding: `haiku_feedback({ intent: "${slug}", stage: "${stage}", title: "<finding title>", body: "<severity + details>", origin: "adversarial-review", author: "${agentName}" })`. Remove the "Report findings as severity/file/line/description" text-only instruction. |
| `packages/haiku/src/orchestrator.ts` | Update the parent instructions (~line 3147-3149): replace "Collect findings. If HIGH severity findings exist, fix them and re-review" with "Spawn review subagents (they persist findings via haiku_feedback). After all subagents complete, call `haiku_run_next` — the structural gate handles the rest." |

### Test Approach

- Verify the generated subagent prompt contains `haiku_feedback` call instructions. Verify parent instructions no longer reference collecting/fixing findings. Manual: run a real review cycle and confirm subagents create feedback files on disk.

---

## Group 8: Additive Elaborate Mode When `visits > 0`

**Complexity:** L
**Dependencies:** Group 1 (needs `readFeedbackFiles`), Group 5 (visits counter must exist)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/orchestrator.ts` | Elaborate phase handler (~line 1256+): after detecting `hasUnits`, check `stageState.visits`. If `visits > 0`, enter additive mode: read pending feedback via `readFeedbackFiles`, include them in the returned action payload as `pending_feedback`. Mark the action as `"additive_elaborate"`. |
| `packages/haiku/src/orchestrator.ts` | Add `"additive_elaborate"` case to `withInstructions` instruction builder: generate instructions that list all pending feedback items, state that completed units are frozen/read-only, and require new units to declare `closes: [FB-NN]` in frontmatter. |
| `packages/haiku/src/orchestrator.ts` | DAG validation block (~line 1309+): when `visits > 0`, validate that new (pending) units have `closes:` fields referencing valid feedback IDs. Existing completed units are excluded from re-validation. |

### Test Approach

- Unit test: set up a stage with `visits: 1`, some completed units, and pending feedback files. Call `runNext` in elaborate phase. Verify the returned action is `additive_elaborate` with the pending feedback payload. Verify the instruction builder includes feedback items and the `closes:` requirement. Test DAG validation: new unit without `closes:` → validation error.

---

## Group 9: Enforce-Iteration Fix

**Complexity:** S
**Dependencies:** None (independent bug fix)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/hooks/enforce-iteration.ts` | Replace the `allComplete` logic (~lines 88-131). Instead of counting completed units from `findUnitFiles()` (which globs across all stages), read `intent.md` frontmatter for the `stages:` array (declared stages). For each declared stage, read its `state.json` status. Intent is complete only when every declared stage has `state.json` status `completed`. |
| `packages/haiku/src/hooks/utils.ts` | Keep `findUnitFiles()` unchanged (other consumers may still use it for current-stage queries). Add a `readStageStatuses(intentDir)` function that returns a map of `{stage: status}` from each stage's `state.json`. |

### Test Approach

- Unit test: create a temp intent with stages [inception, development]. Set inception `state.json` status to `completed` with completed unit files. Leave development with no `state.json`. Call the enforce-iteration logic. Verify it does NOT flip intent to completed. Then set development status to `completed` and verify it does.

---

## Group 10: External PR/MR Changes-Requested Detection

**Complexity:** M
**Dependencies:** Group 1 (needs `writeFeedbackFile`)

### Files

| File | Change |
|---|---|
| `packages/haiku/src/orchestrator.ts` | In the external review check (~line 1753-1798): extend `checkExternalApproval` (line 237) to also detect `CHANGES_REQUESTED` state. Return a richer result: `{ approved: boolean, changes_requested: boolean, comments?: string[] }`. |
| `packages/haiku/src/orchestrator.ts` | When `changes_requested` is detected from external review: write a summary feedback file via `writeFeedbackFile(slug, currentStage, ...)` with `origin: "external-pr"` (or `"external-mr"` for GitLab). For v1, create a single feedback file with the review state — individual comment parsing is v2. |
| `packages/haiku/src/orchestrator.ts` | After writing the feedback file, roll the stage back to elaborate (reuse `revisitCurrentStage` or inline the phase reset) instead of returning `awaiting_external_review`. The pending-feedback gate check (Group 5) then handles the revisit cycle naturally. |

### Test Approach

- Unit test: mock `execFileSync` for `gh pr view` returning `CHANGES_REQUESTED` review decision. Verify a feedback file is created with `origin: "external-pr"`. Verify the FSM rolls back to elaborate. Test the GitLab path similarly with `glab mr view` returning non-approved state.

---

## Group 11: Review Server CRUD Endpoints

**Complexity:** M
**Dependencies:** Group 1

### Files

| File | Change |
|---|---|
| `packages/haiku/src/http.ts` | Add route handlers for: `GET /api/feedback/{intent}/{stage}` (calls `readFeedbackFiles`, returns JSON array), `POST /api/feedback/{intent}/{stage}` (calls `writeFeedbackFile`, returns created item), `PUT /api/feedback/{intent}/{stage}/{id}` (calls `updateFeedbackFile`), `DELETE /api/feedback/{intent}/{stage}/{id}` (calls `deleteFeedbackFile`). |
| `packages/haiku/src/http.ts` | Update the URL routing in the request handler (~line 226+) to match the `/api/feedback/` path pattern and dispatch to the new handlers. |
| `packages/haiku/src/http.ts` | Add Zod schemas for the POST and PUT request bodies. |

### Test Approach

- Integration test: start the HTTP server, make requests to each endpoint, verify correct responses and file system state. Test error cases: 404 for non-existent intent/stage, 400 for invalid body, 403 for author_type guard violations.

---

## Group 12: Review App UI — Feedback Display + CRUD Integration

**Complexity:** L
**Dependencies:** Group 11

### Files

| File | Change |
|---|---|
| `packages/haiku/review-app/src/components/ReviewPage.tsx` | Add a "Feedback" tab (or panel) that fetches and displays existing feedback items for the current stage via `GET /api/feedback/{intent}/{stage}`. Show each item's title, status badge, origin, author, and body. |
| `packages/haiku/review-app/src/components/ReviewSidebar.tsx` | On "Request Changes" submission (~line 69+): instead of serializing all comments into a single `feedback` string, call `POST /api/feedback/{intent}/{stage}` for each comment/annotation to create individual feedback files. Then submit the decision with a reference to the created feedback IDs. |
| `packages/haiku/review-app/src/hooks/useSession.ts` | Add `useFeedback(intent, stage)` hook that fetches feedback items from the CRUD API. Add CRUD helper functions: `createFeedback()`, `updateFeedback()`, `deleteFeedback()`. |
| `packages/haiku/review-app/src/types.ts` | Add `FeedbackItem` type interface matching the feedback file schema (id, title, body, status, origin, author, author_type, created_at, visit, source_ref, addressed_by). |
| `packages/haiku/review-app/src/components/ReviewSidebar.tsx` | Add feedback status indicators for revisit cycles: show which prior feedback items are pending vs. addressed vs. closed. |
| `packages/haiku/review-app/src/components/InlineComments.tsx` | No structural changes needed — output already flows to the sidebar. The sidebar's submission flow changes (above) handle the feedback file creation. |

### Test Approach

- Manual: open the review UI, verify the feedback panel loads and displays items. Create comments via inline selection and pin annotation, submit as "Request Changes", verify individual feedback files are created on disk. Verify feedback status badges render correctly. Test the revisit scenario: approve after feedback cycle, verify addressed items show correctly.

---

## Group 13: Prototype Visual Updates

**Complexity:** M
**Dependencies:** Groups 5, 7, 8 (needs the architectural changes to be finalized)

### Files

| File | Change |
|---|---|
| `website/public/prototype-stage-flow.html` | Update the review phase section (~line 3078): add a "pending feedback check" step between review and gate. Visualize the auto-revisit loop: review → gate (feedback check) → elaborate (if pending) → execute → review → gate. |
| `website/public/prototype-stage-flow.html` | Add `haiku_feedback` to the `TOOL_SPECS` registry with input/output/writes. Remove or rename `haiku_feedback` (Sentry) entry to `haiku_report`. Add `haiku_feedback_update`, `haiku_feedback_delete`, `haiku_feedback_reject`, `haiku_feedback_list`. |
| `website/public/prototype-stage-flow.html` | Update the `payloadFor("review", ...)` entry to reflect that subagents call `haiku_feedback` directly instead of returning findings to the parent. |
| `website/public/prototype-stage-flow.html` | Add a feedback files section to the state writes visualization — show `.haiku/intents/{slug}/stages/{stage}/feedback/` as a new artifact type. |
| `website/public/prototype-stage-flow.html` | Update the `review_findings` state field (~line 4369) — rename or augment to reflect that findings are now feedback files on disk, not an in-memory array. |
| `website/public/prototype-stage-flow.html` | Add the `visits` field to the stage state schema display. |
| `website/public/prototype-stage-flow.html` | Update the elaborate phase visualization to show additive mode (frozen completed units + new units with `closes: [FB-NN]`) when `visits > 0`. |

### Test Approach

- Visual verification: run `cd website && npm run dev`, open the prototype, verify the review-to-gate flow shows the feedback check, the auto-revisit loop is visible, tool specs are accurate, and state schemas include the new fields.

---

## Dependency Graph

```
Group 1 (schema + helpers)
  ├── Group 2 (haiku_feedback tool) ── Group 7 (subagent prompt)
  │     └── Group 3 (CRUD tools)
  ├── Group 4 (rename Sentry tool) ── must land before/with Group 2
  ├── Group 5 (gate feedback check) ── Group 8 (additive elaborate)
  ├── Group 6 (changes_requested writes)
  ├── Group 10 (external PR detection)
  └── Group 11 (HTTP endpoints) ── Group 12 (review app UI)

Group 9 (enforce-iteration fix) ── independent, no dependencies

Group 13 (prototype) ── after Groups 5, 7, 8 are finalized
```

**Critical path:** 1 → 2/4 → 5 → 8 (longest dependency chain)
**Parallelizable:** Group 9 is fully independent. Groups 6, 10, 11 depend only on Group 1 and can run in parallel after it.

---

## Test Matrix

| Group | Unit Tests | Integration Tests | Manual Verification |
|---|---|---|---|
| 1. Feedback schema + helpers | Write/read/update/delete feedback files; sequential numbering; guard enforcement (author_type, pending delete) | — | — |
| 2. `haiku_feedback` tool | Tool handler creates file, returns path; validation errors on missing fields | Tool appears in MCP tool list | — |
| 3. CRUD tools | Each handler: create→list→update→reject→delete; guard paths | — | — |
| 4. Rename to `haiku_report` | `haiku_report` in tool list; `haiku_feedback` is no longer Sentry | — | `/haiku:report` skill works end-to-end |
| 5. Gate feedback check | Gate handler with pending feedback → rolls to elaborate, increments visits; zero feedback → normal gate | Orchestrator test: full review→gate→elaborate cycle with feedback files | — |
| 6. `changes_requested` writes | Annotations + feedback string → individual feedback files created; correct origin/author_type | — | Review UI: submit "Request Changes" with annotations, verify files on disk |
| 7. Subagent prompt update | Generated prompt contains `haiku_feedback` instructions; parent instructions simplified | — | Run real review cycle: subagents create feedback files directly |
| 8. Additive elaborate | `visits > 0` returns `additive_elaborate` with pending feedback; frozen completed units; `closes:` validation | Orchestrator test: revisit cycle with new units | — |
| 9. Enforce-iteration fix | Multi-stage intent: only inception completed → NOT marked complete; all stages completed → marked complete | — | Run intent through multiple stages, verify no premature completion |
| 10. External detection | Mock `gh pr view` returning `CHANGES_REQUESTED` → feedback file created, FSM rolls back; GitLab path | — | Real PR with changes requested → agent detects and creates feedback |
| 11. Review server endpoints | — | HTTP tests: GET/POST/PUT/DELETE on `/api/feedback/` with correct responses; error cases (404, 400, 403) | — |
| 12. Review app UI | — | — | Open review UI: feedback panel loads, comments become feedback files on submit, status badges render, revisit cycle shows addressed items |
| 13. Prototype updates | — | — | Visual: prototype shows feedback check in review→gate flow, tool specs accurate, state schema includes `visits` and feedback |

---

## File Change Summary (all files)

| File | Groups | Description |
|---|---|---|
| `packages/haiku/src/state-tools.ts` | 1, 2, 3 | Feedback file CRUD helpers + tool definitions + handlers |
| `packages/haiku/src/orchestrator.ts` | 5, 6, 7, 8, 10 | Gate feedback check, changes_requested → feedback writes, subagent prompt, additive elaborate, external detection |
| `packages/haiku/src/server.ts` | 4 | Rename `haiku_feedback` → `haiku_report` (Sentry tool) |
| `packages/haiku/src/http.ts` | 11 | CRUD REST endpoints for feedback files |
| `packages/haiku/src/hooks/enforce-iteration.ts` | 9 | Fix completion check to use per-stage status |
| `packages/haiku/src/hooks/utils.ts` | 9 | Add `readStageStatuses()` helper |
| `packages/haiku/review-app/src/components/ReviewPage.tsx` | 12 | Feedback panel/tab |
| `packages/haiku/review-app/src/components/ReviewSidebar.tsx` | 12 | Individual feedback file creation on "Request Changes", status indicators |
| `packages/haiku/review-app/src/hooks/useSession.ts` | 12 | `useFeedback` hook + CRUD helpers |
| `packages/haiku/review-app/src/types.ts` | 12 | `FeedbackItem` type |
| `plugin/skills/report/SKILL.md` | 4 | Update tool name reference `haiku_feedback` → `haiku_report` |
| `plugin/bin/haiku` | 4 | Update tool name reference if present |
| `website/public/prototype-stage-flow.html` | 13 | Feedback check visualization, tool specs, state schema, additive elaborate |
| `packages/haiku/test/state-tools.test.mjs` | 1 | Feedback file helper tests |
| `packages/haiku/test/state-tools-handlers.test.mjs` | 2, 3 | Tool handler tests |
| `packages/haiku/test/server-tools.test.mjs` | 2, 4 | Tool list verification |
| `packages/haiku/test/orchestrator.test.mjs` | 5, 8 | Gate feedback check, additive elaborate |
