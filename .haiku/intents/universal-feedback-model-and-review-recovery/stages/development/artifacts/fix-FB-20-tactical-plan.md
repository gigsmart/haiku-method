# Fix FB-20 — Tactical Plan (planner, bolt 1)

**Finding:** `Feedback mutation auth is fail-open — X-Haiku-Session-Id absence is silently allowed`
**Feedback file:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/20-feedback-mutation-auth-is-fail-open-x-haiku-session-id-absen.md`

## TL;DR

`verifyFeedbackMutationAuth` in `packages/haiku/src/http.ts:1352-1387` currently
treats a missing `X-Haiku-Session-Id` header as authorized (soft gate, console
log only). That soft gate was explicitly flagged as "unit-08 will flip this
to strict" — and unit-08 shipped without the flip. Combined with the
tunnel-mode CORS (`Access-Control-Allow-Origin: *` for every route when
`HAIKU_REMOTE_REVIEW=true`, `http.ts:332-357`) this is an unauthenticated
cross-site attack surface on POST/PUT/DELETE `/api/feedback/{intent}/{stage}`.

The fix is two-part, both files already exist:

1. **Backend:** make `verifyFeedbackMutationAuth` strict whenever
   `isRemoteReviewEnabled()` is true. Missing header → `401`. Keep the soft
   behavior for the local-only mode so the existing CLI test harness and
   local MCP context (no tunnel) continue to work without header plumbing.
2. **Frontend:** plumb `sessionId` into the typed `ApiClient.feedback.*`
   methods and emit the `X-Haiku-Session-Id` header on every mutating call,
   so flipping the server to strict does not break the happy path over the
   tunnel. Also retire the raw `fetch` inside `hooks/useFeedback.ts` and
   route it through the typed client (it already hand-formats paths — same
   class of bug FB-14 called out for the review/question/direction
   helpers).
3. **CORS:** add `X-Haiku-Session-Id` to the `Access-Control-Allow-Headers`
   list in `withCors(...)` (http.ts:342) so the preflight succeeds.

Out of scope for this bolt (see bottom):
- JWT signature verification on the tunnel token. That is a separate
  finding and a much larger change.
- Locking CORS down from `*` to an allow-list. Separate finding.

## Current state (verified against tree)

Verified on 2026-04-21 against the worktree.

### Backend auth guard (`packages/haiku/src/http.ts`)

- **`verifyFeedbackMutationAuth`** L1352-1387:
  - Missing header → `console.error("[feedback-auth] mutation without X-Haiku-Session-Id (intent=%s)", intent)` + `return { ok: true }`.
  - Present but unknown session → `403 forbidden_cross_session / unknown_session`.
  - Present but session intent ≠ URL intent → `403 forbidden_cross_session / intent_mismatch`.
  - Called by POST (L1146), PUT (L1214), DELETE (L1290).
- **`withCors`** L332-357 whitelists: `Content-Type, bypass-tunnel-reminder`.
  `X-Haiku-Session-Id` is NOT in the list. Cross-origin `fetch()` would
  today fail preflight once we force the client to send the header, even
  without the strict-mode flip.
- **`isRemoteReviewEnabled()`** is truthy only when `HAIKU_REMOTE_REVIEW=1`
  (or set via config/providers). Local CLI sessions never have it set, so
  tunnel-mode strict-ness is the correct boundary.

### Frontend transport

- **Typed client** `packages/haiku-ui/src/api/client.ts`:
  - L31 `FETCH_HEADERS = { "bypass-tunnel-reminder": "1" }` — no session id.
  - L35 `JSON_HEADERS = { "Content-Type": "application/json", ...FETCH_HEADERS }`.
  - `feedback.list/create/update/delete` (L143-192) currently take
    `(intent, stage, [id], [body])` — **no sessionId param**.
- **`useFeedback` hook** `packages/haiku-ui/src/hooks/useFeedback.ts`:
  - Uses raw `fetch()` with hand-formatted paths (L18-19, L46-47, L71-72, L93-94).
  - Does not import the typed client at all — this is a second bypass, not
    just a missing header.
  - Consumers:
    - `components/ReviewPage.tsx:174` — `useFeedback(intentSlug, activeStage)`.
    - `components/ReviewCurrentPage.tsx:14` — `useFeedback(intentSlug, activeStage)`.
    - `pages/review/FeedbackSidebar.tsx:117` — via `useFeedbackSidebarController`.
  - sessionId is already in scope everywhere `useFeedback` is invoked —
    `ReviewPage` receives it as a prop, `ReviewCurrentPage` has it from the
    router, `FeedbackSidebar.tsx` already takes a `sessionId` prop
    (currently renamed `_sessionId` because nothing consumes it).
- **Consumer sites for session-id plumbing:**
  - `pages/review/FeedbackSidebar.tsx` — `FeedbackSidebarProps.sessionId` (L47)
    and `FeedbackSheetProps.sessionId` (L220) already exist and are passed
    in from `ReviewPage.tsx`. Currently aliased to `_sessionId` and
    ignored. Lift it into the controller and forward into `useFeedback`.
  - `components/ReviewPage.tsx:174` — `useFeedback(intentSlug, activeStage)`
    becomes `useFeedback(intentSlug, activeStage, sessionId)`.
  - `components/ReviewCurrentPage.tsx:14` — uses `/api/review/current` as
    data source; this page is the one that has no session at all in
    local-only mode. Handle with care (see Step 2 below).

### Test coverage

- `packages/haiku/test/http-feedback.test.mjs:590-660` already covers:
  - Mismatched session header → 403.
  - Unknown session header → 403.
  - Matching session header → 200.
- **Missing:** no test for *absent* header under
  `HAIKU_REMOTE_REVIEW=1`. Need to add one so the regression is locked in.

## Implementation steps (for the builder bolt)

### Step 1 — Backend: strict mode under remote review

File: `packages/haiku/src/http.ts`.

1.1 Update the header comment (L1342-1350) to reflect the new behavior:

```ts
// ─── Cross-session feedback mutation guard ──────────────────────────────────
//
// The review UI advertises its session via the `X-Haiku-Session-Id` header
// on mutating feedback calls (POST/PUT/DELETE). When present, the session
// MUST belong to the same intent as the URL path — otherwise we 403.
//
// When remote review is enabled (`isRemoteReviewEnabled()` → true) the
// header is REQUIRED. Missing header → 401. This closes the fail-open
// attack surface opened by the public `*.loca.lt` tunnel + wildcard CORS.
//
// When remote review is OFF (pure local MCP / loopback) the header remains
// OPTIONAL so the CLI test harness and local agent flows that do not
// establish a review session still work.
```

1.2 Import `isRemoteReviewEnabled` where needed — it is already imported at
    L64 for the `withCors` branch, so no new import is needed.

1.3 Replace the absent-header branch (L1356-1364):

```ts
if (!sessionHeader) {
    if (isRemoteReviewEnabled()) {
        return {
            ok: false,
            response: Response.json(
                {
                    error: "unauthorized",
                    reason: "missing_session_header",
                },
                { status: 401 },
            ),
        }
    }
    // Local-only mode: keep soft gate (backwards compat for CLI + MCP
    // contexts that do not establish a review session).
    console.error(
        "[feedback-auth] mutation without X-Haiku-Session-Id (intent=%s)",
        intent,
    )
    return { ok: true }
}
```

1.4 Add `X-Haiku-Session-Id` to the CORS allow-headers list in `withCors`
    (L341-344):

```ts
headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, bypass-tunnel-reminder, X-Haiku-Session-Id",
)
```

### Step 2 — Frontend: thread sessionId through the typed client

File: `packages/haiku-ui/src/api/client.ts`.

2.1 Extend the `ApiClient.feedback` type signatures to accept an optional
    `sessionId: string | null` as the **last** argument on the three
    mutating methods (`create`, `update`, `delete`). Keep `list` untouched
    (GET, not guarded). Optional so callers in contexts without a session
    (none today, but future-proof) don't break; when present we add the
    header.

```ts
feedback: {
    list(intent, stage, status?): Promise<FeedbackListResponse>
    create(intent, stage, body, sessionId?: string | null): Promise<FeedbackCreateResponse>
    update(intent, stage, id, body, sessionId?: string | null): Promise<FeedbackUpdateResponse>
    delete(intent, stage, id, sessionId?: string | null): Promise<FeedbackDeleteResponse>
}
```

2.2 In the default implementation, build headers as:

```ts
function sessionHeader(sessionId?: string | null): Record<string, string> {
    return sessionId ? { "X-Haiku-Session-Id": sessionId } : {}
}
```

and merge into the per-call `headers`:

```ts
async create(intent, stage, body, sessionId) {
    const res = await fetch(
        paths.feedbackList(encodeURIComponent(intent), encodeURIComponent(stage)),
        {
            method: "POST",
            headers: { ...JSON_HEADERS, ...sessionHeader(sessionId) },
            body: JSON.stringify(body),
        },
    )
    return parseJsonOrThrow<FeedbackCreateResponse>(res)
},
```

Do the same for `update` (PUT) and `delete` (DELETE). `list` stays as-is.

### Step 3 — Frontend: retire raw fetch in `useFeedback`

File: `packages/haiku-ui/src/hooks/useFeedback.ts`.

3.1 Change the hook signature to:

```ts
export function useFeedback(
    intent: string | null,
    stage: string | null,
    sessionId?: string | null,
) { /* … */ }
```

3.2 Replace the four raw `fetch()` call sites with calls through the typed
    client (import via `useApiClient()` from `../api/context` — the same
    hook `ReviewSidebar.tsx` uses after FB-14).

```ts
const client = useApiClient()

const fetchFeedback = useCallback(async (statusFilter?: string) => {
    if (!(intent && stage)) return
    setLoading(true); setError(null)
    try {
        const data = await client.feedback.list(
            intent,
            stage,
            statusFilter as FeedbackStatus | undefined,
        )
        setItems(data.items)
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch feedback")
    } finally {
        setLoading(false)
    }
}, [intent, stage, client])
```

And similar for `createFeedback`, `updateFeedback`, `deleteFeedback`,
threading `sessionId ?? null` as the last argument on the three mutations.

3.3 Remove the now-unused `FETCH_HEADERS` constant from the top of the
    file.

### Step 4 — Frontend: plumb sessionId at call sites

4.1 `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx`:
    - Line 157: destructure `sessionId` (drop the `_sessionId` alias) and
      pass it into `useFeedbackSidebarController(intent, stage, sessionId)`.
    - Line 228: same for `FeedbackSheet`.
    - Update the `useFeedbackSidebarController` signature (defined earlier
      in the same file, ~L98) to accept and forward `sessionId` into
      `useFeedback(intent, stage, sessionId)`.

4.2 `packages/haiku-ui/src/components/ReviewPage.tsx:174`:
    - `useFeedback(intentSlug, activeStage)` → `useFeedback(intentSlug, activeStage, sessionId)`.
    - `sessionId` is already a prop on `LegacyReviewPage` (L157) — already
      in scope.

4.3 `packages/haiku-ui/src/components/ReviewCurrentPage.tsx:14`:
    - This page feeds the always-available `/review/current` pane. It does
      not have a review session — the user lands here without going
      through `buildReviewUrl`. Keep the existing call shape:
      `useFeedback(intentSlug, activeStage)` with NO sessionId. In
      local-only mode this continues to work (server is not in strict
      mode). In remote mode, `/review/current` is not meant to be
      tunnel-exposed at all — if it ever is, a follow-up finding will
      require a session-bootstrap for this page. **Leave a one-line TODO
      comment** pointing at this note so the next audit knows why.

### Step 5 — Backend test: lock in the strict-mode regression

File: `packages/haiku/test/http-feedback.test.mjs`.

5.1 Add a new test block after the existing "Cross-session mutation guard"
    section (around line 660). The existing block assumes soft-mode for
    absent header; reuse the same `baseUrl` / `intentSlug` / `stageName`
    and add:

```js
await test("POST without X-Haiku-Session-Id returns 401 when remote review is enabled", async () => {
    const { setFeature } = await import("../src/config.ts") // or equivalent
    const prev = process.env.HAIKU_REMOTE_REVIEW
    process.env.HAIKU_REMOTE_REVIEW = "1"
    try {
        const res = await fetch(
            `${baseUrl}/api/feedback/${intentSlug}/${stageName}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "no header", body: "…" }),
            },
        )
        assert.strictEqual(res.status, 401)
        const data = await res.json()
        assert.strictEqual(data.error, "unauthorized")
        assert.strictEqual(data.reason, "missing_session_header")
    } finally {
        if (prev === undefined) delete process.env.HAIKU_REMOTE_REVIEW
        else process.env.HAIKU_REMOTE_REVIEW = prev
    }
})
```

**Check before writing the test:** the env-flag read path in
`packages/haiku/src/config.ts:99` may cache at startup. If the flag is only
read once, the test harness must either (a) restart the server inside the
test, or (b) we expose a test-only setter. Prefer (b) — a
`__setRemoteReviewForTesting(value: boolean)` non-public export in
`tunnel.ts` (or a `setFeature` in config.ts if one already exists). Read
`config.ts` to confirm which path is correct before implementing.

5.2 Also add a PUT variant (omit header + remote review on) to lock in the
    fact that strict mode covers all three verbs, and a DELETE variant for
    completeness. Three short tests; copy the POST shape.

### Step 6 — Verify

Run from repo root:

```bash
# Backend
cd packages/haiku && npx tsx test/http-feedback.test.mjs

# Frontend
cd packages/haiku-ui && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Targeted greps to ensure the fix did not drift:

```bash
# (a) the soft absent-header branch no longer returns ok:true in remote mode
grep -n "isRemoteReviewEnabled" packages/haiku/src/http.ts
# must now include a call inside verifyFeedbackMutationAuth

# (b) client sends the header for mutations
grep -n "X-Haiku-Session-Id" packages/haiku-ui/src/api/client.ts
# must appear once (inside sessionHeader() helper)

# (c) raw fetch() is gone from useFeedback
grep -n "fetch(" packages/haiku-ui/src/hooks/useFeedback.ts
# must return no matches

# (d) CORS allows the new header
grep -n "X-Haiku-Session-Id" packages/haiku/src/http.ts
# must also appear inside withCors()
```

All four must pass. The feedback-assessor hat will re-check on bolt 3.

## Files the builder will modify

1. `packages/haiku/src/http.ts`:
   - Update `verifyFeedbackMutationAuth` comment block (L1342-1350).
   - Replace the absent-header branch (L1356-1364) with strict-under-remote / soft-under-local.
   - Add `X-Haiku-Session-Id` to the `Access-Control-Allow-Headers` list in `withCors()` (L341-344).
2. `packages/haiku-ui/src/api/client.ts`:
   - Extend `ApiClient.feedback.{create,update,delete}` signatures to take optional `sessionId`.
   - Add `sessionHeader(sessionId?)` helper.
   - Merge `sessionHeader(...)` into the three mutation calls' `headers`.
3. `packages/haiku-ui/src/hooks/useFeedback.ts`:
   - Add `sessionId?: string | null` to hook signature.
   - Swap all four raw `fetch()` call sites for the typed client via `useApiClient()`.
   - Thread `sessionId ?? null` into the three mutation calls.
   - Delete the now-unused `FETCH_HEADERS` constant.
4. `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx`:
   - Stop aliasing `sessionId` to `_sessionId` in both `FeedbackSidebar` (L157) and `FeedbackSheet` (L228).
   - Extend `useFeedbackSidebarController(intent, stage)` signature to `(intent, stage, sessionId)` and forward it.
5. `packages/haiku-ui/src/components/ReviewPage.tsx`:
   - L174: pass `sessionId` as third arg to `useFeedback`.
6. `packages/haiku-ui/src/components/ReviewCurrentPage.tsx`:
   - Add a one-line TODO comment documenting why no sessionId is passed
     (always-available pane, not tunnel-exposed in the current model).
7. `packages/haiku/test/http-feedback.test.mjs`:
   - Add three new tests: POST/PUT/DELETE without header return 401 when
     `HAIKU_REMOTE_REVIEW=1`. Restore env after each.

## Risks

- **Config caching.** `config.ts` may cache env-flag reads at module init.
  If so, `setting process.env.HAIKU_REMOTE_REVIEW` mid-test will not flip
  `isRemoteReviewEnabled()`. The builder must verify and either add a
  test-only setter or bounce the server between tests. **Verify before
  writing the test** (see Step 5.1).
- **Parallel-chain clobber on `packages/haiku/src/http.ts`.** FB-30, FB-36,
  and FB-44 are also in this batch and touch the same file. Read before
  write. The three non-overlapping regions are:
  - FB-20 (this fix): L332-357 (CORS allow-headers) + L1342-1387 (auth guard).
  - FB-30, FB-36: tunnel-mode auth surface — verify with git blame before
    writing.
  - FB-44: unrelated unit-numbering collision.
- **Parallel-chain clobber on `packages/haiku-ui/src/hooks/useFeedback.ts`.**
  FB-47 ("every mutation triggers full list refetch") also targets this
  file. FB-47 changes the refetch strategy; FB-20 changes the transport.
  The diffs overlap on every callback body. Read the file immediately
  before writing; if FB-47 landed first, rebase our edits onto whatever
  refetch logic it introduced. Our required invariant is only: the request
  goes through the typed client with the session header — the refetch
  semantics are FB-47's problem.
- **`ReviewCurrentPage` without session.** Leaving it without a sessionId
  is correct for today's model (local-only). If someone later tunnel-exposes
  `/review/current`, this page will break. The TODO comment is the
  protocol-level mitigation. Not a regression from this fix.
- **Breaking change to the `ApiClient.feedback` type.** Downstream
  consumers outside this repo that implement a custom `ApiClient` would
  need to add the optional `sessionId` arg. Optional positional arg, so
  TypeScript is lenient; no runtime break. Worth noting in a CHANGELOG
  entry — but per `CLAUDE.md`, CHANGELOG.md is auto-generated, so skip.

## Out of scope

- **JWT signature verification on tunnel tokens.** The feedback body notes
  that the server never verifies the token fragment shared with the remote
  reviewer. That is a real finding, but it is a different kind of fix
  (requires a secret store, server-side token mint/verify, probably
  out-of-band handshake). File a separate finding if one doesn't already
  exist; do not bundle here.
- **Locking CORS down from `*` to an allow-list.** Related to FB-36
  ("CORS `Access-Control-Allow-Origin: *` enables cross-site abuse"). Our
  only CORS change is adding one header to the allow-list. The `*` origin
  stays.
- **Strict mode for the `list` GET endpoint.** Reads are already public
  (`/api/feedback/:intent/:stage` with no guard). Tightening that is out
  of scope; this finding is about mutations only.
- **Touching `components/ReviewPage.tsx`** beyond the one-line `useFeedback`
  call update. That file is a monolith (FB-22); minimize diff.

## Done when

- `verifyFeedbackMutationAuth` returns `401 unauthorized / missing_session_header`
  when the header is absent AND `isRemoteReviewEnabled()` is true.
- Soft-mode (log + ok) still fires when `isRemoteReviewEnabled()` is false
  (preserves local CLI / MCP test harness behavior).
- `withCors` includes `X-Haiku-Session-Id` in `Access-Control-Allow-Headers`.
- `ApiClient.feedback.{create,update,delete}` accept an optional `sessionId`
  and emit the `X-Haiku-Session-Id` header when provided.
- `useFeedback` takes an optional `sessionId`, routes through the typed
  client, and no `fetch()` literal remains in the file.
- `FeedbackSidebar`, `FeedbackSheet`, and `ReviewPage` pass `sessionId`
  through to `useFeedback`.
- Three new backend tests cover POST/PUT/DELETE without header → 401
  under remote-review mode.
- `npx tsc --noEmit` (both packages) and both test suites exit 0.
- Feedback-assessor marks FB-20 resolved on bolt 3.
