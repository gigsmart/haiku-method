---
title: Input Validation Audit — Findings
unit: unit-02-input-validation-audit
created_at: '2026-04-15'
status: pass
---

# Input Validation Audit — Findings

## Scope

`packages/haiku/src/server.ts` — `haiku_cowork_review_submit` handler and Zod schema definitions.

## Criterion 1: `.min(1)` constraints

| Schema location | Constraint | Present? |
|---|---|---|
| `question` branch → `answers` array | `.min(1)` | YES — server.ts:1006 |
| `design_direction` branch → `archetype` string | `.min(1)` | YES — server.ts:1013 |

Evidence:
```
rg 'min(1)' packages/haiku/src/server.ts
1006: answers: z.array(QuestionAnswerSchema).min(1),
1013: archetype: z.string().min(1),
```

**PASS.**

## Criterion 2: No raw `arguments` to session updates

Data flow trace:
1. `args` (raw) → `ReviewSubmitInput.safeParse(args ?? {})` — validated
2. `parsed.success` check — returns error if invalid
3. `const input = parsed.data` — only Zod-parsed data assigned to `input`
4. All downstream calls use `input.session_id`, `input.answers`, `input.archetype`, etc. — never `args`

Verified: `updateSession`, `updateQuestionSession`, `updateDesignDirectionSession` are all called with fields from `input` (Zod-parsed), not from `args`.

**PASS.**

## Criterion 3: `session_id` UUID enforcement

All three branches: `session_id: z.string().uuid()` — rejects empty strings, path traversal attempts, non-UUID strings.

**PASS.**

## Malformed Payload Traces

| Payload | Schema response |
|---|---|
| Missing `session_type` | `discriminatedUnion` parse failure → isError response |
| `session_id: ""` | `.uuid()` validation failure → isError response |
| `feedback: "<script>alert(1)</script>"` | Accepted (string) — stored in-memory only; server templates use `escapeHtml()` |
| `answers: []` | `.min(1)` rejection → isError response |
| `session_type: "admin"` | Not a known literal → discriminatedUnion failure |

## Test Verification

`cd packages/haiku && npm test` — exit code 0.

The test suite (`packages/haiku/review-app`) includes host-bridge tests that verify `haiku_cowork_review_submit` arguments are passed through correctly in MCP mode (see `host-bridge.test.ts` lines 169–178).

## Conclusion

All audit criteria pass. The `haiku_cowork_review_submit` Zod schemas are strict and correctly structured. No unvalidated data reaches session state mutation.
