# Coverage Mapping: Universal Feedback Model and Review Recovery

**Validator hat artifact** -- maps every success criterion to acceptance criteria and behavioral spec coverage.

**Status:** PROVISIONAL -- ACCEPTANCE-CRITERIA.md and features/*.feature files do not yet exist (parallel agents still running). Mappings to AC items and feature scenarios are projected based on the success criteria, discovery doc, and implementation map. This document will be updated when those artifacts land.

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

- **AC-?** = Projected acceptance criteria item (pending ACCEPTANCE-CRITERIA.md)
- **FEAT-?** = Projected feature scenario (pending features/*.feature)
- **IMPL-GN** = Implementation map group N (verified in IMPLEMENTATION-MAP.md)

| Criterion | Expected AC Items | Expected Feature Scenarios | Implementation Group | Coverage Status |
|---|---|---|---|---|
| **SC-1** Durable feedback files | AC-? Feedback file creation, AC-? File schema validation, AC-? Survival across session restart | FEAT-? "Feedback survives session restart", FEAT-? "Feedback file has correct frontmatter" | Group 1 (schema + helpers), Group 2 (MCP tool) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-2** Structural FSM gate | AC-? Gate blocks when pending > 0, AC-? Gate auto-revisits to elaborate, AC-? visits counter incremented | FEAT-? "Gate rolls to elaborate on pending feedback", FEAT-? "Gate advances normally when no feedback pending" | Group 5 (gate feedback check) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-3** enforce-iteration fix | AC-? Completion uses per-stage state.json, AC-? Multi-stage intent not prematurely completed | FEAT-? "Intent with incomplete stages stays active", FEAT-? "Intent completes only when all stages completed" | Group 9 (enforce-iteration fix) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-4** Unified feedback model | AC-? Single schema for all origins, AC-? All origins write to same directory, AC-? List tool returns items from all origins | FEAT-? "Adversarial review creates feedback file", FEAT-? "User annotation creates feedback file", FEAT-? "External PR creates feedback file", FEAT-? "Agent feedback creates feedback file" | Groups 1, 2, 6, 7, 10, 11 | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-5** Author-based guards | AC-? Agent cannot close human-authored feedback, AC-? Agent cannot delete human-authored feedback, AC-? Agent can reject only agent-authored feedback, AC-? Cannot delete pending items | FEAT-? "Agent update on human feedback blocked", FEAT-? "Agent reject on human feedback blocked", FEAT-? "Delete pending feedback blocked" | Groups 1, 3 | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-6** haiku_feedback tool + CRUD | AC-? Tool creates file and returns path, AC-? Required fields validated, AC-? Update/delete/reject/list tools exist | FEAT-? "haiku_feedback creates feedback file", FEAT-? "haiku_feedback_list filters by status", FEAT-? "CRUD lifecycle: create-list-update-reject-delete" | Groups 2, 3 | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-7** Additive elaborate mode | AC-? visits > 0 triggers additive mode, AC-? Completed units frozen, AC-? New units require closes field, AC-? closes references validated against feedback IDs | FEAT-? "Additive elaborate includes pending feedback", FEAT-? "New unit without closes rejected", FEAT-? "Completed units are read-only in additive mode" | Group 8 (additive elaborate) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-8** haiku_revisit with reasons | AC-? Reasons param writes feedback files, AC-? No reasons returns stopgap message, AC-? Feedback origin is user-chat or agent | FEAT-? "Revisit with reasons creates feedback", FEAT-? "Revisit without reasons returns guidance" | Not in implementation map as a standalone group; expected as part of orchestrator changes | PROVISIONAL -- awaiting AC/feature artifacts. **NOTE:** No dedicated implementation group exists. May need to be added to Group 5 or a new group. |
| **SC-9** Direct subagent persistence | AC-? Review subagent prompt includes haiku_feedback instructions, AC-? Subagents write findings directly, AC-? Parent instructions simplified | FEAT-? "Subagent creates feedback file directly", FEAT-? "Parent instructions reference structural gate" | Group 7 (subagent prompt update) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-10** Rename to haiku_report | AC-? Sentry tool renamed, AC-? New tool name appears in tool list, AC-? /haiku:report skill still works | FEAT-? "haiku_report in tool list", FEAT-? "haiku_feedback is no longer Sentry tool" | Group 4 (rename) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-11** Review-UI feedback writes | AC-? Annotations become individual feedback files, AC-? Origin is user-visual, AC-? Author_type is human | FEAT-? "Request Changes creates feedback files", FEAT-? "Each annotation becomes a feedback file" | Group 6 (changes_requested writes) | PROVISIONAL -- awaiting AC/feature artifacts |
| **SC-12** External changes_requested | AC-? Changes-requested detected from external review, AC-? Feedback file created with origin external-pr/mr, AC-? FSM rolls back | FEAT-? "External PR changes_requested creates feedback", FEAT-? "External MR changes_requested creates feedback" | Group 10 (external detection) | PROVISIONAL -- awaiting AC/feature artifacts |

---

## 3. Gap Flags

### Confirmed Gaps

| Gap | Criterion | Responsible Hat | Severity |
|---|---|---|---|
| **GAP-1:** `haiku_revisit` with reasons has no dedicated implementation group in IMPLEMENTATION-MAP.md | SC-8 | Architect (design stage) | MEDIUM -- the work is described in the intent but not mapped to a specific implementation group. Must be assigned before development begins. |

### Gaps Pending AC/Feature Artifacts

The following gaps cannot be confirmed or ruled out until ACCEPTANCE-CRITERIA.md and features/*.feature are produced:

| Potential Gap | Concern | Resolution |
|---|---|---|
| **PGAP-1:** Backward compatibility for existing intents with no feedback directory | Discovery mentions it (lines 216-218) but it's not an explicit success criterion. | Verify AC includes a backward-compat criterion. If missing, the analyst hat should add one. |
| **PGAP-2:** Feedback file naming collision under concurrent agents | Discovery mentions mitigation (lines 228-229) but no success criterion covers it. | Verify AC includes a concurrency-safety criterion or the feature spec covers it as an edge case. |
| **PGAP-3:** Review app feedback panel (display + CRUD integration) | Implementation Groups 11-12 cover it, but no success criterion explicitly requires a UI for feedback display. SC-11 covers writes only. | Verify AC includes a criterion for feedback display in the review UI. If missing, flag for analyst. |
| **PGAP-4:** Git commit strategy for feedback writes | Discovery mentions per-file commits (line 232-233). Not an explicit success criterion. | Verify AC covers commit behavior, or accept it as an implementation detail. |
| **PGAP-5:** Prototype visual updates | Implementation Group 13 covers it. No success criterion explicitly requires prototype updates. | Per architecture-prototype sync rule, this is mandatory. Verify AC or treat as an automatic requirement. |

---

## 4. Scope Creep Flags

Items found in the implementation map or design decisions that do not trace back to any success criterion:

| Item | Source | Assessment |
|---|---|---|
| **DESIGN-TOKENS.md** -- full Tailwind token inventory for feedback UI components | Knowledge artifact | NOT scope creep. Supports SC-11 (review-UI feedback writes) and the review app UI work in Group 12. Design tokens are a prerequisite for consistent UI implementation. |
| **Review server CRUD HTTP endpoints** (Group 11) | Implementation map | NOT scope creep. Required to support SC-11 (review-UI writes individual feedback files). The review app SPA needs a server-side API to create/read/update/delete feedback files. |
| **Prototype visual updates** (Group 13) | Implementation map | NOT scope creep. Required by the architecture-prototype sync rule in `.claude/rules/architecture-prototype-sync.md`. Any architectural change triggers a mandatory prototype update. |
| **Debounced incremental persistence of draft comments** | intent.md line 7 ("review-UI incremental persistence of draft comments as the user types") | FLAGGED -- intent.md mentions this but DISCOVERY.md explicitly calls it a "v2 enhancement" (line 142: "Comment persistence gap"). Not in any success criterion. If AC or feature specs include scenarios for this, they should be marked as v2/out-of-scope. |
| **Background external poll** | intent.md line 20 ("Out of scope for v1") | SAFE -- explicitly scoped out. If it appears in AC/features, flag for removal. |
| **Review UI auth carrying real user identity** | intent.md line 20 ("Out of scope for v1") | SAFE -- explicitly scoped out. Design Decision 7 confirms `author: "user"` flat literal for v1. |
| **Max visits cap per stage** | intent.md line 20 ("Out of scope for v1") | SAFE -- explicitly scoped out. If it appears in AC/features, flag for removal. |
| **Feedback dependency graph** | intent.md line 20 ("Out of scope for v1") | SAFE -- explicitly scoped out. If it appears in AC/features, flag for removal. |

---

## 5. Cross-Reference: Implementation Groups to Success Criteria

Every implementation group must trace to at least one success criterion.

| Group | Success Criteria | Traced? |
|---|---|---|
| Group 1: Feedback file schema + helpers | SC-1, SC-4, SC-5 | YES |
| Group 2: `haiku_feedback` MCP tool | SC-1, SC-6 | YES |
| Group 3: CRUD companion tools | SC-5, SC-6 | YES |
| Group 4: Rename to `haiku_report` | SC-10 | YES |
| Group 5: Gate-phase feedback check | SC-2 | YES |
| Group 6: changes_requested writes | SC-11 | YES |
| Group 7: Subagent prompt update | SC-9 | YES |
| Group 8: Additive elaborate mode | SC-7 | YES |
| Group 9: Enforce-iteration fix | SC-3 | YES |
| Group 10: External detection | SC-12 | YES |
| Group 11: Review server CRUD endpoints | SC-11 (prerequisite) | YES |
| Group 12: Review app UI | SC-11 (presentation) | YES |
| Group 13: Prototype updates | Mandatory per sync rule | YES (non-functional) |

All implementation groups trace to success criteria. No orphan groups.

---

## 6. Validation Decision

**APPROVED (PROVISIONAL)**

All 12 success criteria have projected coverage paths through implementation groups. The implementation map is fully traceable -- every group maps to at least one criterion, and every criterion maps to at least one group.

### Conditions for Full Approval

1. **ACCEPTANCE-CRITERIA.md must land** and be cross-checked against this matrix. Each SC-N must have at least one concrete AC item with testable acceptance conditions.
2. **features/*.feature files must land** and be cross-checked against this matrix. Each SC-N must have at least one behavioral scenario.
3. **GAP-1 (haiku_revisit with reasons)** must be assigned to an implementation group or documented as covered within an existing group.
4. **PGAP-1 through PGAP-5** must be evaluated against the final AC/feature artifacts.
5. **Out-of-scope items** (background external poll, review UI auth, max visits cap, feedback dependency graph, debounced draft persistence) must NOT appear as in-scope items in AC or feature specs.

### When to Re-Validate

This coverage mapping must be re-validated when:
- ACCEPTANCE-CRITERIA.md is written
- features/*.feature files are written
- Any success criterion is added, removed, or modified
- Any implementation group is added, removed, or restructured
