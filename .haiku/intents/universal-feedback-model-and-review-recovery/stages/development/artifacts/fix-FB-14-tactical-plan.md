# Fix FB-14 — Tactical Plan (planner, bolt 1)

**Finding:** `useSession.ts exports bypass the typed ApiClient with hardcoded URLs`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/14-usesession-ts-exports-bypass-the-typed-apiclient-with-hardco.md`

## TL;DR

`packages/haiku-ui/src/hooks/useSession.ts` still exports four raw transport
helpers (`submitDecision`, `submitAnswers`, `submitDesignDirection`,
`tryCloseTab`) that hand-format URLs and bypass the typed `ApiClient`. The
canonical contract lives in `packages/haiku-ui/src/api/client.ts` (which in
turn routes through `paths.*` from `haiku-api` — README is emphatic: "there
are no hand-formatted paths here"). The raw helpers invalidate that contract
and will silently drift from `haiku-api/src/routes.ts`.

The fix is mechanical but multi-file:

1. Delete `submitDecision`, `submitAnswers`, `submitDesignDirection` from
   `useSession.ts`.
2. Migrate `components/ReviewSidebar.tsx` (the last remaining consumer of
   raw `submitDecision`) to `useApiClient().submitDecision(...)`.
3. Move `tryCloseTab` to a clearly-scoped side-effect helper module
   (`hooks/tryCloseTab.ts` or `lib/tryCloseTab.ts`) so it no longer sits
   alongside typed transport entry points. Drop its beacon `url` parameter —
   move the fallback beacon onto `ApiClient` or let callers pass a concrete
   path builder from `haiku-api` so the hand-formatted
   `/review/${sessionId}/decide` string in the beacon body dies.
4. Confirm `useSessionWebSocket.ts` already routes through `client.openWebSocket(...)`
   (it does — line 46 of that file reads `client.openWebSocket(sessionId)`).
   No change there, but document the confirmation so the feedback closes cleanly.

Everything else (`FooterBar.tsx`, `QuestionPage.tsx`, `DirectionPage.tsx`,
test mocks) is already on the typed client.

## Current state (verified against tree, not feedback line numbers)

Verified against the worktree on 2026-04-21:

### Raw helpers in `packages/haiku-ui/src/hooks/useSession.ts`

- Line 60-97 `submitDecision(sessionId, decision, feedback, annotations, wsRef)`
  - Tries WebSocket first when `wsRef` is provided, falls back to
    `fetch("`/review/${sessionId}/decide`")`.
- Line 101-143 `submitAnswers(sessionId, answers, wsRef, feedback, annotations)`
  - Tries WebSocket first, falls back to `fetch("`/question/${sessionId}/answer`")`.
- Line 147-178 `submitDesignDirection(sessionId, archetype, parameters, wsRef)`
  - Tries WebSocket first, falls back to `fetch("`/direction/${sessionId}/select`")`.
- Line 185-195 `tryCloseTab({ url, body })`
  - Fires `navigator.sendBeacon(url, ...)` with a caller-supplied URL and
    `window.close()` on a 200 ms timer.

### Consumers of the raw helpers

Searched with ripgrep across `packages/haiku-ui`:

| File | Import(s) | Call sites |
|---|---|---|
| `src/components/ReviewSidebar.tsx` | `submitDecision`, `tryCloseTab` | submitDecision @ L103, L152, L177; tryCloseTab @ L106, L161, L186 |
| `src/pages/direction/DirectionPage.tsx` | `tryCloseTab` only | L126 — the file already uses `client.submitDirection(...)` @ L120 |
| `src/pages/question/QuestionPage.tsx` | `tryCloseTab` only | L125 — the file already uses `client.submitAnswer(...)` @ L122 |

**Nothing imports the raw `submitAnswers` or `submitDesignDirection` anymore.**
Their removal is a pure deletion.

### Already on the typed client

- `src/pages/review/FooterBar.tsx:89` → `client.submitDecision(sessionId, {...})`
- `src/pages/question/QuestionPage.tsx:122` → `client.submitAnswer(sessionId, {...})`
- `src/pages/direction/DirectionPage.tsx:120` → `client.submitDirection(sessionId, {...})`
- All test mocks (`DirectionPage.test.tsx`, `QuestionPage.test.tsx`,
  `layout.test.tsx`, `responsive.test.tsx`, `status-announce.test.tsx`,
  `RevisitModal.test.tsx`, `parity.spec.tsx`, `skip-link.spec.tsx`,
  `use-session-websocket.test.tsx`, `a11y-pages.spec.tsx`) implement the
  typed `ApiClient` shape (`submitDecision`, `submitAnswer`, `submitDirection`)
  as `vi.fn()`.

### WebSocket injection seam (line 30 of feedback body)

`hooks/useSessionWebSocket.ts:46` reads:

```ts
const ws = client.openWebSocket(sessionId)
```

It already routes through the typed client. The `import ... from "haiku-api"`
at line 17-21 only pulls message schemas (`WsServerMessageSchema`,
`WsSessionUpdateMessage`, `WsServerMessage`) — not URL builders. That is
consistent with the injection seam: the client owns transport, the hook owns
message decoding + rAF coalescing. No bypass. The feedback body's "deserves
confirmation" note resolves as **no change needed**.

## Implementation steps (for the builder bolt)

### Step 1 — Delete three raw helpers from `useSession.ts`

Delete lines 60-178 of `packages/haiku-ui/src/hooks/useSession.ts`:

- `submitDecision` (L60-97)
- `submitAnswers` (L101-143)
- `submitDesignDirection` (L147-178)

Also delete `trySendViaWs` (L10-20) — its only callers were the three
helpers being removed. Leaving it in place is dead code.

`useSession` (the hook, L22-56) stays. `tryCloseTab` stays in this file for
now (see Step 3 for a separate question about its home).

### Step 2 — Migrate `ReviewSidebar.tsx` to the typed client

`packages/haiku-ui/src/components/ReviewSidebar.tsx` currently:

```ts
import { submitDecision, tryCloseTab } from "../hooks/useSession"
// …
await submitDecision(sessionId, "approved", "", annotations, wsRef)
```

Rewrite each call site to use the typed client. The three call sites are:

| Line | Old | New |
|---|---|---|
| 103 | `await submitDecision(sessionId, "approved", "", annotations, wsRef)` | `await client.submitDecision(sessionId, { decision: "approved", feedback: "", annotations })` |
| 152 | `await submitDecision(sessionId, "changes_requested", feedback, annotations, wsRef)` | `await client.submitDecision(sessionId, { decision: "changes_requested", feedback, annotations })` |
| 177 | `await submitDecision(sessionId, "external_review", "…", annotations, wsRef)` | `await client.submitDecision(sessionId, { decision: "external_review", feedback: "…", annotations })` |

Mechanical changes needed to support the migration:

- Add `import { useApiClient } from "../api/context"` at the top of the file
  (replacing the `submitDecision` portion of the existing import).
- Inside the `ReviewSidebar` component body, add
  `const client = useApiClient()` near the other top-of-function refs.
- Keep `tryCloseTab` import — it is still exported from `useSession.ts` for
  this bolt (see Step 3 for the separate follow-up).

**WebSocket-first path loss:** the raw `submitDecision` tried `wsRef.current?.send(JSON.stringify({ type: "decide", … }))` before falling
back to `fetch`. `ApiClient.submitDecision` is HTTP-only. The `wsRef` prop
on `ReviewSidebar` becomes **unused**. Options, in order of preference:

1. **Leave `wsRef` as a prop on the component** (for now — the caller
   `components/ReviewPage.tsx:494` still passes it), but stop threading it
   into the decision submission. Add a TODO pointing at a future
   `ApiClient.submitDecisionViaWs` method. This is the smallest change and
   keeps the diff scoped to the finding. **Pick this one.**
2. Extend `ApiClient` with an optional `openDecisionChannel(sessionId)` that
   returns a send function. Too much scope for this fix; defer.
3. Plumb the ws through `client.submitDecision`'s second arg. Changes the
   typed contract in `haiku-api` — also out of scope.

Option 1 is correct for this bolt. Note the WS-first optimization was
opportunistic (the fetch fallback always exists), so losing it is a perf
regression, not a correctness regression. The browse-app server already
accepts both transports for decide; no server-side change.

### Step 3 — Rehome `tryCloseTab`

The feedback's explicit ask (L32): "`tryCloseTab` should either move onto
the ApiClient (if it's part of the contract) or into a clearly-scoped
side-effect helper that does not appear alongside the typed entry points."

`tryCloseTab` is **not** an API call — it is a UX side-effect that:
- Schedules `window.close()` on a 200 ms timer (no-op for tabs the script
  didn't open).
- Optionally fires `navigator.sendBeacon(beacon.url, …)` as a last-ditch
  delivery when the tab is being torn down mid-submission.

Two sub-decisions:

**(3a) Where does it live?**
New file: `packages/haiku-ui/src/lib/tryCloseTab.ts`. Move the function as-is.
Update the three current importers:
- `src/components/ReviewSidebar.tsx:2`
- `src/pages/direction/DirectionPage.tsx:26`
- `src/pages/question/QuestionPage.tsx:30`

Change them all to `import { tryCloseTab } from "../lib/tryCloseTab"` (or
`"../../lib/tryCloseTab"` from the pages paths).

Then delete `tryCloseTab` from `useSession.ts`. `useSession.ts` ends up
containing only the `useSession` hook (+ the re-export of
`useSessionWebSocket`). That is the cleanest end-state and what the feedback
is asking for.

**(3b) What about the hand-formatted `beacon.url` inside the three call sites?**

The three callers all pass URL strings like:

```ts
tryCloseTab({
  url: `/review/${sessionId}/decide`,
  body: { decision: "approved", feedback: "" },
})
```

These still hand-format URLs — same dependency-direction smell as the raw
helpers, just one level out. **Fix in the same bolt** by replacing the
literal with the `paths` builder from `haiku-api`:

```ts
import { paths } from "haiku-api"
// …
tryCloseTab({
  url: paths.reviewDecide(sessionId),
  body: { decision: "approved", feedback: "" },
})
```

Similarly:
- `DirectionPage.tsx:126-133` → `url: paths.directionSelect(sessionId)`
- `QuestionPage.tsx:125-128` → `url: paths.questionAnswer(sessionId)`
- `ReviewSidebar.tsx:107, 162, 187` → `url: paths.reviewDecide(sessionId)`

After this, there are no hand-formatted HTTP paths anywhere in
`packages/haiku-ui/src/` outside of `useSession` (which is gone) and the
`lib/tryCloseTab.ts` helper — and that helper has no paths of its own, only
what callers hand it.

### Step 4 — Verify no regressions

Run from `packages/haiku-ui`:

```bash
# (a) the raw helpers are gone:
! grep -n 'export async function submitDecision\|export async function submitAnswers\|export async function submitDesignDirection' \
    src/hooks/useSession.ts

# (b) no remaining raw imports in the haiku-ui tree:
! grep -rn 'from "[^"]*hooks/useSession"' src | grep -E 'submitDecision|submitAnswers|submitDesignDirection'

# (c) no raw fetch to review/question/direction decide paths outside api/client.ts:
! grep -rn 'fetch(`/review/\|fetch(`/question/\|fetch(`/direction/' src

# (d) tests + typecheck:
npx tsc --noEmit -p tsconfig.json
npx vitest run
```

Each check must pass. The feedback-assessor hat will re-verify these
heuristics on bolt 3.

## Files the builder will modify

1. `packages/haiku-ui/src/hooks/useSession.ts` — delete
   `trySendViaWs`, `submitDecision`, `submitAnswers`,
   `submitDesignDirection`, `tryCloseTab`.
2. `packages/haiku-ui/src/lib/tryCloseTab.ts` — **new file** containing the
   `tryCloseTab` function (unchanged signature).
3. `packages/haiku-ui/src/components/ReviewSidebar.tsx` — swap three
   `submitDecision(...)` calls to `client.submitDecision(...)`; add
   `useApiClient` hook usage; update `tryCloseTab` import path; replace
   hand-formatted beacon URLs with `paths.reviewDecide(sessionId)`. Keep
   the `wsRef` prop in the signature (caller still passes it) but stop
   threading it into the decision submission; add a one-line TODO.
4. `packages/haiku-ui/src/pages/direction/DirectionPage.tsx` — update
   `tryCloseTab` import path; replace hand-formatted beacon URL with
   `paths.directionSelect(sessionId)`.
5. `packages/haiku-ui/src/pages/question/QuestionPage.tsx` — update
   `tryCloseTab` import path; replace hand-formatted beacon URL with
   `paths.questionAnswer(sessionId)`.

No test files need rewriting: all test mocks already implement the typed
`ApiClient` shape. The builder should re-run the full vitest suite to
confirm.

## Risks

- **Parallel-chain clobber on `useSession.ts`.** If another fix chain is
  editing the same file, read it immediately before writing. FB-20, FB-26,
  FB-41, and FB-47 touch the feedback/annotation/session surface area —
  mostly orthogonal, but not guaranteed orthogonal. The assessor will catch
  half-landed edits.
- **Lost WebSocket-first path on decide.** Perf regression only. The server
  has always accepted HTTP fallback. If a user complains about latency, the
  follow-up is to add an explicit `ApiClient.decideViaWs` in a later bolt —
  out of scope here.
- **`ReviewSidebar.tsx` `wsRef` prop becomes vestigial.** Kept for now
  because the caller still passes it; removing the prop from the signature
  is a caller-site change that spreads into `components/ReviewPage.tsx`. Out
  of scope for closing FB-14; worth noting as a cleanup.
- **`packages/haiku-ui/src/lib/` may not exist yet.** If so, the builder
  creates it. No other files live there today, which is fine — small utility
  files are allowed.

## Out of scope

- Rewriting `components/ReviewPage.tsx` (the monolith called out by FB-22).
  Keep diffs minimal; only touch it if an import path change forces it (it
  should not — `ReviewSidebar`'s public props are unchanged).
- Introducing a `decideViaWs` or equivalent on `ApiClient`. Future work.
- Migrating `useFeedback.ts` — that file is already on `client.feedback.*`
  per FB-47's review, not in this finding's scope.
- Killing the `wsRef` prop on `ReviewSidebar`. Safe cleanup, but separate
  bolt — touching `ReviewPage.tsx` is off-plan here.

## Done when

- `submitDecision`, `submitAnswers`, `submitDesignDirection` no longer
  appear as exported functions in `packages/haiku-ui/src/hooks/useSession.ts`.
- `ReviewSidebar.tsx` imports `useApiClient` and calls
  `client.submitDecision(sessionId, { … })` in all three places.
- `tryCloseTab` is in `packages/haiku-ui/src/lib/tryCloseTab.ts` and no
  longer appears in `hooks/useSession.ts`.
- No hand-formatted `/review/${…}/decide`, `/question/${…}/answer`, or
  `/direction/${…}/select` literals remain in
  `packages/haiku-ui/src/**/*.ts{,x}` (the `tryCloseTab` beacon URLs route
  through `paths.*`).
- `npx tsc --noEmit` and `npx vitest run` (from `packages/haiku-ui`) both
  exit 0.
- Feedback-assessor marks FB-14 resolved on bolt 3.
