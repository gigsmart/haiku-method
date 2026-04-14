# Unit 05 Research — Cowork `_openReviewAndWait` Branching

Researcher hat for `unit-05-cowork-open-review-handler`. Read-only.

## 1. Current handler anatomy (`packages/haiku/src/server.ts:768-927`)

`setOpenReviewHandler((intentDirRel, reviewType, gateType?) => ...)` registered
once at `:768`. Linear flow:

- `:770-784` parse intent/units/criteria/DAG/mermaid.
- `:786-821` `createSession(...)` + hydrate with `parsedIntent`, `parsedUnits`,
  `parsedCriteria`, `parsedMermaid`, `stageStates`, `knowledgeFiles`,
  `stageArtifacts`, `outputArtifacts`.
- `:823-833` `session.html = renderReviewPage(...)` — server-side HTML render.
- `:835` `startHttpServer()` — **local bind; Cowork branch must skip this.**
- `:836-844` optional `openTunnel(port)` behind `isRemoteReviewEnabled()`.
- `:846-859` `openBrowser()` spawn of `open`/`xdg-open` — **Cowork must skip.**

Retry loop `:862-919` — 3 attempts × `waitForSession(id, 10*60*1000)` =
30 min hard cap. On each per-attempt timeout: `getSession` check; if already
`decided` → cleanup + return. Otherwise (attempts 0/1) reopen tunnel + browser
and `continue` (`:884-900`). Post-await also re-checks `getSession` and returns
on `decided`. On attempt 2 fallthrough → `throw "Review timeout after 3 attempts
(30 min total)"` (`:925`). PR #213's presence-loss rewrite lives only in the
*website* SPA — this server-side retry loop was **not** rewritten.

Cleanup: only `clearE2EKey(id)` + `closeTunnel()` under `useRemote`, fired in
all three exit paths (`:873-876`, `:909-912`, `:921-924`). No session_id, HTTP
server, or browser-process cleanup.

Resolve shape: `{ decision, feedback, annotations }` lifted from the session
record (`:877-881`, `:913-917`).

## 2. Contract the Cowork branch must uphold

`orchestrator.ts:2827-2833` types the handler as
`(intentDir, reviewType, gateType?) => Promise<{decision: string; feedback:
string; annotations?: unknown}>`. Sole consumer: `orchestrator.ts:2995` inside
the `gate_review` action of `handleOrchestratorTool`, which branches on
`reviewResult.decision ∈ {approved, external_review, changes_requested}`
(`:3008`, `:3068`, implicit else). **The Cowork branch must resolve with the
same 3-field object at the same await site.** Unit spec's reference to
`orchestrator.ts:2091` is stale — real branching is `:2980-3067`.

## 3. `ListToolsRequestSchema` pattern (`server.ts:189-243`)

Single handler at `:189`. Tool list is an inline array:
`...orchestratorToolDefs`, `...stateToolDefs`, then hand-authored object
literals (`ask_user_visual_question` at `:196`, `pick_design_direction` later).
No registry, no builder. **Adding `haiku_cowork_review_submit` = append one
literal here + one `case` to the `CallToolRequestSchema` dispatch.**

## 4. `_meta` surface — greenfield

Zero `_meta` hits in `server.ts` today (confirmed against unit-03 research).
Every handler returns bare `{ content: [{type:"text", text}] }` literals
(`:411-417`, `:436-439`, `:745`, `:760`). Unit-05's entry tool is the first
caller of `buildUiResourceMeta()` from `ui-resource.ts` (new in unit-03).

## 5. Open questions (escalate to elaborator)

1. **Blocking vs resumable — STILL UNRESOLVED.** `unit-02-cowork-timeout-research.md §5`
   explicitly defers the Cowork tool-call ceiling to empirical measurement.
   No decision is recorded anywhere yet. Unit-05's public shape depends on
   this: `blocking` keeps one `await`; `resumable` returns `pending_review`,
   persists `cowork_review_session_id`, resolves on next FSM tick via
   `haiku_cowork_review_submit`. **Blocks the unit.**
2. Reopen-equivalent in Cowork: is there a host-side re-push (via
   `updateModelContext()`) analogous to the "reopen browser" limb, or do we
   drop the retry loop entirely in Cowork mode?
3. Cleanup: the `clearE2EKey`/`closeTunnel` pair is already gated by
   `isRemoteReviewEnabled()`, so the Cowork early-branch naturally skips it —
   confirm no other teardown is expected.
4. `logSessionEvent` at `orchestrator.ts:3001` — does it need a
   `cowork_transport: true` tag for telemetry parity, or is that out of scope?
