# Input Validation Audit — unit-02

**Date:** 2026-04-15
**Hat:** threat-modeler
**Unit:** unit-02-input-validation-audit

## Audit Scope

`haiku_cowork_review_submit` tool dispatch in `packages/haiku/src/server.ts` (lines 950–1116) and the session update functions in `packages/haiku/src/sessions.ts`.

## Schema Verification

| Criterion | Code Location | Result |
|---|---|---|
| `answers` array uses `.min(1)` | `server.ts:1006` — `z.array(QuestionAnswerSchema).min(1)` | PASS |
| `archetype` string uses `.min(1)` | `server.ts:1013` — `z.string().min(1)` | PASS |
| `session_id` uses `.uuid()` | `server.ts:998,1005,1012` — `z.string().uuid()` all three branches | PASS |
| `decision` uses `.enum(...)` | `server.ts:999` — `z.enum(["approved","changes_requested","external_review"])` | PASS |
| `session_type` uses discriminated union | `server.ts:995` — `z.discriminatedUnion("session_type", [...])` | PASS |
| All data to update functions flows through `parsed.data` | `server.ts:1045` — `const input = parsed.data`; all downstream calls use `input.*` | PASS |
| No raw `args` passed to `updateSession`/`updateQuestionSession`/`updateDesignDirectionSession` | Lines 1085–1114 — `input.answers`, `input.archetype`, `input.parameters`, `input.decision`, `input.feedback` exclusively | PASS |

## Malformed Payload Trace

| Payload | Expected | Actual |
|---|---|---|
| Missing `session_type` | `Invalid input: ...` (Zod) | PASS (Zod discriminated union rejects) |
| Empty `session_id` `""` | `Invalid input: ...` (`.uuid()` fails) | PASS |
| `answers: []` | `Invalid input: ...` (`.min(1)`) | PASS — confirmed by test "question answers empty array fails Zod min(1) validation" |
| `archetype: ""` | `Invalid input: ...` (`.min(1)`) | PASS — confirmed by test "design_direction empty archetype fails Zod min(1) validation" |
| XSS string in `feedback` | Accepted (feedback is free-form string) | PASS — server stores `input.feedback` as-is; no server-side rendering; SPA handles display safely |
| Bad `decision` enum | `Invalid input: ...` (`.enum(...)`) | PASS — confirmed by test "bad decision enum fails Zod validation with Invalid input prefix" |

## Test Suite Run

```
npm test — 308 passed, 0 failed across 11 test files
```

Key malformed-payload rejection tests:
- `"question answers empty array fails Zod min(1) validation"` — open-review-mcp-apps.test.mjs:860
- `"design_direction empty archetype fails Zod min(1) validation"` — open-review-mcp-apps.test.mjs:874
- `"bad decision enum fails Zod validation with Invalid input prefix"` — open-review-mcp-apps.test.mjs:832
- `"missing session_id fails Zod validation"` — open-review-mcp-apps.test.mjs:847
- `"unknown session_id returns Session not found error"` — open-review-mcp-apps.test.mjs:772

## Verdict: PASS

All DATA-CONTRACTS.md validation requirements are implemented correctly. No unvalidated `args` pass through to session update functions. Test suite exits 0.
