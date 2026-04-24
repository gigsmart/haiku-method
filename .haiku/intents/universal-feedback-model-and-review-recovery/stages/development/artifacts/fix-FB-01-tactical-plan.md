# Fix FB-01 — Tactical Plan (planner, bolt 1)

**Finding:** unit-02 stream-handler path-traversal 403 behavior has no test
coverage; `FileServeParamsSchema` from `haiku-api` not wired into the stream
handlers.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/01-unit-02-stream-handler-path-traversal-403-behavior-has-no-te.md`

## Current state (verified against tree, not the feedback body's line numbers)

The feedback was authored against an earlier tree and is partially stale. A
subsequent bolt on the same unit already landed most of the primary ask. The
plan below reflects the *current* tree, not the feedback body's snapshot.

**Primary ask (tests for stream-handler 403 behavior) — already shipped.**
Commit `7e24b2ed haiku(unit-02/builder): path-traversal tests for /files,
/mockups, /wireframe, /stage-artifacts` added
`packages/haiku/test/http-streams.test.mjs`, which spins up a live
`startHttpServer()`, creates a review session, and asserts:

- `GET /files/:sid/..%2F..%2Fetc%2Fpasswd` → 403 + `{error:"forbidden_path_traversal"}`
- `GET /files/:sid/inside.txt` → 200 (happy-path guard)
- `GET /mockups/:sid/..%2F..%2Fetc%2Fpasswd` → 403 + typed envelope
- `GET /mockups/:sid/hello.txt` → 200 (happy-path guard)
- `GET /wireframe/:sid/..%2F..%2Fetc%2Fpasswd` → 403 + typed envelope
- `GET /stage-artifacts/:sid/..%2F..%2Fetc%2Fpasswd` → 403 + typed envelope
- `GET /mockups/:sid/%2Fetc%2Fpasswd` → 403 (absolute-path probe, defence-in-depth)

The runner at `packages/haiku/test/run-all.mjs` picks up every `*.test.mjs`
file in the directory, so `http-streams.test.mjs` is already wired into the
full suite — no registration step needed.

**`handleFileGet` 403-not-404 divergence — already fixed.** `http.ts:461-464`
now returns
`Response.json({ error: "forbidden_path_traversal" }, { status: 403 })` when
every allowed base rejects the path as an escape, matching the unit-spec
completion criterion ("path-traversal fixture set returns 403 (not 200, not
400)"). Missing-file (non-traversal) returns remain 404, which is correct.

**Outstanding gap — secondary concern in the feedback body.** The unit spec
bullet "stream handlers … validate path params against the `files.ts`
schemas' path refinements" is not yet satisfied. `http.ts` imports 13
schemas from `haiku-api` (lines 20-33) but `FileServeParamsSchema` and
`QuestionImageParamsSchema` are not among them. Path safety is enforced
structurally via `resolvePathSafe` + `isValidSlug`; the schema contract from
`haiku-api/src/schemas/files.ts` is never referenced at the boundary.

That leaves two things a builder could do to close FB-01 cleanly:

1. **Wire `FileServeParamsSchema`** into each of `handleFileGet`,
   `handleMockupGet`, `handleWireframeGet`, `handleStageArtifactGet` so that
   the param shape is validated at the boundary in the same way all other
   `haiku-api` requests are (via `validateRequestBody` elsewhere in `http.ts`).
   Keep `resolvePathSafe` — it enforces the *semantic* escape check that
   `min(1)` strings cannot. The schema handles shape validation; the
   resolver handles traversal.
2. **Wire `QuestionImageParamsSchema`** into `handleQuestionImageGet` for
   the same reason — the current `index < 0 || index >= length` check is
   fine but does not parse the `sessionId` param shape through the schema.
3. **Add one test** to `http-streams.test.mjs` proving that an empty
   `path` param on a stream handler now returns a uniform 400 envelope
   (the new schema-level failure mode), distinct from 403 (traversal) and
   404 (missing / wrong session type).

This closes the *whole* of FB-01, not just the primary ask.

## Fix approach

Add `FileServeParamsSchema` (and `QuestionImageParamsSchema`) to the
`haiku-api` import block, then gate each stream handler with a `safeParse`
that returns a 400 `validation_error` envelope (shape matching
`ValidationError` from `haiku-api`) on malformed input. Do NOT replace
`resolvePathSafe` — it stays as the traversal defence. The schema validates
shape; the resolver validates semantics.

The envelope shape must match the existing feedback/validation error
contract used elsewhere in `http.ts` for consistency — use
`validateRequestBody`'s return shape as the template (see how it's used in
`handleFeedbackPost` etc.). For path params there is no request body, so
wrap the params object:

```ts
const parsed = FileServeParamsSchema.safeParse({ sessionId, path: filePath })
if (!parsed.success) {
  return Response.json(
    {
      error: "validation_error",
      issues: parsed.error.issues.map((i): ZodIssueWire => ({
        path: i.path.map(String),
        code: i.code,
        message: i.message,
      })),
    } satisfies ValidationError,
    { status: 400 },
  )
}
```

`ValidationError` and `ZodIssueWire` are already imported at lines 29 and
32. No new imports needed beyond the two schema names.

### Why this closes FB-01 despite the tests already existing

The feedback's own "Secondary" section explicitly calls out the
`FileServeParamsSchema` wiring gap as part of the finding ("Less critical
than (1) above but worth closing the loop"). The assessor will look at the
whole finding — closing both halves is the clean close. Leaving the
schema-wiring gap open risks the assessor correctly flagging the fix as
partial and the FSM re-dispatching bolts 2 and 3.

Also: the feedback's step 3 ("Either (a) add a `/files/:sid/...` traversal
test, OR (b) change `handleFileGet` to return 403") — both halves are
already satisfied. `handleFileGet` returns 403 (option b) *and* the test
exists (option a for all four routes). No additional work on that axis.

## Files to modify

1. **`packages/haiku/src/http.ts`**
   - Imports block (lines 14-33): add `FileServeParamsSchema` and
     `QuestionImageParamsSchema` to the `haiku-api` named-import list.
   - `handleFileGet` (line 424): insert `safeParse` guard at the top,
     returning 400 `validation_error` on failure. Must run *before* the
     `getSession` lookup so malformed params are rejected without touching
     session state.
   - `handleMockupGet` (line 484): same pattern.
   - `handleWireframeGet` (line 495): same pattern.
   - `handleStageArtifactGet` (line 506): same pattern.
   - `handleQuestionImageGet` (line 517): `safeParse` against
     `QuestionImageParamsSchema` with `{ sessionId, index }`. The route
     parser already coerces `index` to a number (check the route-dispatch
     site) — keep that.
   - Do NOT touch `resolvePathSafe`, `serveUnderRoot`, or the 403 path.
     Those are correct as-is.

2. **`packages/haiku/test/http-streams.test.mjs`**
   - Add one block asserting that a stream handler with an empty `path`
     param returns 400 + `validation_error` envelope (the new schema-level
     failure). Pick `/mockups/:sid/` (trailing slash → empty path) or an
     equivalent route invocation that the dispatcher will forward with
     `filePath === ""`. If the dispatcher strips the empty path before it
     reaches the handler, instead add a test that passes a deliberately
     short / whitespace path that `min(1)` rejects after URL-decoding.
   - Re-confirm the existing 6 traversal assertions all still pass
     unchanged — the new schema guard must not alter the 403 behavior for
     well-formed but escaping paths.

## Implementation steps (for the builder in bolt 2)

1. Read `packages/haiku/src/http.ts` immediately before editing
   (parallel-chain clobber guard — many fix chains edit this file). Confirm
   lines 14-33 still match the import block; confirm `handleFileGet` is
   still at the same approximate position. Use `grep -n "async function
   handleFileGet" packages/haiku/src/http.ts` if line numbers have drifted.
2. Append `FileServeParamsSchema,` and `QuestionImageParamsSchema,` to the
   alphabetically sorted named-import list from `"haiku-api"`.
3. In each of the five handlers, insert after the function signature and
   before the `getSession` call:
   ```ts
   const parsed = FileServeParamsSchema.safeParse({ sessionId, path: filePath })
   if (!parsed.success) {
     return Response.json(
       {
         error: "validation_error",
         issues: parsed.error.issues.map((i): ZodIssueWire => ({
           path: i.path.map(String),
           code: i.code,
           message: i.message,
         })),
       } satisfies ValidationError,
       { status: 400 },
     )
   }
   ```
   (For `handleQuestionImageGet`, substitute `QuestionImageParamsSchema`
   and `{ sessionId, index }`.)
4. Read `packages/haiku/test/http-streams.test.mjs` immediately before
   editing. Append one `test(...)` block after the existing blocks:
   ```js
   await test("GET /mockups with empty path returns 400 validation_error", async () => {
     const res = await fetch(`${baseUrl}/mockups/${reviewSessionId}/`)
     assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`)
     const data = await res.json()
     assert.strictEqual(data.error, "validation_error")
     assert.ok(Array.isArray(data.issues))
   })
   ```
   If the route dispatcher short-circuits empty-path requests with a 404
   before they reach `handleMockupGet`, instead use a path that the
   dispatcher forwards but `min(1)` rejects — e.g. test the schema
   directly by calling it, or pick a different malformed-input route. The
   builder must actually run the test and confirm the assertion path
   fires; do not ship an unverified test.
5. Verification suite (all must exit 0):
   ```bash
   cd packages/haiku
   node test/http-streams.test.mjs    # new schema test + existing 6 pass
   node test/http-feedback.test.mjs   # regression guard on adjacent http routes
   node test/run-all.mjs              # full suite parity
   npx tsc --noEmit                   # compile
   ```
6. Confirm `git diff --stat` shows exactly two files touched:
   `packages/haiku/src/http.ts` and
   `packages/haiku/test/http-streams.test.mjs`.

## Verification commands

```bash
cd packages/haiku
node test/http-streams.test.mjs
node test/http-feedback.test.mjs
node test/run-all.mjs
npx tsc --noEmit
```

All four must exit 0.

## Risks

- **Route dispatcher swallows empty path.** If the HTTP dispatcher treats
  `/mockups/:sid/` (trailing slash, empty suffix) as "no match" and
  returns 404 before reaching `handleMockupGet`, the test at step 4 won't
  fire the 400 path. Mitigation: the builder must read the dispatch code
  (search `packages/haiku/src/http.ts` for `'/mockups/'` or the regex
  that extracts the suffix) and craft a malformed input the dispatcher
  *does* forward. If no such input exists — i.e. the dispatcher
  guarantees `path.length >= 1` before the handler is called — then the
  `min(1)` schema check is structurally redundant, and the schema's value
  is purely documentary. In that case, the builder should add a unit test
  that calls `FileServeParamsSchema.safeParse({...})` directly to prove
  the schema is *exercised*, even if no route path reaches the failure
  branch in practice.
- **Parallel-chain clobber.** Many fix chains edit `http.ts`. Specifically
  FB-20 (feedback mutation auth), FB-30 (tunnel auth), FB-36 (CORS),
  FB-50 (markdown XSS) all live in the same file. The builder MUST read
  immediately before writing; the imports block is a particularly
  collision-prone region because every chain tends to add one named
  import. Merge-forward strategy: import additions are additive —
  reapply on top. Handler-body insertions at different line ranges are
  non-overlapping — safe.
- **Schema import drift.** `haiku-api/src/schemas/files.ts` already
  exports both schema names (verified lines 15 and 29). Confirm
  `haiku-api/src/index.ts` re-exports them before importing — if the
  package barrel doesn't re-export, the import will fail at build time.
  If it doesn't, add the re-export in the same commit (one-line add to
  `packages/haiku-api/src/index.ts`).
- **Envelope shape drift.** The `validation_error` envelope shape must
  match what clients already parse. `validateRequestBody` in `http.ts`
  produces the same shape (check its return path) — reuse its envelope
  verbatim. Do not invent a new shape.
- **Test file clobber.** FB-15 (`FileServeParamsSchema` path refinement)
  may also touch `files.ts` and the stream tests. If FB-15 ships first
  with a tightened `path: z.string().min(1).refine(...)`, re-verify this
  plan's step 4 test still hits the 400 path (it should — `min(1)`
  failure fires before `refine`). If FB-15 ships with a broken schema,
  coordinate.

## Out of scope

- FB-15 (`FileServeParamsSchema` path-refinement adversarial case) —
  separate feedback, separate fix chain. This plan wires the *existing*
  schema; FB-15 hardens it.
- Refactoring `resolvePathSafe` or `serveUnderRoot` — they are correct
  and the 403 contract is already proven by the existing tests.
- Rewriting `handleQuestionImageGet`'s index validation — the numeric
  bounds check is fine; we only add the schema `safeParse` as a uniform
  front-door.
- Adding `FileServeParamsSchema` to every other route in `http.ts` —
  this plan scopes strictly to the five stream handlers the unit spec
  enumerates.
- Test coverage for `handleQuestionImageGet` path-traversal — the
  `question-image/:sid/:index` route takes a number, not a path, so
  path-traversal is structurally impossible. The `imagePath.startsWith('/')`
  guard at line 533 + `realpath` bounds check at line 546 are separate
  semantic defences unrelated to path-traversal-via-user-input.

## Done when

- `FileServeParamsSchema` and `QuestionImageParamsSchema` are imported in
  `packages/haiku/src/http.ts`.
- All five stream handlers (`handleFileGet`, `handleMockupGet`,
  `handleWireframeGet`, `handleStageArtifactGet`, `handleQuestionImageGet`)
  `safeParse` their path params before touching session state and return
  a uniform 400 `validation_error` envelope on failure.
- `packages/haiku/test/http-streams.test.mjs` contains at least one new
  assertion proving the schema front-door fires (either via a
  dispatcher-reachable malformed input or a direct schema-call test).
- All six pre-existing path-traversal / happy-path assertions in
  `http-streams.test.mjs` still pass unchanged — the schema guard does
  not alter 403 behavior for well-formed escaping paths.
- `node test/run-all.mjs` exits 0.
- `npx tsc --noEmit` exits 0.
- `git diff --stat` on this commit touches exactly two files:
  `packages/haiku/src/http.ts` and
  `packages/haiku/test/http-streams.test.mjs` (plus optionally a
  one-line re-export addition to `packages/haiku-api/src/index.ts` if
  the barrel doesn't already expose the schemas).
