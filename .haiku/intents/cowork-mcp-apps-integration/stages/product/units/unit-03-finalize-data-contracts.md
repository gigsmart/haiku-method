---
title: Finalize data contracts document
type: spec
model: sonnet
depends_on: []
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - stages/inception/units/unit-03-ui-resource-registration.md
  - stages/inception/units/unit-05-cowork-open-review-handler.md
  - stages/inception/units/unit-06-visual-question-design-direction.md
status: active
bolt: 1
hat: product
started_at: '2026-04-15T13:53:42Z'
hat_started_at: '2026-04-15T13:53:42Z'
outputs:
  - knowledge/DATA-CONTRACTS.md
---

# Finalize DATA-CONTRACTS.md

## Scope

The `data-contracts` discovery artifact at `knowledge/DATA-CONTRACTS.md` was produced during elaboration with first-pass content. This unit reviews it against the latest unit specs (which were updated mid-elaborate to drop env-var detection in favor of capability negotiation), fills in any missing schemas, and confirms every contract has explicit error responses, not just success.

In scope:
- Verify the `experimental.apps` capability shape matches the MCP spec link.
- Verify the `ui://haiku/review/{REVIEW_APP_VERSION}` resource URI pattern matches what unit-03 of inception specifies.
- Verify the `haiku_cowork_review_submit` zod `discriminatedUnion` covers all three session types and matches what unit-06 of inception specifies.
- Verify the `setOpenReviewHandler` resolved-promise contract matches what unit-05 of inception specifies (`{decision, feedback, annotations?}`).
- Add error response shapes for every documented endpoint/tool — at minimum `404 session not found` and `400 validation failed`.
- Cross-check existing schemas (`ReviewAnnotations`, `QuestionAnswer`, etc.) against `packages/haiku/src/sessions.ts` line numbers and confirm they match.

Out of scope:
- Implementing any of these contracts (that's the development stage).
- Modifying upstream unit specs.

## Completion Criteria

1. **Every contract section names its source unit** in a `Source: ` line — `unit-03-ui-resource-registration` for `ui://`, `unit-05-cowork-open-review-handler` for `setOpenReviewHandler`, `unit-06-visual-question-design-direction` for the discriminated union submit tool.
2. **Every endpoint/tool has explicit error shapes.** `grep -c '## Error' knowledge/DATA-CONTRACTS.md` ≥ count of endpoints/tools.
3. **Every schema has a corresponding line citation** for its origin file. Verified by `grep -c 'sessions.ts:' knowledge/DATA-CONTRACTS.md` ≥ count of existing schemas referenced.
4. **No env-var coupling.** `rg -n 'CLAUDE_CODE_IS_COWORK|isCoworkHost' knowledge/DATA-CONTRACTS.md` returns zero hits.
5. **TypeScript / zod syntax** for new schemas — they should be paste-ready into `packages/haiku/src/server.ts`. Verified by `grep -c 'z\.\(object\|discriminatedUnion\|literal\)' knowledge/DATA-CONTRACTS.md` ≥ 3.
6. **Validation rules summary** is present and references the touch-target floor, discriminator match, session-id existence, and decision-value enum at minimum. Verified by grep.
