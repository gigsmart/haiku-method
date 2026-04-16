# Coverage Mapping: Universal Feedback Model and Review Recovery

**Validator hat artifact** -- maps every success criterion to acceptance criteria and behavioral spec coverage.

**Status:** FINAL -- validated against ACCEPTANCE-CRITERIA.md (11 P0 user stories, P1 stories, edge cases, error paths) and 6 features/*.feature files.

**Validation decision:** GAPS FOUND -- see section 6.

---

## 1. Success Criteria Inventory

Source: DISCOVERY.md "Success Criteria" (lines 19-23) + intent.md description (derived requirements).

| ID | Criterion | Source |
|---|---|---|
| SC-1 | Review findings persist as durable files on disk that survive session restarts, compaction, and context loss. | DISCOVERY.md |
| SC-2 | The FSM structurally blocks the review-to-gate transition when pending feedback exists (no prompt-level enforcement). | DISCOVERY.md |
| SC-3 | `enforce-iteration.ts` keys intent completion off per-stage `state.json` status, not a unit-file glob across all stages. | DISCOVERY.md |
| SC-4 | Feedback from all sources (adversarial review, external PR/MR, review-UI, user chat, agent) flows through a single unified model. | DISCOVERY.md |
| SC-5 | Author-based guards prevent agents from bypassing user-authored feedback. | DISCOVERY.md |
| SC-6 | `haiku_feedback` MCP tool is the single write path for creating feedback files, with CRUD companions (update, delete, reject, list). | intent.md |
| SC-7 | Elaborate phase runs in additive mode when visits > 0 -- completed units read-only, new units must declare `closes: [FB-NN]`. | intent.md |
| SC-8 | `haiku_revisit` accepts optional `reasons` param that internally writes feedback files before rolling back. | intent.md |
| SC-9 | Review subagents call `haiku_feedback` directly (no parent mediation) so findings persist instantly. | intent.md / DISCOVERY.md |
| SC-10 | Existing `haiku_feedback` Sentry tool renamed to `haiku_report` to free the name. | intent.md / DISCOVERY.md |
| SC-11 | Review-UI "Request Changes" flow writes individual feedback files per annotation/comment. | DISCOVERY.md |
| SC-12 | External review `changes_requested` detection routes to feedback file creation. | intent.md / DISCOVERY.md |

---

## 2. Coverage Matrix

### Legend

- **AC-NN.NN** = Acceptance criteria item in ACCEPTANCE-CRITERIA.md
- **FEAT:file:scenario** = Feature scenario in features/*.feature
- **EC-NN** = Edge case in ACCEPTANCE-CRITERIA.md
- **EP-NN** = Error path in ACCEPTANCE-CRITERIA.md
- **IMPL-GN** = Implementation map group N

| Criterion | AC Items | Feature Scenarios | Implementation Group | Coverage Status |
|---|---|---|---|---|
| **SC-1** Durable feedback files | AC-01.1 (creation + frontmatter + gitCommitState), AC-01.2 (sequential numbering), AC-01.3 (dir auto-create), AC-01.4 (defaults), AC-08.3 (survives parent crash) | feedback-crud: "Create a feedback file", "Sequential numbering auto-increments", "Session restart does not lose feedback"; auto-revisit: "Session restart between review-agent completion and haiku_run_next", "Context compaction removes agent memory" | Groups 1, 2 | **COVERED** |
| **SC-2** Structural FSM gate | AC-03.1 (gate rolls back), AC-03.2 (no pending = normal gate), AC-03.3 (absent dir), AC-03.4 (visits persist across restart), AC-03.5 (review subagent findings trigger auto-revisit) | auto-revisit: "Gate handler rolls to elaborate", "Gate handler proceeds normally", "Mixed pending and resolved", "Agent cannot skip the feedback check", "Feedback check is the first operation", "Feedback check fires before ask/external gate type" | Group 5 | **COVERED** |
| **SC-3** enforce-iteration fix | AC-04.1 (not complete when later stages unstarted), AC-04.2 (complete when all done), AC-04.3 (missing state.json = incomplete), AC-04.4 (unit file count no longer drives) | enforce-iteration-fix: "Intent is NOT completed when only one stage is done", "Intent IS completed when all declared stages are completed", "Bug reproduction" scenarios (both the generic and cowork-mcp-apps-integration cases) | Group 9 | **COVERED** |
| **SC-4** Unified feedback model | AC-01.1 (adversarial-review origin), AC-05.2 (user-visual/user-chat origins), AC-06.1 (external-pr origin), AC-06.2 (external-mr origin), AC-01.4 (agent origin default), AC-02.1 (list returns all origins) | feedback-crud: "Create a feedback file" (adversarial-review), "Create feedback with optional source_ref" (external-pr); review-ui-feedback: "Single inline comment becomes a feedback file" (user-visual); external-review-feedback: "GitHub PR changes-requested" (external-pr), "GitLab MR" (external-mr) | Groups 1, 2, 6, 7, 10, 11 | **COVERED** |
| **SC-5** Author-based guards | AC-02.5 (agent cannot close human-authored), AC-02.6 (agent CAN mark human as addressed), AC-02.8 (delete author_type enforcement), AC-02.9 (reject agent-authored only), AC-02.10 (cannot reject human-authored) | feedback-crud: "Agent cannot set status to closed on human-authored", "Reject fails on human-authored", "Agent cannot delete human-authored", "Delete fails on a pending feedback item" | Groups 1, 3 | **COVERED** |
| **SC-6** haiku_feedback tool + CRUD | AC-01.1 (create), AC-02.1 (list), AC-02.2 (list filter), AC-02.3 (list all stages), AC-02.4 (update), AC-02.7 (delete guards), AC-02.9 (reject) | feedback-crud: full lifecycle scenarios (create, list, list-with-filter, list-across-stages, update, reject, delete) | Groups 2, 3 | **COVERED** |
| **SC-7** Additive elaborate mode | AC-07.1 (triggered when visits > 0), AC-07.2 (completed units read-only), AC-07.3 (closes field accepted), AC-07.4 (missing closes fails), AC-07.5 (invalid FB reference fails), AC-07.6 (visits=0 normal elaborate) | additive-elaborate: "First-time elaborate operates in standard mode", "Additive elaborate includes pending feedback", "New unit correctly declares closes", "New unit without closes fails", "New unit references non-existent feedback ID", "Agent attempts to edit completed unit" | Group 8 | **COVERED** |
| **SC-8** haiku_revisit with reasons | **NONE** | **NONE** | No dedicated implementation group (GAP-1 from provisional mapping -- STILL OPEN) | **GAP -- NOT COVERED** |
| **SC-9** Direct subagent persistence | AC-08.1 (subagent prompt instructs direct calls), AC-08.2 (parent instructions simplified), AC-08.3 (findings survive parent crash) | auto-revisit: "Session restart between review-agent completion and haiku_run_next" (indirect -- validates durability of subagent-written feedback) | Group 7 | **COVERED** |
| **SC-10** Rename to haiku_report | AC-09.1 (tool renamed in MCP list), AC-09.2 (/haiku:report skill works) | feedback-crud background: "And the existing Sentry tool has been renamed from haiku_feedback to haiku_report" | Group 4 | **COVERED** |
| **SC-11** Review-UI feedback writes | AC-05.1 (feedback panel display), AC-05.2 (Request Changes creates files), AC-05.3 (approve with pending confirmation), AC-05.4 (status changes from UI), AC-05.5 (sort order), AC-10.1 (annotations become files), AC-10.2 (general feedback becomes file), AC-10.3 (empty submission), AC-11.1-11.7 (CRUD endpoints) | review-ui-feedback: "Single inline comment becomes a feedback file", "Multiple comments become individual feedback files", "Pin annotation on an image", "Feedback files are written server-side", CRUD endpoint scenarios, "Review UI displays existing feedback" | Groups 6, 11, 12 | **COVERED** |
| **SC-12** External changes_requested | AC-06.1 (GitHub PR summary feedback), AC-06.2 (GitLab MR), AC-06.3 (approved = no feedback) | external-review-feedback: "GitHub PR changes-requested creates a summary feedback file", "GitHub PR approved proceeds normally", "GitLab MR non-approved state creates a feedback file", "V1 creates a single summary feedback file" | Group 10 | **COVERED** |

---

## 3. Gap Flags

### Confirmed Gaps

| Gap | Criterion | Responsible Hat | Severity | Status |
|---|---|---|---|---|
| **GAP-1:** SC-8 (`haiku_revisit` with reasons) has no AC items, no feature scenarios, and no implementation group | SC-8 | Product hat (must add AC items) → Architect (must assign implementation group) | **HIGH** -- this is an explicit success criterion from intent.md with zero coverage in ACCEPTANCE-CRITERIA.md or features/*.feature | **OPEN -- BLOCKING** |

### Required AC Items for GAP-1

The following AC items must be added to ACCEPTANCE-CRITERIA.md to cover SC-8:

1. **AC-XX.1: haiku_revisit with reasons param creates feedback files before rolling back** -- Given a stage at any phase, When `haiku_revisit({ intent, stage, reasons: ["Null check missing in parser", "Race condition in worker pool"] })` is called, Then feedback files are created for each reason (origin: "user-chat", author: "user", author_type: "human"), And the FSM rolls back to elaborate on the target stage, And visits is incremented.

2. **AC-XX.2: haiku_revisit without reasons param behaves as before** -- Given a stage at any phase, When `haiku_revisit({ intent, stage })` is called with no reasons, Then the stage rolls back to elaborate with no new feedback files created (existing behavior preserved).

3. **AC-XX.3: Reasons-created feedback enters the structural gate** -- Given feedback files were created via haiku_revisit reasons, When the stage reaches the gate phase, Then the pending-feedback check detects them and triggers auto-revisit if still pending.

### Resolved Potential Gaps (from provisional mapping)

| Former Gap | Resolution |
|---|---|
| **PGAP-1** Backward compatibility | RESOLVED -- covered by EC-01 (empty feedback dir), EC-02 (absent feedback dir), EC-09 (legacy state.json without visits field). |
| **PGAP-2** Feedback file naming collision | RESOLVED -- covered by EC-03 (concurrent writes), EC-10 (slug collision with different numeric prefix). |
| **PGAP-3** Review app feedback panel | RESOLVED -- covered by US-05 (AC-05.1 through AC-05.5) with full feedback display, status badges, sorting, and real-time updates. |
| **PGAP-4** Git commit strategy | RESOLVED -- covered by AC-01.1 (gitCommitState called on creation), AC-02.4 (gitCommitState on update), EP-01 (git commit failure handling). Accepted as implementation detail for batch vs individual commits. |
| **PGAP-5** Prototype visual updates | RESOLVED -- not in AC (correctly), mandatory per architecture-prototype sync rule. Group 13 covers it. Non-functional requirement, not a success criterion gap. |

---

## 4. Scope Creep Flags

| Item | Source | Assessment |
|---|---|---|
| **DESIGN-TOKENS.md** | Knowledge artifact | NOT scope creep. Supports SC-11 and Group 12. |
| **Review server CRUD HTTP endpoints** (Group 11, US-11) | AC + implementation map | NOT scope creep. Required for SC-11 (review app needs server-side API). |
| **Prototype visual updates** (Group 13) | Implementation map | NOT scope creep. Mandatory per architecture-prototype sync rule. |
| **Debounced incremental persistence of draft comments** | intent.md | CORRECTLY scoped as P1 (US-P1.3). Feature scenario "Reviewer closes browser tab before submitting" explicitly acknowledges "This is a known v1 limitation -- incremental persistence is v2." |
| **Background external poll** | intent.md line 20 | SAFE -- not in any P0 AC or feature. |
| **Review UI auth carrying real user identity** | intent.md line 20 | SAFE -- correctly scoped as P1 (US-P1.5). v1 uses `author: "user"` literal throughout. |
| **Max visits cap per stage** | intent.md line 20 | SAFE -- correctly scoped as P1 (US-P1.4). additive-elaborate feature "Visits counter is very high" scenario explicitly notes "No arbitrary cap on visits in v1." |
| **Feedback dependency graph** | intent.md line 20 | SAFE -- correctly scoped as P1 (US-P1.6). |
| **Individual external PR comment parsing** | intent.md / DISCOVERY.md | SAFE -- correctly scoped as P1 (US-P1.1). AC-06.1 body and external-review-feedback feature "V1 creates a single summary feedback file" scenario explicitly state v1 is summary-only. |

---

## 5. Cross-Reference: Implementation Groups to Success Criteria

| Group | Success Criteria | AC Coverage | Traced? |
|---|---|---|---|
| Group 1: Feedback file schema + helpers | SC-1, SC-4, SC-5 | US-01, US-02 | YES |
| Group 2: `haiku_feedback` MCP tool | SC-1, SC-6 | US-01, US-02 | YES |
| Group 3: CRUD companion tools | SC-5, SC-6 | US-02 | YES |
| Group 4: Rename to `haiku_report` | SC-10 | US-09 | YES |
| Group 5: Gate-phase feedback check | SC-2 | US-03 | YES |
| Group 6: changes_requested writes | SC-11 | US-10 | YES |
| Group 7: Subagent prompt update | SC-9 | US-08 | YES |
| Group 8: Additive elaborate mode | SC-7 | US-07 | YES |
| Group 9: Enforce-iteration fix | SC-3 | US-04 | YES |
| Group 10: External detection | SC-12 | US-06 | YES |
| Group 11: Review server CRUD endpoints | SC-11 (prerequisite) | US-11 | YES |
| Group 12: Review app UI | SC-11 (presentation) | US-05 | YES |
| Group 13: Prototype updates | Mandatory per sync rule | N/A (non-functional) | YES |
| **No group assigned** | **SC-8** | **NONE** | **NO -- GAP-1** |

---

## 6. Testability Assessment

Every AC item in the ACCEPTANCE-CRITERIA.md was evaluated for testability (can a concrete test be described?).

| User Story | AC Count | Testable? | Notes |
|---|---|---|---|
| US-01 (Feedback Creation) | 4 | YES | All Given/When/Then with concrete file paths, frontmatter fields, and observable side effects. |
| US-02 (CRUD) | 10 | YES | Each AC specifies exact tool inputs, expected outputs, and error messages. Guard enforcement is testable via author_type assertions. |
| US-03 (Auto-Revisit) | 5 | YES | FSM state transitions are observable via state.json reads. Action payloads are verifiable. |
| US-04 (Enforce-Iteration) | 4 | YES | Directly testable: create multi-stage intent, set stage statuses, run hook, assert intent.status. |
| US-05 (Review UI) | 5 | YES | UI assertions are testable via the CRUD API (data) and visual verification (presentation). AC-05.5 sort order is deterministic. |
| US-06 (External Detection) | 3 | YES | Mockable via CLI tool output. File creation and FSM rollback are verifiable. |
| US-07 (Additive Elaborate) | 6 | YES | DAG validation errors are deterministic. Action type and payload contents are verifiable. |
| US-08 (Subagent Writes) | 3 | YES | Prompt template content is string-matchable. Durability is verifiable via file existence after simulated crash. |
| US-09 (Sentry Rename) | 2 | YES | Tool list inspection. Skill invocation end-to-end. |
| US-10 (Changes-Requested Handler) | 3 | YES | File creation count and frontmatter fields are verifiable. Empty-submission no-op is verifiable. |
| US-11 (CRUD Endpoints) | 7 | YES | HTTP status codes, JSON response shapes, file system assertions. |
| Edge Cases (EC-01 to EC-10) | 10 | YES | Each specifies a concrete setup, trigger, and expected outcome. |
| Error Paths (EP-01 to EP-10) | 10 | YES | Each specifies a failure condition and expected behavior (error messages, partial state, recovery). |

All 72 acceptance criteria items are testable.

---

## 7. Validation Decision

**GAPS FOUND**

### Blocking Gap

**GAP-1: SC-8 (`haiku_revisit` with optional reasons param) has zero coverage.**

The intent.md explicitly states (item 6 in the design conversation summary): "`haiku_revisit` gaining optional reasons param as a convenience that internally calls the feedback writer." This is success criterion SC-8. The ACCEPTANCE-CRITERIA.md contains no user story, no AC items, and no edge cases covering this behavior. No feature file covers it either. No implementation group is assigned to it.

This gap was identified in the provisional COVERAGE-MAPPING.md as GAP-1 and the unit-01-acceptance-criteria completion criteria explicitly require: "Coverage mapping gap GAP-1 (haiku_revisit with reasons) is addressed by adding AC items for it." This condition is not met.

### What Must Happen

1. Add a new user story (e.g., US-12) to ACCEPTANCE-CRITERIA.md with at least 3 AC items covering: (a) reasons param creates feedback files, (b) no reasons param preserves existing behavior, (c) reasons-created feedback enters the structural gate cycle.
2. Add a corresponding feature file or scenarios to an existing feature file covering the haiku_revisit-with-reasons behavior.
3. Assign the implementation work to an implementation group (most likely Group 5 or a new Group 14).
4. Re-validate this coverage mapping after the additions.

### Items That Pass Validation

11 of 12 success criteria (SC-1 through SC-7, SC-9 through SC-12) have complete coverage across ACCEPTANCE-CRITERIA.md, features/*.feature, and implementation groups. All 72 existing AC items are testable. P1 items are correctly scoped. Out-of-scope items do not appear as P0 requirements. No scope creep detected.
