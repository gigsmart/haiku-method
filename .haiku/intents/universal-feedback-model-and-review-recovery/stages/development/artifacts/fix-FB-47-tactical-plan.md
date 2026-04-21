# Fix FB-47 — Tactical Plan (planner, bolt 1)

**Finding:** `useFeedback` triggers full-list refetch after every mutation, with
no optimistic update path. Compounded by synchronous server-side dir-scan on
`GET /api/feedback/:intent/:stage`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/47-usefeedback-every-mutation-triggers-full-list-refetch-no-opt.md`

## Root cause

`packages/haiku-ui/src/hooks/useFeedback.ts` calls `await fetchFeedback()` at
the end of each of `createFeedback` (line 59), `updateFeedback` (line 84), and
`deleteFeedback` (line 105). `fetchFeedback` hits `GET /api/feedback/:intent/:stage`,
which on the server (`packages/haiku/src/http.ts:1095`) calls
`readFeedbackFiles`, a synchronous `readdirSync` + per-file `readFileSync` +
`gray-matter` parse over the whole feedback directory.

The client already knows exactly what changed:
- `createFeedback` — added one item (the response already carries `feedback_id`;
  extending the response to include the projected item is a minor server change).
- `updateFeedback` — changed `status` / `closed_by` on one existing item.
- `deleteFeedback` — removed one item by id.

Refetching N items to reflect a known single-row change is the HTTP analog of
an N+1 query and violates both the "no unbounded fetches" rule and the
"caching with correct invalidation" rule from the performance mandate. It also
blocks the Node event loop (synchronous IO) on every mutation, stalling
concurrent HTTP/WebSocket traffic in the MCP server.

## Fix approach

Apply the feedback body's **Suggested fix #1 (client-side optimistic update)**
as the primary win. This fix is local to the hook, needs no server change, and
eliminates the full-list refetch for the two highest-frequency mutations
(`updateFeedback`, `deleteFeedback`) — which is the exact triage scenario the
feedback body calls out.

- **`updateFeedback`** — splice the changed fields into the matching item in
  local `items` state immediately on 2xx. The server response
  (`FeedbackUpdateResponse`) carries `updated_fields: string[]` and the request
  body already carries the new `status` / `closed_by` values, so the client
  has everything it needs to reconcile without a GET.
- **`deleteFeedback`** — `setItems((prev) => prev.filter((i) => i.feedback_id !== feedbackId))`
  on 2xx. No server echo needed — the id on the request path is authoritative.
- **`createFeedback`** — **keep the refetch** for v1. The POST response today
  is `{ feedback_id, file, status: "pending", message }` and does not include
  the projected `FeedbackItem` the list needs (`title`, `body`, `origin`,
  `author`, `author_type`, `created_at`, `visit`, `source_ref`, `closed_by`).
  The client would have to synthesize these fields and guess the
  `created_at` timestamp; a subsequent GET would then prove the client's guess
  wrong and reshuffle ordering. Keeping the refetch on create is the
  lower-risk v1 choice — and create is low-frequency compared to update/delete
  in the triage scenario. A follow-up feedback may extend
  `FeedbackCreateResponseSchema` to echo the projected item; that is **out of
  scope here**.

**Error reconciliation:** On 4xx/5xx (thrown before the optimistic splice can
run), `items` is untouched and the caller surfaces the thrown error. No stale
optimistic state is ever visible because the mutation runs *before* the state
update — if the fetch throws, we never splice.

**Why not touch the server?** The feedback body lists four options and invites
"pick a layer". Options 2-4 (return updated item, ETag, dir-scan cache) all
require server edits that would ship under the wrong unit's scope — FB-47 is
flagged as a client/server pair but the actionable fix within one bolt is the
client optimistic path. Server-side caching/ETag is a proper performance pass
that belongs in its own feedback if we want it. Keep scope tight.

## Files to modify

1. **`packages/haiku-ui/src/hooks/useFeedback.ts`** (one hunk, three-way change)
   - Replace `await fetchFeedback()` on line 84 (`updateFeedback` success path)
     with an optimistic `setItems` splice that applies `fields.status` and
     `fields.closed_by` to the matching `feedback_id`. Preserve the existing
     `return result` so callers continue to receive the server ack.
   - Replace `await fetchFeedback()` on line 105 (`deleteFeedback` success
     path) with `setItems((prev) => prev.filter((i) => i.feedback_id !== feedbackId))`.
     Preserve `return result`.
   - **Leave** `await fetchFeedback()` on line 59 (`createFeedback`) in place
     with a one-line comment explaining why (response shape doesn't carry the
     projected item yet — see FB-47 follow-up).
   - Drop `fetchFeedback` from the `useCallback` deps array on `updateFeedback`
     and `deleteFeedback` since they no longer reference it. `createFeedback`
     keeps `fetchFeedback` in its deps.
   - Keep the existing hook return shape unchanged (`items`, `loading`,
     `error`, `refetch`, `createFeedback`, `updateFeedback`, `deleteFeedback`).
     Consumers (`useFeedbackSidebarController`) rely on exactly these names.

2. **`packages/haiku-ui/src/hooks/__tests__/useFeedback.test.tsx`** (new file)
   - Test 1: `updateFeedback` splices the status change without calling GET.
     Mock `fetch` so the initial mount GET returns a list, then assert that
     after `result.current.updateFeedback(id, { status: "closed" })` resolves:
     (a) `fetch` was called exactly twice total (initial GET + PUT, no second
     GET), and (b) `result.current.items.find(i => i.feedback_id === id)?.status
     === "closed"`.
   - Test 2: `deleteFeedback` removes the item locally without calling GET.
     Same harness. After delete resolves, `items` should not contain the
     deleted id and `fetch` count is initial-GET + DELETE only.
   - Test 3: `createFeedback` still refetches (regression guard for the
     deliberate v1 choice). `fetch` count after create resolves = initial GET
     + POST + refetch GET.
   - Test 4: `updateFeedback` that throws (server 409/404) does NOT mutate
     `items`. The optimistic splice only runs on 2xx.
   - Use `@testing-library/react` + `renderHook` + `act`. The codebase uses
     vitest (`.states.test.tsx` files elsewhere confirm). Mock `fetch` via
     `vi.stubGlobal("fetch", vi.fn())` per-test.

## Implementation steps (for the builder in bolt 2)

1. Re-read `packages/haiku-ui/src/hooks/useFeedback.ts` in full immediately
   before editing. Parallel chains may have shifted line numbers; anchor on
   the three `await fetchFeedback()` callsites and the surrounding
   `useCallback` blocks.
2. In `updateFeedback`: after `const result = await res.json()`, replace
   `await fetchFeedback()` with:
   ```ts
   setItems((prev) =>
     prev.map((item) =>
       item.feedback_id === feedbackId
         ? {
             ...item,
             ...(fields.status !== undefined ? { status: fields.status as FeedbackItemData["status"] } : {}),
             ...(fields.closed_by !== undefined ? { closed_by: fields.closed_by } : {}),
           }
         : item,
     ),
   )
   ```
   Remove `fetchFeedback` from that callback's deps array: `[intent, stage]`.
3. In `deleteFeedback`: replace `await fetchFeedback()` with:
   ```ts
   setItems((prev) => prev.filter((item) => item.feedback_id !== feedbackId))
   ```
   Remove `fetchFeedback` from deps: `[intent, stage]`.
4. In `createFeedback`: leave `await fetchFeedback()` in place. Add a brief
   comment above it: `// v1: refetch on create — response doesn't project the full item (see FB-47).`
5. Create `packages/haiku-ui/src/hooks/__tests__/` if it does not exist.
6. Write `useFeedback.test.tsx` with the four tests above. Use a factory that
   returns a `Response` with JSON body for `fetch.mockResolvedValueOnce(...)`.
7. Run build + tests:
   ```bash
   cd packages/haiku-ui && npm run build
   cd packages/haiku-ui && npx vitest run src/hooks/__tests__/useFeedback.test.tsx
   cd packages/haiku-ui && npx vitest run
   ```
8. Commit: `haiku: fix FB-47 bolt 1 (planner)` — no push.

## Verification commands

```bash
# From repo root:
cd packages/haiku-ui && npx tsc --noEmit
cd packages/haiku-ui && npx vitest run src/hooks/__tests__/useFeedback.test.tsx
cd packages/haiku-ui && npx vitest run   # full suite — no regressions

# Prove refetch-after-update is gone:
grep -n "fetchFeedback()" packages/haiku-ui/src/hooks/useFeedback.ts
# expected: exactly two matches — one inside the useEffect, one inside createFeedback
```

TypeScript must exit 0. New tests must pass. The full `haiku-ui` suite must
not regress (existing tests against `useFeedbackSidebarController` and its
downstream consumers still assume the hook return shape is stable; we haven't
changed it).

## Risks

- **Parallel chain clobber** — another fix bolt may be editing
  `useFeedback.ts` concurrently. Re-read the file immediately before each
  edit; anchor on the `await fetchFeedback()` call inside each
  `useCallback`, not on line numbers. The feedback body's line references
  (59, 84, 105) are hints only.
- **Optimistic drift on concurrent edits** — if two sessions update the same
  feedback at the same time, our local splice may disagree with the
  server's post-merge state. This is unchanged from before: the old code
  refetched after *each* mutation but had the same race window *during*
  the PUT. If this becomes a real problem, a WebSocket push or
  server-echo-of-updated-item is the right fix (explicitly out of scope).
- **Callback deps removal breaks React hot-reload** — dropping
  `fetchFeedback` from the deps array of `updateFeedback` and `deleteFeedback`
  is correct (neither closure references `fetchFeedback` anymore), but
  biome/eslint may complain if a rule enforces "include all identifiers".
  The rule should not fire because the identifier is genuinely unused.
  If it does, the fix is **not** to re-add `fetchFeedback` — it's to verify
  the closure really doesn't use it. Add an `eslint-disable-next-line
  react-hooks/exhaustive-deps` only as a last resort, never by default.
- **`setItems` inside a `useCallback`** — React 18 batches state updates across
  concurrent rendering. The splice happens after `await` resolves, so it's
  an async boundary; `setItems` is a legitimate state update here, not a
  side-effect. No `flushSync` needed.
- **`FeedbackItemData["status"]` cast on the update splice** — the
  `FeedbackUpdateRequest` schema narrows `status` to `FeedbackStatusSchema`
  already (enum literal union), so the cast is a type-bridge, not a widening.
  Verify with `npx tsc --noEmit`.
- **Test flake on `fetch` mock ordering** — use
  `mockImplementation((url, init) => ...)` with a URL/method switch rather
  than chained `mockResolvedValueOnce` so test order doesn't matter.
  `renderHook` mounts will fire the initial GET synchronously via the
  `useEffect`; wrap assertions in `await waitFor(...)` to let microtasks
  drain.

## Out of scope

- Server-side changes: returning the updated item from PUT, adding ETag to
  GET, caching `readFeedbackFiles`, replacing sync IO with async. Each is a
  legitimate improvement but belongs in its own feedback/unit. The feedback
  body explicitly offers them as "pick a layer" alternatives; we picked the
  client layer.
- Extending `FeedbackCreateResponseSchema` to echo the full item so `create`
  can also skip the refetch. Follow-up work — flag it in the post-fix
  summary but do not ship it here.
- Adding a WebSocket push channel for feedback mutations. Would eliminate
  the refetch even across tabs, but is an architecture change, not a
  fix-mode bolt.
- Refactoring `useFeedback.ts` into a reducer/TanStack-Query shape. The
  feedback body doesn't ask for it and the existing hook interface is
  stable across many consumers.

## Done when

- `useFeedback.ts` splices local `items` state on 2xx update/delete instead
  of refetching the full list. `createFeedback` still refetches (intentional).
- `grep -n "fetchFeedback()" packages/haiku-ui/src/hooks/useFeedback.ts`
  returns exactly two matches (the initial `useEffect` + the `createFeedback`
  callback).
- New tests in `src/hooks/__tests__/useFeedback.test.tsx` pass:
  (1) update splices without refetch, (2) delete filters without refetch,
  (3) create still refetches, (4) failed update preserves `items`.
- `cd packages/haiku-ui && npx tsc --noEmit` exits 0.
- `cd packages/haiku-ui && npx vitest run` exits 0 with no regressions in
  existing suites.
- A commit `haiku: fix FB-47 bolt 1 (planner)` exists on the current branch
  (no push).
