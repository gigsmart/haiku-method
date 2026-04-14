# Unit 06 Research — Visual Question + Design Direction Cowork Branching

Researcher hat, read-only. Unit spec line refs (`server.ts:154`/`:201`) are stale.

## 1. Current handlers (`packages/haiku/src/server.ts`)

- **`ask_user_visual_question`** — dispatch `:462`, body `:462-587`.
  `AskVisualQuestionInput.parse` (`:463`) → `createQuestionSession` (`:473`)
  → `renderQuestionPage` into `session.html` (`:488`) → `startHttpServer()`
  (`:497`) → optional `openTunnel` (`:499-504`) → `spawn open/xdg-open`
  (`:507-515`) → `waitForSession(id, 30*60*1000)` (`:520`) → read
  `getSession`, return `{status, url, answers, feedback?, annotations?}`
  text-JSON (`:542-586`).
- **`pick_design_direction`** — dispatch `:589`, body `:589-757`. Same
  shape: parse (`:590`) → resolve archetypes/parameters inline-or-file
  (`:594-627`) → `createDesignDirectionSession` (`:630`) →
  `renderDesignDirectionPage` (`:638`) → `startHttpServer` (`:646`) →
  optional tunnel (`:648-653`) → `spawn open` (`:656-664`) →
  `waitForSession` (`:669`) → writes `design_direction_selected` to stage
  state (`:700-721`) → returns conversational prose (`:727-746`).

Both are single-attempt, 30-min cap. No retry loop (unlike
`_openReviewAndWait` `:862-919`).

## 2. Cowork branch insertion points

Mirror unit-05: branch on `isCoworkHost()` **after** html assignment,
**before** `startHttpServer()`.

- Visual question: branch at `:494 → :497`. Cowork path skips `:497-515`,
  `await`s a gate promise keyed by `session.session_id`, rejoins at `:542`.
- Design direction: branch at `:643 → :646`. Cowork skips `:646-664`,
  rejoins at `:691`. The stage-state write `:700-721` **must still run** in
  Cowork mode (same process, same `findHaikuRoot`).

Return shape in Cowork: bare `{ content, _meta: { ui: { resourceUri: "ui://haiku/review/{version}" } } }` via unit-03's helper. Post-await `getSession` read produces identical JSON/prose.

## 3. SPA bridge coverage — confirmed

Unit spec's "bridge extended in unit-04 to support all three session
types" is **valid for routing** — no SPA component changes needed.
`review-app/src/App.tsx:48-103` already switches on
`session.session_type ∈ {review, question, design_direction}` rendering
`ReviewSidebar` / `QuestionPage` / `DesignPicker`. Three submit helpers
exist in `review-app/src/hooks/useSession.ts`: `submitDecision` (`:101`),
`submitAnswers` (`:139`), `submitDesignDirection` (`:176`).

Unit-04 scope for unit-06 reduces to the **host-bridge postMessage
transport** — when `isMcpAppsHost()` is true, all three helpers route
through the Cowork channel instead of WS/HTTP.

## 4. Submission tool shape — recommendation

**Single polymorphic `haiku_cowork_review_submit`.** Not three tools.

Rationale: all three SPA submits key on `session_id`; server-side
`getSession(id).session_type` already discriminates. One `ListTools` entry
+ one `CallTool` case (vs. 3× surface + 3× schema drift). Unit-05 §3
anticipates exactly one literal append. Zod `z.discriminatedUnion` on
`{session_id, type: "review"|"question"|"design_direction", data}` enforces
per-type shape without splitting the tool.

## 5. Open questions

1. Unit-05 §5.1 blocking-vs-resumable is unresolved; same
   `await waitForSession` sits in both handlers here. Unit-06 inherits
   whatever unit-05 lands. Blocks implementation parity.
2. Design direction's stage-state write (`:700-721`) must **not** be
   skipped in the Cowork branch — flag for implementer.
