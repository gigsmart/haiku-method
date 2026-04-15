---
title: >-
  Visual question + design direction MCP Apps branches + submit tool
  question/design variants
type: feature
model: sonnet
depends_on:
  - unit-03-open-review-mcp-apps-branch
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ACCEPTANCE-CRITERIA.md
  - knowledge/DATA-CONTRACTS.md
  - features/iframe-decision-submit.feature
  - .haiku/knowledge/ARCHITECTURE.md
status: active
bolt: 1
hat: planner
started_at: '2026-04-15T17:02:14Z'
hat_started_at: '2026-04-15T17:02:14Z'
---

# ask_user_visual_question + pick_design_direction MCP Apps branches

## Scope

Apply the unit-03 pattern to the other two handlers: `ask_user_visual_question` (dispatch at `server.ts:462`) and `pick_design_direction` (dispatch at `server.ts:589`). Both branch on `hostSupportsMcpApps()` and return a `_meta.ui.resourceUri` tool result that awaits a decision via the `question` / `design_direction` variants of `haiku_cowork_review_submit` (the schema slots were added in unit-03; this unit wires them up end-to-end).

### In scope

- **`ask_user_visual_question` branch** at the dispatch insertion point (`server.ts:462` area, just before `startHttpServer` call). Cowork path skips HTTP/tunnel/browser, returns `_meta.ui.resourceUri`, awaits the pending-answer promise keyed on `session.session_id`, rejoins the common post-await code that reads `getSession` and emits the JSON text payload.
- **`pick_design_direction` branch** at `server.ts:589`. Cowork path skips `:646-664` (HTTP/tunnel/browser), rejoins at `:691` (common post-await). **The stage-state write at `:700-721` (`design_direction_selected`) MUST still run on the Cowork branch** — same process, same `findHaikuRoot`, same JSON shape.
- **Wire the `question` variant** of `haiku_cowork_review_submit` to resolve the visual-question pending promise with the `answers[]` / `feedback?` / `annotations?` payload.
- **Wire the `design_direction` variant** to resolve the design-direction pending promise with `archetype` / `parameters` / `comments?` / `annotations?`.
- **V5-10 host-timeout fallback** applies to both handlers identically — on `AbortSignal` fire, log the timeout event, synthesize the session's equivalent of `changes_requested` (for visual questions: empty `answers` + "Question timed out" feedback; for design direction: first archetype + default parameters + "Timed out" comment).
- **Integration tests:** per-handler round-trip on each decision variant; non-Cowork branch byte-identical.

### Out of scope

- The `review` variant of the submit tool (already done in unit-03).
- The SPA host-bridge (unit-05).
- SPA component changes — the React tree already multiplexes on `session.session_type`.
- Changes to the local HTTP path.

## Completion Criteria

1. **Both handlers branch on `hostSupportsMcpApps()`.** `rg -n 'hostSupportsMcpApps' packages/haiku/src/server.ts` returns ≥ 3 hits (unit-03's review handler + these two).
2. **MCP Apps arm skips local I/O on both handlers.** Vitest spies on `startHttpServer`, `openTunnel`, `spawn` — `callCount === 0` for each when `hostSupportsMcpApps()` is true.
3. **`ask_user_visual_question` Cowork round-trip.** Submit `{session_type: "question", session_id, answers: [...], feedback: ""}`; handler resolves with a payload byte-identical to the HTTP-path snapshot.
4. **`pick_design_direction` Cowork round-trip AND stage-state write.** Submit `{session_type: "design_direction", session_id, archetype, parameters, comments: ""}`; handler resolves, AND `getStageState().design_direction_selected` equals the submitted payload.
5. **Single polymorphic tool.** `rg "session_type: z\\.literal" packages/haiku/src/server.ts | wc -l` returns exactly `3` (review, question, design_direction).
6. **No new submit tools.** `rg 'haiku_cowork_visual_question_submit|haiku_cowork_design_direction_submit' packages/haiku/src | wc -l` returns `0`.
7. **HTTP path byte-identical.** `git diff main -- packages/haiku/src/server.ts` for the two handler bodies (non-Cowork arms) shows zero behavioral change.
8. **V5-10 fallback applies to both.** Vitest abort-after-100ms tests on both handlers assert the synthetic fallback and logged event.
9. **End-to-end stub test.** A single FSM run exercises one review gate, one visual question, and one design direction — all three resolve via `haiku_cowork_review_submit` on the same session scope.
10. **No env-var coupling.** `git diff main -- packages/haiku/src/server.ts | grep -E 'CLAUDE_CODE_IS_COWORK|isCoworkHost'` returns zero.
11. **Typecheck + lint + full test suite** clean.
