---
title: Extend MCP Apps path to ask_user_visual_question and pick_design_direction
type: feature
model: sonnet
depends_on:
  - unit-02-cowork-timeout-spike
  - unit-04-spa-host-bridge
  - unit-05-cowork-open-review-handler
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/unit-06-visual-question-design-direction-research.md
  - stages/inception/units/unit-04-spa-host-bridge.md
  - stages/inception/units/unit-05-cowork-open-review-handler.md
status: completed
bolt: 1
hat: elaborator
started_at: '2026-04-15T04:41:26Z'
hat_started_at: '2026-04-15T04:43:11Z'
outputs:
  - knowledge/unit-06-visual-question-design-direction-research.md
completed_at: '2026-04-15T04:45:20Z'
---

# Extend MCP Apps path to ask_user_visual_question and pick_design_direction

## Scope

Apply the unit-05 pattern to the other two HTTP+browser surfaces:
`ask_user_visual_question` (dispatch `server.ts:462`, body `:462-587`) and
`pick_design_direction` (dispatch `server.ts:589`, body `:589-757`). Same
`ui://haiku/review/{version}` resource, same host bridge (unit-04), same
`hostSupportsMcpApps()` guard from unit-01 — **not** an env-var check.

In scope:
- Branch `ask_user_visual_question` on `hostSupportsMcpApps()` at `:494 → :497`.
  MCP Apps path skips `startHttpServer` / tunnel / `open` (`:497-515`),
  returns a `_meta.ui.resourceUri` tool result, awaits the gate promise
  keyed on `session.session_id`, rejoins at `:542` to read `getSession`
  and emit the identical JSON text payload.
- Branch `pick_design_direction` on `hostSupportsMcpApps()` at `:643 → :646`.
  MCP Apps path skips `:646-664`, rejoins at `:691`. **Stage-state write
  `:700-721` (`design_direction_selected`) MUST still run on the MCP Apps
  branch** — same process, same `findHaikuRoot`, same JSON shape.
- Extend the **single** submit tool `haiku_cowork_review_submit` (added in
  unit-05) to accept a zod `discriminatedUnion` on a `session_type` field
  (`review | question | design_direction`) with a per-variant `data`
  payload. **No new submit tools.** One `ListTools` entry, one `CallTool`
  case, per-variant zod validation — matches the server-side
  `getSession(id).session_type` discriminator.
- Per-tool integration tests with spies on `startHttpServer`, `openTunnel`,
  and `spawn` asserting zero calls on the MCP Apps branch; snapshot the
  returned `_meta.ui.resourceUri` shape.

Out of scope:
- SPA component changes. `review-app/src/App.tsx:48-103` already
  multiplexes on `session.session_type` and the three
  `useSession.ts` helpers (`submitDecision :101`, `submitAnswers :139`,
  `submitDesignDirection :176`) already exist. Unit-04's host-bridge work
  for unit-06 is the **postMessage transport only** — routing all three
  helpers through the MCP Apps channel when `isMcpAppsHost()` is true.
- Changes to the local (non-MCP-Apps) HTTP path.
- Resolving the blocking-vs-resumable tool result shape — inherited from
  unit-02 / unit-05 (see Preconditions).

## Preconditions

- **Inherited from unit-02:** blocking-vs-resumable decision governs the
  MCP Apps tool-result shape (return immediately with a resume handle vs.
  `await` across the 30-min window). Default per unit-05 is **blocking**.
  Both handlers currently use `waitForSession(id, 30*60*1000)` single-
  attempt — unit-06 adopts whatever unit-05 lands. No independent decision.
- **Inherited from unit-05:** `haiku_cowork_review_submit` tool and
  `ui://haiku/review/{version}` resource exist and are wired through the
  host bridge. Unit-06 extends the zod schema only.
- **Inherited from unit-01:** `hostSupportsMcpApps()` accessor exists and
  reads negotiated capabilities — no env-var fallbacks.

## Completion Criteria

- Grep count `rg -n "startHttpServer\(" packages/haiku/src/server.ts`
  inside the MCP Apps branch of both handlers returns `0`.
- `vitest run server-visual-question-cowork.test.ts` passes with spies
  asserting `startHttpServer`, `openTunnel`, and `spawn` each called
  **0 times** when `hostSupportsMcpApps()` returns true.
- `vitest run server-design-direction-cowork.test.ts` passes with the
  same spy assertions AND asserts `getStageState().design_direction_selected`
  equals the submitted payload (stage-state write MUST fire on MCP Apps branch).
- Both MCP Apps test cases `expect(result._meta.ui.resourceUri).toBe("ui://haiku/review/{version}")` (literal version from unit-03 helper).
- Snapshot equality: non-MCP-Apps branch test for each handler diffs the
  returned text payload against a golden recorded from `main` — must match
  byte-for-byte.
- `haiku_cowork_review_submit` zod schema is one `z.discriminatedUnion`
  with exactly three `session_type` literals — verified by
  `rg -c 'session_type: z\.literal' packages/haiku/src/server.ts` equals `3`.
- End-to-end MCP Apps stub test: one FSM run exercising a review gate, a
  visual question, and a design direction in one intent — asserts each
  tool result carries `_meta.ui.resourceUri` and each submission resolves
  its awaiting promise.
- **No env-var coupling.** `rg -n "isCoworkHost|CLAUDE_CODE_IS_COWORK" packages/haiku/src/server.ts` returns zero hits in the changes touched by this unit.
