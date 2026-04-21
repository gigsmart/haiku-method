# Fix FB-57 — Tactical Plan (planner, bolt 1)

**Finding:** Mock feedback fixtures use placeholder data; realistic edge cases are untested.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/57-mock-feedback-fixtures-use-placeholder-data-realistic-edge-c.md`

## TL;DR

`packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts` generates
identical 20-char titles (`Fixture feedback item FB-01`) and single-sentence
Lorem-ipsum bodies for every item. Every FeedbackItem / FeedbackList /
FeedbackSummaryBar test and every virtualization perf test consumes this
fixture, so:

- `FeedbackItem.states.test.tsx` snapshot pins rendering against placeholder
  copy and never sees multi-paragraph bodies, markdown-heavy content, code
  fences, unicode, long titles near the 120-char backend cap, or embedded
  newlines.
- `FeedbackList.virtualization.test.tsx` 500-item run is ~10 KB of title text;
  the realistic payload (typical adversarial review body ≥ 1–2 KB, long-tail
  up to 10 KB) is ~500 KB or more — the virtualization budget is untested at
  realistic scale.
- `FeedbackSummaryBar.states.test.tsx` counts statuses only; body content
  does not affect its assertions, but its snapshot is also pinned on the
  placeholder titles.

The mandate the reviewer cites — *"test data is realistic, not minimal
placeholder values"* — is the exact failure mode this fixture is committing.
Builder needs to replace the fixture generator with a rotating library of
realistic edge-case titles/bodies so every downstream test exercises real
string-handling paths, then refresh the snapshot files that pin the old
placeholder copy.

## Root cause

`mockItems.ts` is a lazy generator written once and reused everywhere. It
rotates status/origin/visit tiers correctly (that's what the states tests
care about) but applies identical text content to every item. Three
independent gaps:

1. **No content diversity.** Titles are `Fixture feedback item FB-NN`
   (≤ 27 chars). Bodies are a single-line `Body copy for FB-NN. Lorem ipsum
   dolor sit amet.`. No markdown, no unicode, no newlines, no code fences,
   no titles near the 120-char backend cap (`packages/haiku/src/state-tools.ts`
   `writeFeedbackFile` checks `title.length <= 120`).
2. **No `closed_by` diversity.** Every closed item routes to the same
   `unit-99-assessor` slug. Intent-scope closures (`closed_by: null` when
   `status === "rejected"`) already happen, but cross-stage and cross-unit
   closures aren't exercised (`unit-03-builder`, `unit-14-ui-gate`, a
   studio-level `intent-assessor`, etc.).
3. **Snapshot lock-in.** `FeedbackItem.states.test.tsx.snap` and
   `FeedbackList.states.test.tsx.snap` pin the placeholder titles. Replacing
   the fixtures will invalidate those snapshots; the builder has to
   regenerate them (`vitest -u`) and sanity-check the diffs so we don't
   freeze a bug into the new baseline.

Every FeedbackList, FeedbackItem, FeedbackSummaryBar, FeedbackSummaryBar
filter, virtualization, and keyboard-nav test traverses `mockItems`. The fix
is localised (one file — `mockItems.ts`) plus snapshot refresh, but the
*reach* is broad — one edit covers all 5 consumers at once.

## Fix approach

Replace the single-template generator with a **deterministic rotation over a
curated library of realistic fixtures**. Preserve every property downstream
tests rely on:

- Deterministic ordering (tests rely on FB-01 = pending + adversarial-review,
  FB-02 = addressed + user-chat, etc.).
- Status cycle (`pending`, `addressed`, `closed`, `rejected`) at i % 4.
- Origin cycle (6 values) at i % 6.
- Visit tier (`((i % 7) + 1)`) so virtualization shows every visit colour.
- `created_at` ISO-8601 strings with per-item minute offsets.
- `closed_by` is non-null only when `status === "closed"` (rejected →
  `closed_by: null`, pending/addressed → `null`).

Add a curated content library keyed by index so each FB-NN id ships the
same title/body every run (snapshot stability). The library covers the six
edge-case classes the reviewer names:

1. **Multi-paragraph body with fenced code** (`\n\n` blocks; a fence with
   language; a trailing paragraph).
2. **Markdown-heavy body** — nested bullet list, inline emphasis, backtick
   code spans, a reference-style link `[label](path:lineno)`.
3. **Near-cap title** — exactly 120 chars (the `writeFeedbackFile` cap).
4. **Unicode title** — contains `H·AI·K·U` mid-dot (`·`), an emoji, and a
   leading-dot filename ref (`.haiku/…`).
5. **Embedded newlines** in the body (LF and CRLF) plus a body containing
   markdown special characters that need escaping when rendered inline
   (backticks, pipes, asterisks, brackets, underscores).
6. **Long-tail body** — ≥ 2 KB (typical adversarial finding) and one at
   ≥ 10 KB (long-tail). Both can be built once at module load using
   predictable filler text plus a stable tail so diffs remain readable.

Rotate `closed_by` across a small set when `status === "closed"`:
`unit-99-assessor`, `unit-03-builder`, `unit-14-ui-gate`, `intent-assessor`
(studio-level closure), so the FeedbackItem card that surfaces this slug is
exercised against varied shapes.

The generator stays pure: same `n` in → same items out. Snapshots stay
stable across runs.

### Why rotate, not randomize

- **Snapshot determinism.** Any randomness (`Math.random`, time-based
  seeds) breaks snapshot tests. A deterministic modulo-indexed rotation
  over a fixed library gives coverage without flake.
- **Assertion-stable.** Keyboard-nav, filter, and virtualization tests
  search by `data-feedback-id='FB-NN'`; they don't touch title/body text.
  States tests assert canonical verbs and aria labels, not body content.
  So rotating content doesn't invalidate any assertions — only snapshots —
  and the snapshot refresh is a one-time cost at bolt completion.
- **Reviewer mandate.** The mandate is "realistic", not "random". A
  library of six hand-written realistic fixtures hits the six failure
  modes the reviewer named and nothing else.

### Files to modify

1. `packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts` —
   rewrite. Keep the exported `mockItems(n)` signature
   (`(n: number) => FeedbackItemData[]`) and the deterministic output
   contract. Internally:
   - Add a `FIXTURES` array of `{ title: string; body: string }` of length
     ≥ 6 covering the six edge-case classes above. For the 2 KB / 10 KB
     long bodies, build them at module load via a small helper that
     concatenates a realistic review body + predictable filler — fixed
     seed, so snapshots stay deterministic.
   - Add a `CLOSED_BY_CYCLE: string[]` of four slugs
     (`unit-99-assessor`, `unit-03-builder`, `unit-14-ui-gate`,
     `intent-assessor`).
   - In the `for` loop, pick `FIXTURES[i % FIXTURES.length]` for title/body
     and `CLOSED_BY_CYCLE[i % CLOSED_BY_CYCLE.length]` for closed_by when
     status is `"closed"`; otherwise `null`.
   - Keep the `feedback_id`, `status`, `origin`, `author`, `author_type`,
     `created_at`, `visit`, `source_ref` logic unchanged.
   - Preserve or update the file-level docstring to describe the six
     fixture classes so future readers don't re-minimise it.

2. `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackItem.states.test.tsx.snap` —
   regenerate via `vitest -u`. Expected diffs: placeholder titles/bodies →
   realistic fixture content across the 24-cell matrix. Aria labels,
   verbs, status badges, opacity-0 class absence — all unchanged. Builder
   MUST visually diff the snapshot before committing to confirm no
   non-content regression sneaks in.

3. `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackList.states.test.tsx.snap` —
   regenerate via `vitest -u`. Same expected diff class (content only).

4. `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackSummaryBar.states.test.tsx.snap` —
   regenerate via `vitest -u` (even though the summary-bar doesn't render
   body, the 20-item matrix's card children may surface title). Sanity:
   aria-pressed, counts, data-status all unchanged.

### Tests

No new test file. The fix is a fixture correction; the **existing tests
that already consume `mockItems`** become the regression coverage:

- `FeedbackItem.states.test.tsx` — now renders multi-paragraph bodies,
  120-char titles, unicode, markdown characters. Any XSS / overflow /
  escaping bug in FeedbackItem that was hidden by placeholder data now
  surfaces as a test failure. If one does, the builder stops, opens a
  companion fix, and does not suppress it.
- `FeedbackList.virtualization.test.tsx` — 500 items at realistic sizes
  (~500 KB total) stresses the virtualization perf budget (≤ 30 mounted
  nodes at steady state). If the budget fails at realistic scale, this is
  real information; current pass at 10 KB is false confidence.
- `FeedbackList.keyboard.test.tsx` — ArrowDown through 100 realistic
  items. Focus management should be agnostic to content; this confirms it.
- `FeedbackList.states.test.tsx` — empty/loading/error states don't
  touch fixtures, so only the "default" snapshot shifts.
- `FeedbackSummaryBar.states.test.tsx` — filter button counts don't
  depend on content; the snapshot refreshes cleanly.

The planner-hat mandate requires **a step for implementing test coverage
for every scenario in the product stage's `.feature` files**. Cross-check:
`.haiku/intents/universal-feedback-model-and-review-recovery/features/`
scenarios for feedback lifecycle (`feedback-crud.feature`,
`review-ui-feedback.feature`) focus on wire-level CRUD and UI-lifecycle —
they do not add a new fixture-quality requirement. The FB-57 fix does not
introduce new behaviour, so it does not add new feature scenarios; it
**upgrades the data that existing tests feed into existing behaviour**.
The mandate is satisfied because the existing test suite continues to
cover every behavioural scenario, now against realistic input.

## Files to modify

- `packages/haiku-ui/src/components/feedback/__tests__/mockItems.ts` —
  rewrite the generator to rotate over six realistic edge-case fixtures
  and four `closed_by` slugs.
- `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackItem.states.test.tsx.snap` —
  regenerate.
- `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackList.states.test.tsx.snap` —
  regenerate.
- `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackSummaryBar.states.test.tsx.snap` —
  regenerate.

No production source file changes. No schema, API, or type changes.
`FeedbackItemData` already accepts every field shape the new fixtures use;
the reviewer confirmed the backend cap at 120 chars applies at write time,
not at render time.

## Verification

Run from repo root:

1. `cd packages/haiku-ui && npx tsc --noEmit` — strict compile clean; the
   new fixture arrays must conform to `FeedbackItemData` (esp. `closed_by:
   string | null`, `title: string` long-form).
2. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/mockItems` —
   if a dedicated fixture-generator test exists, it passes; otherwise the
   generator is exercised transitively by step 3.
3. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackItem.states.test.tsx -u` —
   snapshot refresh; visually diff `__snapshots__/FeedbackItem.states.test.tsx.snap`
   before commit. Every `aria-label="Status: *"`, every canonical verb
   (`Dismiss`, `Verify & Close`, `Reopen`), every `data-status` attribute
   must remain unchanged — only the title/body text should differ.
4. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackList.states.test.tsx -u` —
   snapshot refresh; confirm empty/loading/error snapshots are still
   byte-identical (those three cases use `items={[]}`, so only the
   default-state snapshot changes).
5. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackSummaryBar.states.test.tsx -u` —
   snapshot refresh; confirm counts on each filter button stay the same
   (status rotation is unchanged).
6. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackList.virtualization.test.tsx` —
   no snapshot flag; the 500-item realistic payload must still render
   ≤ 30 mounted nodes at steady state. If this fails, virtualization has a
   real perf regression at realistic scale and the builder opens a new
   finding rather than relaxing the cap.
7. `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackList.keyboard.test.tsx` —
   100 ArrowDown steps land on the right `data-feedback-id` regardless of
   content.
8. `cd packages/haiku-ui && npx vitest run` — full feedback-component
   suite green.
9. `grep -n "Lorem ipsum\|Fixture feedback item\|Body copy for" packages/haiku-ui/src` —
   expect zero hits (the placeholder strings are gone).
10. `grep -rn "mockItems" packages/haiku-ui/src` — confirm the five
    consumers still import from the same path; no orphaned references.

## Risks

- **Snapshot drift noise.** Regenerating snapshots always risks baking in
  an unrelated bug. Mitigation: builder must visually diff each refreshed
  snapshot file and confirm only title/body text changed. Structural
  attributes (aria, data-*, class, role) must be identical.
- **Virtualization perf.** Realistic bodies at 500 items push payload
  from ~10 KB to ~500 KB. If the current `react-window` config can't hold
  the ≤ 30 mounted cap under this load, the failure is a genuine signal
  of a virtualization gap — the builder should **not** raise the cap or
  shrink the test; it should open a new finding and fix the root cause.
  Per the parallel-batch warning, the builder reads the mockItems file
  state immediately before editing since another chain may have touched
  it; the snapshot refresh must be re-run against the freshly-edited
  generator output.
- **Long bodies in jsdom.** 10 KB markdown bodies render without layout,
  but remark/rehype parse time adds up if the FeedbackItem renderer runs
  a markdown pass per item. Cross-check: FeedbackItem renders `item.body`
  as plain text (it does not run markdownToSimpleHtml); confirmed by the
  existing snapshot which shows body wrapped in `<p class="text-xs …">`
  directly. No markdown parse per item → jsdom perf is fine at 500 items.
- **`closed_by` cross-stage slugs.** `writeFeedbackFile` stores whatever
  the assessor writes; the UI doesn't validate slug shape. Rotating four
  slugs exercises display code paths without introducing schema
  violations.
- **One bolt.** One file rewrite (~50–120 lines with the library),
  three snapshot regenerations (`vitest -u`), visual diff, commit.
  Comfortably within one bolt.

## Anti-patterns avoided

- No new unit spec created — strict fix-mode.
- No FSM field touched.
- Plan includes verification steps (MUST from hat mandate).
- Plan reads completion criteria (FB-57 body; stage scope; hat mandate
  on realistic test data).
- Risk assessment up front (MUST from hat mandate).
- Test-coverage step covered explicitly — existing feature-file scenarios
  remain satisfied by the upgraded fixtures; no behaviour added, no
  Cucumber / vitest scenario orphaned.
- No copy of a previous failed plan — this is the first bolt for FB-57.
- Fix is scoped to one bolt — well under the bolt-size ceiling.
