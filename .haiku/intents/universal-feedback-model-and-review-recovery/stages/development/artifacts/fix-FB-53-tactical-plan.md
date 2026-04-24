# Fix FB-53 — Tactical Plan (planner, bolt 1)

**Finding:** `LegacyReviewPage: markdownToSimpleHtml (remark pipeline) re-runs on every render`
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/53-legacyreviewpage-markdowntosimplehtml-remark-pipeline-re-run.md`

## TL;DR

`markdownToSimpleHtml` at `packages/haiku-ui/src/components/ReviewPage.tsx:1612-1614`
constructs a fresh `unified` processor and runs the full parse → mdast →
gfm → html → stringify pipeline on every call. It has six inline JSX call
sites (lines 625, 832, 843, 1066, 1248, 1503), several inside `.map(...)`
loops over knowledge files, stage artifacts, output artifacts, and units. A
single sidebar state change in `ReviewPage` re-renders every descendant and
re-runs the pipeline for every visible artifact — a blocking CPU operation
on the React render hot path.

Fix: add a process-level memoization cache keyed on the markdown input
string. This is option **3** in the feedback body (WeakMap/Map cache, zero
consumer-site edits) and composes cleanly with FB-50's in-flight sanitizer
swap (`remark → remark-rehype → rehype-sanitize → rehype-stringify`) — the
cache wraps whatever pipeline lives inside the function. Also memoize the
`unitContent` string build at `ReviewPage.tsx:1442-1449` via `useMemo` so
the input key itself is stable across re-renders.

## Root cause

Three independent things compound the cost:

1. **Fresh processor every call.** `remark().use(remarkGfm).use(remarkHtml)`
   builds a new `unified` pipeline each invocation. Even without the parse
   step, constructor + plugin registration is non-trivial.
2. **No result caching.** The content is effectively static per session —
   only a server `session-update` push changes the markdown. Nothing
   invalidates between re-renders, yet the work is redone on every render.
3. **Unstable consumer inputs.** `unitContent` at lines 1442-1449 is rebuilt
   from `u.sections` on every `UnitsTable` render. Even with a function-level
   cache keyed on the string, the **identity** of that string changes every
   render; the cache hit-rate is still ~100% because the string *value* is
   identical, but rebuilding the string itself is also waste. Stabilizing
   `unitContent` via `useMemo(..., [u.sections])` removes both the string
   rebuild cost and makes the cache key compare by reference in the hot path.

The six call sites all run inside JSX expressions of components that
re-render on any sidebar state change (`setSidebarTab`, `setGeneralText`,
`setAllInlineComments`). With an intent that has ~6 knowledge files, ~10
stage artifacts, and ~20 expanded units, a single sidebar click triggers
30+ pipeline invocations. At the feedback body's 5-15 ms each, that's
150-450 ms of blocking work per interaction — exactly the "blocking
operation on the hot path" the stage mandate forbids.

## Fix approach

**Two-layer memoization, both cheap:**

### Layer 1 — Function-level result cache (primary fix)

Wrap the pipeline in a module-local `Map<string, string>` keyed on the
markdown input. Choose `Map` over `WeakMap` because:

- `WeakMap` keys must be objects; we're keying on a string primitive.
- Intent/unit/knowledge content is bounded (a few KB each, dozens of
  artifacts). An unbounded `Map` is fine for the session's lifetime —
  the SPA tab reload clears it.
- If unbounded growth is ever a concern, swap to a 128-entry LRU. Not
  needed at current corpus sizes; called out in Risks.

Implementation replaces the body of `markdownToSimpleHtml` in
`ReviewPage.tsx:1612-1614`:

```ts
const _markdownHtmlCache = new Map<string, string>()

/** Client-side markdown → HTML. Cached per markdown input because the
 *  six call-sites in IntentReview / UnitReview / UnitsTable live inside
 *  JSX loops that re-run on every re-render of the parent (any sidebar
 *  state change). The content is effectively immutable per session — only
 *  a server session-update pushes new markdown — so caching by input
 *  string gives near-100% hit rate after first render.
 *
 *  InlineComments needs raw HTML (not a React tree) to track ranges for
 *  selection-based commenting, so we can't swap to react-markdown here.
 *  FB-53. Composes with FB-50's sanitizer swap — whatever pipeline lives
 *  inside this function is cached. */
function markdownToSimpleHtml(md: string): string {
    const cached = _markdownHtmlCache.get(md)
    if (cached !== undefined) return cached
    const html = remark().use(remarkGfm).use(remarkHtml).processSync(md).toString()
    _markdownHtmlCache.set(md, html)
    return html
}
```

Zero consumer-site edits for five of the six call sites. The six call
sites (lines 625, 832, 843, 1066, 1248, 1503) keep their current
`htmlContent={markdownToSimpleHtml(x)}` pattern — the cache makes the
subsequent calls ~O(1) hash-table lookups instead of 5-15 ms pipelines.

### Layer 2 — `useMemo` on the `unitContent` build (secondary)

At `packages/haiku-ui/src/components/ReviewPage.tsx:1442-1449`, the
`unitContent` string is rebuilt from `u.sections` inside `stageUnits.map`
on every `UnitsTable` render. Wrap the build in `useMemo` so the string
literal stays identity-stable until `u.sections` changes.

There is a subtle React hooks-rules constraint: you cannot call `useMemo`
inside `.map(...)`. The correct fix is to lift the per-unit memoization
into a small helper component that React can reconcile as a row:

```tsx
function UnitRow({
    u,
    isExpanded,
    onExpand,
    onCollapse,
    onInlineCommentsChange,
    previousUnitContents,
}: UnitRowProps) {
    const unitContent = useMemo(() => {
        let content = ""
        for (const section of u.sections) {
            if (section.heading === "_preamble") {
                content += `${section.content}\n\n`
            } else {
                content += `## ${section.heading}\n\n${section.content}\n\n`
            }
        }
        return content
    }, [u.sections])
    // ...rest of row rendering, inlining the current tr/td tree
}
```

`stageUnits.map(...)` then becomes `stageUnits.map(u => <UnitRow key={u.slug}
u={u} ... />)` — no behavioral change, but each row memoizes its own
`unitContent` against its own `u.sections`.

**Decision:** Ship Layer 1 unconditionally. Ship Layer 2 only if Layer 1
alone still leaves a measurable regression — the assessor can re-open if
needed. Reasoning: Layer 1 already takes the pipeline off the hot path
(cache hit is nanoseconds). The string rebuild at lines 1442-1449 is
concatenation, not parsing — microseconds per unit even without memo. The
dominant cost is the remark pipeline, and Layer 1 kills it.

However, Layer 2 is a minor refactor that the builder **should**
implement in the same bolt because:

- It's in-file, no new dependencies.
- It removes the implicit garbage created by the repeated string
  concatenation on every render.
- The unit-render path is the largest `.map` and benefits most from
  stable child identity (it helps React's reconciliation even aside
  from the cache).

If the builder runs out of bolt budget, drop Layer 2 and document it
for the assessor. Layer 1 is the mandatory minimum.

### Why not `useMemo` at every consumer site

The feedback body's option 1 (`useMemo(() => markdownToSimpleHtml(md),
[md])` at each consumer) is rejected:

- Six call sites × one-line wrapper each is six places a future
  contributor must remember to memoize. Central cache = one place.
- `useMemo` at a call site inside `.map(...)` violates the hooks rule
  unless extracted into a child component. Three of the six call sites
  are inside `.map(...)` (lines 832, 843, 1248, 1503 — actually four).
  Extracting four more child components just to host the `useMemo` is
  more churn than a module-local cache.
- `useMemo` is advisory — React may evict cache entries under memory
  pressure. A module-local `Map` is not evicted except by GC when the
  module itself unloads.

### Why not push memoization into `InlineComments`

Option 2 in the feedback body (accept raw markdown, memoize internally):

- Changes the public prop shape of `InlineComments` from `htmlContent`
  to `markdown` — invasive, affects every test that mounts
  `InlineComments` with fixture HTML.
- Couples the component to the markdown pipeline — any consumer that
  already has HTML (none today, but the prop name suggests pre-
  rendered HTML for a reason) can no longer use it.
- Harder to unit-test the cache itself; with the function-level cache
  in `ReviewPage.tsx`, the test mounts nothing and asserts cache
  semantics directly on the exported function.

## Files to modify

1. **`packages/haiku-ui/src/components/ReviewPage.tsx`**
   - Add `useMemo` to the `react` import at line 3.
   - Add `_markdownHtmlCache` module-local `Map<string, string>` just
     before `markdownToSimpleHtml` at line 1610.
   - Rewrite `markdownToSimpleHtml` body to check/populate the cache
     (see code block above).
   - Update the doc-comment block to name FB-53 (and FB-50 once that
     lands — if FB-50's builder races ahead and lands first, preserve
     its sanitizer pipeline inside the cache miss branch; if FB-53
     lands first, keep the current `remark-html` pipeline inside the
     cache miss — FB-50 rewrites the body regardless).
   - Export `markdownToSimpleHtml` as a named export so the regression
     test can reach it (current state: file-local function).
   - **Conditional Layer 2:** Extract the inline expanded-unit render
     at lines 1450-1540-ish into a `UnitRow` child component that
     memoizes `unitContent`. See "Fix approach → Layer 2" above for
     the boundary.

2. **`packages/haiku-ui/tests/markdown-cache.test.ts`** — new file.
   - Assert: calling `markdownToSimpleHtml(md)` twice with the same
     `md` returns the identical string (`===`, not `.equals`).
     Confirms the cache returned the same reference, not a re-
     computed-equivalent string.
   - Assert: calling with a different `md` computes a new result
     (cache does not collide).
   - Assert: output HTML contains the expected transform for a sample
     markdown input (`**bold**` → `<strong>bold</strong>`) — sanity
     check that the pipeline still runs on cache miss.
   - Do NOT mount `<ReviewPage>` or `<InlineComments>`. Those paths
     are exercised by existing render tests.
   - Test file location mirrors FB-50's `tests/markdown-sanitizer.test.ts`
     pattern (the FB-50 builder will create that sibling file; this
     plan's file stays independent).

## Tests

The planner hat **MUST** include a step for implementing test coverage
for every scenario in the product stage's `.feature` files. FB-53 is a
performance / caching finding with no direct feature-file scenario
(cross-checked: `.haiku/intents/universal-feedback-model-and-review-recovery/features/`
— `review-ui-feedback.feature` scenarios cover feedback CRUD, inline
comments, and markdown preservation; none exercise render-time caching
or memoization). The coverage obligation for this fix is a targeted
regression test for the cache itself (`tests/markdown-cache.test.ts`
described above). This mirrors the precedent set by
`tests/annotation-perf.spec.tsx` (perf-budget test, no matching
feature scenario) and FB-50's sibling `tests/markdown-sanitizer.test.ts`.

## Verification

Run from repo root:

1. `cd packages/haiku-ui && npx tsc --noEmit` — strict compile clean.
   Confirms `useMemo` import is valid, the new `Map` type annotations
   check, and the exported signature of `markdownToSimpleHtml` stays
   `(md: string) => string`.
2. `cd packages/haiku-ui && npx vitest run tests/markdown-cache.test.ts`
   — the three cache-semantics cases pass.
3. `cd packages/haiku-ui && npx vitest run` — full package test suite
   passes. Specifically confirms:
   - `tests/parity.spec.tsx` — render paths still produce the same
     DOM (cache is transparent).
   - `tests/a11y-pages.spec.tsx` — page renders still accessible.
   - `tests/annotation-perf.spec.tsx` — the existing perf budgets still
     hold (caching shouldn't regress them; it should if anything
     improve them).
4. `cd packages/haiku-ui && npm run build` — SPA bundle builds without
   regression in the size budget.
5. `grep -n "markdownToSimpleHtml" packages/haiku-ui/src/components/ReviewPage.tsx`
   — confirms the six JSX call sites are untouched (cache is invisible
   to callers). Expected: 7 hits (6 call sites + 1 definition) unless
   Layer 2 extraction added a new call through the `UnitRow` component.
6. If Layer 2 extracted: `grep -n "useMemo" packages/haiku-ui/src/components/ReviewPage.tsx`
   — at least one hit for the `unitContent` memo. Zero hits if Layer 2
   was deferred.

## Risks

- **Cache unbounded growth.** The `Map` grows without eviction for the
  session's lifetime. Session SPA reload clears it. Intent/unit/knowledge
  markdown is bounded (~30-100 entries × a few KB each = <1 MB worst
  case). Acceptable. If a future intent with 200+ artifacts surfaces
  memory pressure, swap to a 128-entry LRU (constant-size overhead,
  same hit rate for "last N viewed").
- **FB-50 race.** FB-50's planner has landed; builder is pending. Both
  fixes touch `markdownToSimpleHtml`. FB-50 rewrites the pipeline
  body; FB-53 wraps the pipeline body in a cache-or-compute check.
  They compose: the cache-miss branch runs whichever pipeline FB-50
  leaves behind. The builder for FB-53 **MUST** re-read lines
  1610-1614 immediately before editing and accept whatever pipeline
  is there, only adding the cache wrapper around it. If FB-50 has
  already landed when FB-53's builder runs, the cache-miss branch
  calls the rehype pipeline; if not, it calls the current
  `remark-html` pipeline. The assessor validates the combination.
- **Reference equality in tests.** `Map.get(md) === markdownToSimpleHtml(md)`
  on the second call asserts reference equality. This is correct:
  `remark-html` returns a new string object even for identical input,
  so reference equality is the distinguishing signal that the cache
  returned the stored entry rather than re-running the pipeline.
- **useMemo dependency subtlety (Layer 2 only).** The dep array for
  `unitContent` is `[u.sections]`. `u.sections` is a new array
  reference on every render if the parent recomputes it — if that
  turns out to be true, the memo misses on every render anyway,
  and Layer 2 is cosmetic. Verification: inspect `stageUnits` build
  in `IntentReview` / `UnitReview` to confirm `sections` is stable
  across re-renders. If it's not, the builder falls back to keying
  the memo on a string hash (`[JSON.stringify(u.sections)]`) —
  loses the benefit of reference equality but still caches. Layer 1
  carries the fix even if Layer 2 degrades to a no-op.
- **Test isolation.** The module-local `Map` persists across test
  runs within a single vitest file. Tests that assert cache behavior
  must either (a) run in a fresh import (vitest `vi.resetModules()`)
  or (b) use unique markdown inputs per test case. Option (b) is
  simpler and mirrors `annotation-perf.spec.tsx`'s style.
- **One bolt.** Layer 1 is a ~10-line source change + one ~40-line
  test file. Layer 2 is a ~60-line refactor (extract a child
  component, move a `useMemo` into it, update the `.map(...)`
  call). Both together are well within a bolt. If Layer 2 hits a
  type-inference wall, defer it; Layer 1 alone closes the
  finding's mandate violation.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- Plan includes verification steps (MUST from hat mandate).
- Plan reads completion criteria (FB-53 body; stage scope; hat mandate).
- No behavioural change for legitimate markdown callers (cache is
  transparent).
- Risk assessment up front (MUST from hat mandate), including the
  parallel-batch FB-50 race.
- Test coverage step included for the cache semantics (MUST from hat
  mandate — feature scenarios do not cover this finding directly, so a
  targeted regression test is the correct coverage form).
- Plan does not copy FB-50's plan verbatim (different concern —
  sanitization vs memoization — different pipeline hook, different
  test shape). They share one file because they both touch the same
  function, which is expected for a parallel-batch fix loop.
