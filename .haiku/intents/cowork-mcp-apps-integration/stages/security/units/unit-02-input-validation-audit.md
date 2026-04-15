---
title: Input validation audit — haiku_cowork_review_submit Zod schemas
type: audit
model: sonnet
depends_on:
  - unit-01-threat-model-review
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - .haiku/knowledge/THREAT-MODEL.md
outputs:
  - knowledge/unit-02-input-validation-audit.md
  - stages/security/artifacts/input-validation-threat-model.md
  - stages/security/artifacts/red-team-input-validation.md
status: active
bolt: 1
hat: blue-team
started_at: '2026-04-15T19:48:49Z'
hat_started_at: '2026-04-15T19:50:32Z'
---

# Unit 02 — Input Validation Audit

Audit all Zod schemas in the `haiku_cowork_review_submit` tool dispatch path. Verify that the implementation matches the DATA-CONTRACTS.md spec and that malformed payloads are rejected before reaching any session state mutation.

## Scope

Files under audit:
- `packages/haiku/src/server.ts` — tool dispatch and Zod schema definition
- `packages/haiku/src/sessions.ts` — `updateSession`, `updateQuestionSession`, `updateDesignDirectionSession`

## Tasks

1. Locate the `ReviewSubmitInput` Zod discriminated union in `server.ts`.
2. Verify `.min(1)` constraints:
   - `answers` array in the `question` branch uses `.min(1)` (DATA-CONTRACTS.md observation 3)
   - `archetype` string in the `design_direction` branch uses `.min(1)` (DATA-CONTRACTS.md observation 4)
3. Verify no unvalidated `arguments` pass through to `updateSession` / `updateQuestionSession` / `updateDesignDirectionSession` — all data must flow through the Zod-parsed output, not the raw input object.
4. Verify `session_id` uses `z.string().uuid()` (not plain `z.string()`).
5. Manually trace malformed payloads through the dispatch logic:
   - Missing `session_type` field → rejected by discriminated union before handler
   - Empty `session_id` string (not UUID) → rejected by `.uuid()` constraint
   - XSS string in `feedback` field (`<script>alert(1)</script>`) → accepted by schema (feedback is a free-form string), but verify it never reaches `innerHTML` in any server-side template path
   - Empty `answers` array → rejected if `.min(1)` is in place; record actual behavior
6. If `.min(1)` constraints are missing, add them. If unvalidated arguments pass through to session update calls, fix before marking complete.

## Test Verification

Run `cd packages/haiku && npm test` and confirm:
- Exit code 0
- Tests covering malformed `haiku_cowork_review_submit` payloads pass (search for test names containing `invalid`, `malformed`, `empty`, or `missing` in the context of `review_submit` or `session_type`)

## Completion Criteria

- `cd packages/haiku && npm test` exits 0
- `rg 'min(1)' packages/haiku/src/server.ts` returns matches for `answers` and `archetype` Zod schemas
- No raw `arguments` object is passed directly to `updateSession`, `updateQuestionSession`, or `updateDesignDirectionSession` — only Zod-parsed values
