# Fix FB-27 — Tactical Plan (planner, bolt 1)

**Finding:** `LegacyReviewPage (~1,400 lines) is dead code shipped to production`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/27-legacyreviewpage-1-400-lines-is-dead-code-shipped-to-product.md`

## TL;DR

`packages/haiku-ui/src/components/ReviewPage.tsx` exports `LegacyReviewPage`
(lines 157-522) — a 1,400-line monolith that has **zero external import
sites**. The canonical runtime path is `packages/haiku-ui/src/pages/review/ReviewPage.tsx`,
which only reuses four named exports from the legacy file: `IntentReview`,
`UnitReview`, `RereviewBanner`, and the `ReviewPageSessionData` type. Because
the Vite config pins `manualChunks: undefined` + `inlineDynamicImports: true`
for the MCP single-HTML-blob embedder, Rollup cannot tree-shake a named
`export` from a module whose other named exports ARE reachable — so the
dead body ships on every page load.

**Fix is Option B from the finding (clean delete):** remove the
`LegacyReviewPage` function body (lines 157-522), its local helpers
`loadDraft` / `saveDraft` / `DRAFT_STORAGE_KEY` / `ReviewDraft`
(lines 91-142), and the now-orphaned `useFeedback` import. Keep everything
else in the file — `IntentReview`, `UnitReview`, `OutputArtifactsTab`,
`UnitsTable`, `MockupEmbeds`, `markdownToSimpleHtml`, `formatRelativeTime`,
`RereviewBanner`, and all section helpers are still consumed by
`ArtifactsPane.tsx` and `pages/review/ReviewPage.tsx` via the canonical
composition. The `export { ReviewPage } from "../pages/review/ReviewPage"`
re-export (line 155) stays — that IS the load-bearing one, not a legacy
alias.

## Root cause

The claim in the docstring (lines 144-152) that "tests that depend on the
original composition can opt in explicitly" is **false**. Grep confirms
zero test imports of `LegacyReviewPage` anywhere in the monorepo:

```
$ rg 'LegacyReviewPage' packages/
packages/haiku-ui/src/components/ReviewPage.tsx:150:    * as `LegacyReviewPage` so tests that depend on the original composition
packages/haiku-ui/src/components/ReviewPage.tsx:157:export function LegacyReviewPage({ session, sessionId, wsRef }: Props) {
```

Only the docstring and the function itself reference the symbol. It is
pure dead weight — kept alive by the `export` keyword preventing
tree-shaking. Adversarial review (FB-22) already flagged the 1,659-line
file as a monolith that should have been extracted during unit-07;
FB-27 is the tactical companion: regardless of whether the rest of the
monolith is refactored, `LegacyReviewPage` itself has zero callers and
can be deleted today for an unambiguous bundle-size win.

## Confirmed reuse surface (MUST preserve)

Grep against `components/ReviewPage.tsx` consumers shows the canonical
three-pane composition imports the following symbols:

| Symbol | Consumer | Line |
|---|---|---|
| `ReviewPageSessionData` (type) | `pages/review/ReviewPage.tsx:54`, `ArtifactsPane.tsx:22`, 3× `__tests__/*.test.tsx` | type-only |
| `RereviewBanner` | `pages/review/ReviewPage.tsx:39` | named import |
| `IntentReview` | `pages/review/ArtifactsPane.tsx:21` | named import |
| `UnitReview` | `pages/review/ArtifactsPane.tsx:23` | named import |
| `ReviewPage` (re-export) | any legacy `import { ReviewPage } from "../components/ReviewPage"` sites | re-export from pages path |

All five survive the fix. `IntentReview` (line 535) and `UnitReview`
(line 911) remain in-place along with the internal `OutputArtifactsTab`,
`UnitsTable`, `MockupEmbeds`, `markdownToSimpleHtml`, `formatRelativeTime`,
and section-finding helpers (`findSection`, `findSectionWithSubs`,
`getPreamble`, `isImageUrl`) that they use. The re-export at line 155
also stays.

## Confirmed dead surface (MUST remove)

| Symbol | Lines | Reason dead |
|---|---|---|
| `ReviewDraft` interface | 91-94 | Only used by `loadDraft` / `saveDraft` / inside `LegacyReviewPage` |
| `DRAFT_STORAGE_KEY` | 96-97 | Only used by `loadDraft` / `saveDraft` / inside `LegacyReviewPage` |
| `loadDraft` | 99-126 | Only called at `LegacyReviewPage` line 214 |
| `saveDraft` | 128-142 | Only called at `LegacyReviewPage` line 267 |
| `LegacyReviewPage` function body | 157-522 | Zero external callers (verified via rg) |
| `import { useFeedback } from "../hooks/useFeedback"` | line 7 | Only consumed by `LegacyReviewPage` line 174. `ReviewCurrentPage.tsx` and `FeedbackSidebar.tsx` import `useFeedback` from their own paths — removing this import does NOT affect them. |

The docstring block (lines 144-152) should be reduced to a one-line
comment above the re-export explaining what `components/ReviewPage.tsx`
is now (a barrel for the leaf views + a re-export shim), not a promise
about a legacy composition that no longer exists.

## Files to modify (builder scope)

| File | Change |
|---|---|
| `packages/haiku-ui/src/components/ReviewPage.tsx` | Delete lines 91-142 (draft persistence), lines 157-522 (`LegacyReviewPage` body), rewrite the docstring above line 155 to describe the current purpose, drop the `useFeedback` import on line 7. |
| `packages/haiku-ui/dist/index.html` + `dist/assets/*` | Regenerated by `npm run build -w haiku-ui`. Bundle shrinks. |
| `packages/haiku-ui/budget-baseline.json` | Rewritten by `node packages/haiku-ui/scripts/audit-bundle-size.mjs --update-baseline` to lock in the new baseline. |
| `packages/haiku/src/review-app-html.ts` (if auto-embedded) | Regenerated by the bundle script. Check its build wiring. |

Do **not** touch `budget.json#bundleGzipMaxBytes` in this fix. FB-21
(minification) owns the ceiling-tightening decision. FB-27 should show
up as a clean negative delta in the baseline-update diff, not as a
ceiling change. If FB-21 already shipped in parallel and the ceiling
is tighter, the baseline-update in this fix still works — the audit
script's 5% regression guard is directional (trips on increases), so
decreases always pass.

## Verification commands (builder must run these and capture output)

```bash
# (a) Confirm the dead symbol is gone from source.
rg 'LegacyReviewPage|loadDraft|saveDraft|DRAFT_STORAGE_KEY|ReviewDraft' packages/haiku-ui/src
#   expected: zero matches

# (b) Type-check passes — no dangling references to the removed symbols.
npm run -w haiku-ui typecheck   # (or `npx tsc -p packages/haiku-ui --noEmit` if no script)
#   expected: exit 0

# (c) Build succeeds and shrinks.
npm run build -w haiku-ui
#   expected: exit 0, dist/index.html regenerated, lower byte count in dist/assets/*.js

# (d) Measure the win BEFORE updating the baseline.
node packages/haiku-ui/scripts/audit-bundle-size.mjs
#   expected: negative Δ% (5-8 KB gzipped drop is the conservative estimate from the finding;
#             the actual number should land in that range for a 1400-LOC React component
#             with stringy className templates). Audit should still exit 0 — any decrease
#             trivially passes the 5% regression guard.

# (e) Lock in the new baseline.
node packages/haiku-ui/scripts/audit-bundle-size.mjs --update-baseline
#   expected: rewrites budget-baseline.json#gzipBytes to the new lower value

# (f) Full test suite — no import of the removed symbols should break anything.
npx vitest run --dir packages/haiku-ui
#   expected: all tests green

# (g) Review-app HTML blob sync check — if this file is build-generated, it should be
#     regenerated by the build above. If it is hand-edited or committed separately, the
#     parallel-chain section below explains how to detect that.
ls -la packages/haiku/src/review-app-html.ts
git status packages/haiku/src/review-app-html.ts
```

## Risk assessment

- **Does deleting the export break a test that silently re-exports it?** No.
  `rg 'LegacyReviewPage' packages/` returns zero outside the file itself
  — including tests, story files, and template strings in `packages/haiku/`.
  The docstring's "tests that depend on the original composition" claim
  is aspirational / stale.
- **Does dropping `loadDraft` / `saveDraft` break draft persistence?**
  The draft-persistence feature lives inside `LegacyReviewPage` itself
  (the `loadDraft(sessionId)` call is at line 214, inside the body being
  deleted). The canonical `pages/review/ReviewPage.tsx` composition does
  not persist drafts — that feature was a legacy behavior. If draft
  persistence is actually a requirement, it is a separate product gap
  (would need its own feedback). FB-27 is bounded to removing the dead
  symbol; do not resurrect persistence here.
- **Does removing `useFeedback` from this file break other consumers?**
  No. `ReviewCurrentPage.tsx:3` imports `useFeedback` directly from
  `"../hooks/useFeedback"` (not via barrel), and `FeedbackSidebar.tsx:32`
  imports it from `"../../hooks/useFeedback"`. Neither is affected by
  removing the import from `components/ReviewPage.tsx`.
- **Does tree-shaking now drop the `IntentReview` / `UnitReview` /
  `RereviewBanner` exports if they have no callers?** They DO have
  callers — `ArtifactsPane.tsx` imports `IntentReview` + `UnitReview`
  at lines 21-23, and `pages/review/ReviewPage.tsx` imports
  `RereviewBanner` at line 39. Tree-shaking will preserve them.
- **What about the remark/remark-gfm/remark-html imports (lines 4-6)?**
  `markdownToSimpleHtml` (line 1612) uses them — that function is called
  from `IntentReview` at line 625, 832, 843 and from `UnitReview` at
  line 1066, 1248, 1503. Keep the imports. Do NOT drop them.
- **Parallel-chain clobber risk.** FB-22 (1,659-line monolith) is the
  adjacent finding and may be fixed in parallel. If FB-22 extracts
  `IntentReview` / `UnitReview` into separate files, that fix will
  almost certainly delete the legacy body too as part of the extraction.
  The builder MUST re-read `components/ReviewPage.tsx` immediately before
  editing:
    - If `LegacyReviewPage` is already gone, this fix is a no-op —
      feedback-assessor should close FB-27 on the next bolt.
    - If `LegacyReviewPage` is still present but the file has been
      reorganized around it, locate the symbol by name rather than by
      line number and delete from `export function LegacyReviewPage` to
      the matching closing brace (~366 lines later).
- **Does FB-21 (minification) interact?** Yes, but additively. FB-21
  flips `minify: false` → `minify: "esbuild"`. That divides total bytes
  by roughly 2×. FB-27 removes source that counts pre-minification. If
  FB-21 shipped first, FB-27's gzipped delta shrinks (fewer pre-minify
  bytes means less payoff from deletion), but it's still a clean win
  and the baseline still records the drop.

## Handoff to the builder

Builder bolt (bolt 2) should:

1. Re-read `packages/haiku-ui/src/components/ReviewPage.tsx` and locate
   these landmarks (line numbers may drift if FB-22 ran first):
   - `interface ReviewDraft` block (currently ~91)
   - `function loadDraft` (currently ~99)
   - `function saveDraft` (currently ~128)
   - `/**\n * Legacy monolithic...` docstring (currently ~144)
   - `export { ReviewPage } from "../pages/review/ReviewPage"` (currently ~155)
   - `export function LegacyReviewPage(` (currently ~157)
   - The matching closing `}` for `LegacyReviewPage` (currently ~522)
2. If `LegacyReviewPage` is already gone (FB-22 ran first), `rg 'LegacyReviewPage' packages/`
   returns zero, and draft persistence helpers are also gone, commit an
   empty no-op explanation: `haiku: fix FB-27 bolt 2 (builder) — already resolved by FB-22`
   and return. Do NOT retry the deletion.
3. Otherwise, make these edits in one pass:
   - Remove the `import { useFeedback } from "../hooks/useFeedback"`
     line (currently 7).
   - Delete the `ReviewDraft` interface, `DRAFT_STORAGE_KEY`, `loadDraft`,
     and `saveDraft` (currently lines 91-142).
   - Rewrite the docstring block (currently 144-152) to:
     ```
     /**
      * Barrel module for the review-page leaf views (IntentReview / UnitReview /
      * RereviewBanner) plus helpers (markdownToSimpleHtml, formatRelativeTime,
      * section finders). The canonical <ReviewPage> composition lives at
      * `pages/review/ReviewPage.tsx`; the re-export below keeps legacy import
      * sites working.
      */
     ```
   - Delete the entire `LegacyReviewPage` function body (currently 157-522).
4. Re-read the file end-to-end after edits — confirm line count dropped
   from 1,659 to ~1,200 and no syntax errors.
5. Run verification commands (a) through (g) above in order. Capture
   output in the commit message if any delta is surprising.
6. If `packages/haiku/src/review-app-html.ts` is build-generated
   (check file header for a `// AUTO-GENERATED` banner and the bundle
   script `packages/haiku/scripts/bundle-haiku-ui.mjs`), regenerate it
   via the build. Otherwise leave it alone — it is currently untracked
   in git status, so it likely is the generated artifact.
7. Commit with message `haiku: fix FB-27 bolt 2 (builder)`. Do not push.
8. Do NOT touch `budget.json#bundleGzipMaxBytes` (FB-21's domain). Do
   update `budget-baseline.json` via `--update-baseline` to lock in
   the reduction.

## Out of scope

- **Extracting `IntentReview` / `UnitReview` into their own files.**
  That's FB-22's domain (1,659-line monolith). FB-27 is bounded to
  removing the dead function; the file's remaining organization is
  someone else's fix.
- **Changing `manualChunks` / `inlineDynamicImports`.** These are
  MCP-embedder invariants (see FB-21 tactical plan §Risk). Do not touch.
- **Resurrecting draft persistence elsewhere.** If it's needed, it
  needs a new feedback and a new unit. Not FB-27's job.
- **Bundle-ceiling tightening.** Owned by FB-21. FB-27 shows up as a
  baseline reduction; the `bundleGzipMaxBytes` field is untouched.
- **Paper / website / CLAUDE.md updates.** Dead-code deletion is an
  implementation concern; sync discipline does not apply.

## Done when

- `rg 'LegacyReviewPage' packages/haiku-ui/src` returns zero matches.
- `rg 'loadDraft|saveDraft|DRAFT_STORAGE_KEY|ReviewDraft' packages/haiku-ui/src` returns zero matches.
- `packages/haiku-ui/src/components/ReviewPage.tsx` line count is reduced by ~450 lines (from 1,659 to ~1,200).
- `packages/haiku-ui/src/pages/review/ReviewPage.tsx` and
  `packages/haiku-ui/src/pages/review/ArtifactsPane.tsx` still import
  their named exports from the file without error.
- `npm run build -w haiku-ui` exits 0.
- `node packages/haiku-ui/scripts/audit-bundle-size.mjs` exits 0 with a negative Δ%.
- `node packages/haiku-ui/scripts/audit-bundle-size.mjs --update-baseline` has written a lower `budget-baseline.json#gzipBytes`.
- `npx vitest run --dir packages/haiku-ui` exits 0.
- `haiku: fix FB-27 bolt 2 (builder)` commit exists on the branch.
- Feedback-assessor (bolt 3) confirms the dead function is gone, the
  bundle shrank, and the canonical `<ReviewPage>` still renders.
