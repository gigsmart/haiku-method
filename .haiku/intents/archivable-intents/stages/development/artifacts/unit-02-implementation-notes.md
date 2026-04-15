---
unit: unit-02-implement-archive-tools-and-fsm-refusal
kind: implementation-notes
created: 2026-04-14
---

# unit-02 implementation notes

Record of what the builder hat actually shipped for `unit-02-implement-archive-tools-and-fsm-refusal`.

## Files changed

- `packages/haiku/src/orchestrator.ts` — +127 lines
  - Two new entries in `orchestratorToolDefs`: `haiku_intent_archive` and `haiku_intent_unarchive`, mirroring `haiku_intent_reset` shape (single required `intent` string)
  - Two new handler branches in `handleOrchestratorTool`: read frontmatter → idempotency short-circuit with `action: "noop"` → `setFrontmatterField` → `gitCommitState` → return success payload
  - New refusal guard in `runNext`: `if (intent.archived === true)` after the existing `status === "archived"` check and before the composite block. Returns `action: "error"` with a message containing `"unarchive"`.
- `packages/haiku/src/server.ts` — +2 lines
  - Extended the routing disjunction at `:402` with `|| name === "haiku_intent_archive" || name === "haiku_intent_unarchive"`
- `packages/haiku/test/orchestrator.test.mjs` — +145 lines, -13 lines
  - Tool-registration test for both new tools (mirrors the `haiku_intent_reset` pattern)
  - Happy-path tests for archive and unarchive setting/clearing the field without disturbing other frontmatter
  - Idempotency tests: second call returns `action: "noop"`, not `isError`
  - Field-archived refusal test: fixture with `{ archived: true }` returns `action: "error"` with "unarchive" in the message
  - Ordering regression test: fixture with `{ status: "completed", archived: true }` returns `action: "complete"` — proves completed check fires before archived-field check

## Ordering guardrail

The refusal guard sits in this order inside `runNext`:

1. `status === "completed"` → `action: "complete"`
2. `status === "archived"` → `action: "error"`
3. **NEW:** `intent.archived === true` → `action: "error"` ("unarchive first")
4. Composite handling
5. Normal stage/phase resolution

Rationale: a completed intent that happens to carry `archived: true` (e.g. archived after finishing) still terminates cleanly as completed. The status-archived branch is preserved unchanged so existing behavior for imported/legacy state stays intact. The new field-based check only fires when the intent is not completed and not status-archived.

## Verification

- `bun test` in `packages/haiku/`: 219 passed, 0 failed across 6 test files. `orchestrator.test.mjs` grew from its prior size to 36 passed / 0 failed (7 new tests).
- `bun run typecheck`: clean for all unit-02 files. Two pre-existing errors for missing generated sidecar files (`review-app-html.js`, `tailwind-generated.js`) remain — they predate this intent and come from prebuild step skipped in isolated worktrees without `node_modules`.

## One commit

Final unit-branch commit: `893d0c0a feat(haiku): add haiku_intent_archive/unarchive tools and FSM refusal`. Amended once during reviewer hat to drop an unused `intentDirPath` destructure in the unarchive-idempotency test (lint cleanup, no behavior change).
