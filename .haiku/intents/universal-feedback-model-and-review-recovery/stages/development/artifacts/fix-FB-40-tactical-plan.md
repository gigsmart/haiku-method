# Fix FB-40 — Tactical Plan (planner, bolt 1)

**Finding:** `touch-target` test injects the CSS it is testing (circular proof).
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/40-touch-target-test-injects-the-css-it-is-testing-circular-pro.md`

## Root cause

`packages/haiku-ui/src/a11y/__tests__/touch-target.test.tsx` hand-writes the
`.touch-target { min-height: 44px; min-width: 44px; }` rule into a `<style>` tag in
`beforeAll`, then asserts `getComputedStyle` returns `44px`. The assertion resolves
against the hand-mirror, not the canonical `packages/haiku-ui/src/index.css`, so a
regression in `index.css` (rule deleted, value changed to `1px`, selector renamed)
would not fail the test.

`AgentFeedbackToggle.test.tsx` inherits the same hand-mirror pattern for the same
rule — same circularity, same blind spot.

## Fix approach (option 2 from the feedback body)

**Read the canonical CSS rule from `packages/haiku-ui/src/index.css` at test
runtime** using `readFileSync`, inject the *actual source text* into the document
so `getComputedStyle` continues to work in jsdom, **and** add a direct structural
assertion that the canonical rule is present in `index.css` with the expected
tokens. This removes the circularity because:

1. The CSS jsdom resolves against is the real source file, not a hand-mirror.
2. A structural assertion on the source file proves the `min-*: 44px` tokens
   actually exist in `index.css` — independent of jsdom's resolver.
3. If the canonical rule is deleted, renamed, or the values shrink, both
   assertions fail together.

Option 1 (Vitest CSS processing via `css: true`) is rejected because it pulls
in postcss/Tailwind build cost on every test run for a two-line rule. Option 3
(Playwright / Vitest browser mode) is out of scope — this repo explicitly bans
Playwright and switching the runner is not a feedback-scope change.

## Files to modify

1. **`packages/haiku-ui/src/a11y/__tests__/touch-target.test.tsx`**
   - Replace the hand-written CSS string in `beforeAll` with a `readFileSync` of
     `packages/haiku-ui/src/index.css`, extract the `.touch-target` + hit-area
     rule blocks via a regex on the actual source, and inject *that text*.
   - Add a standalone `describe("canonical CSS source")` block with two
     assertions: (a) the source file contains `.touch-target { ... min-height:
     44px; min-width: 44px; ... }`, (b) the hit-area modifier exists and unsets
     the min-* constraints. These assertions are file-level — jsdom is not in
     the loop.
   - Keep the existing computed-style assertion as a secondary safeguard
     (proves the class application end-to-end, now against real source).
   - Drop the misleading "mirrored here; any change … will fail first" docstring
     and replace with a note that the rule is loaded from source.

2. **`packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx`**
   - Replace the `beforeAll` hand-mirror with the same source-loaded pattern.
     Factor the shared helper into `packages/haiku-ui/src/a11y/__tests__/touch-target.css-loader.ts`
     (or keep inline — helper is preferred to prevent future drift).
   - Leave all other assertions untouched — only the CSS injection mechanism
     changes.

3. **`packages/haiku-ui/src/a11y/__tests__/touch-target.css-loader.ts` (new)**
   - Small helper: `loadTouchTargetCss(): string` reads `src/index.css` from the
     project root, extracts the `.touch-target` rule blocks via regex, returns
     the extracted text. Throws if the canonical rule is missing (fails tests
     loudly when the source rule is deleted).
   - Path resolution uses `fileURLToPath(new URL("../../index.css", import.meta.url))`
     so the test works from any CWD.

## Implementation steps (for the builder in bolt 2)

1. Create `src/a11y/__tests__/touch-target.css-loader.ts` with the extractor +
   source-file path resolution. Throw on missing rule.
2. Update `src/a11y/__tests__/touch-target.test.tsx`:
   - Import the loader.
   - Replace the hardcoded CSS template literal with `loadTouchTargetCss()`.
   - Add a new `describe("canonical index.css rule")` block asserting the rule
     text contains `min-height: 44px`, `min-width: 44px`, and the hit-area
     modifier present.
   - Update the docstring at top of file.
3. Update `src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx`:
   - Import the loader.
   - Replace the hardcoded CSS template literal with `loadTouchTargetCss()`.
   - Update the docstring note about mirroring.
4. Run `npm test -- a11y/__tests__/touch-target.test.tsx` and the AgentFeedbackToggle
   test. Both must still pass.
5. Regression check: temporarily edit `src/index.css` to reduce `min-height` to
   `1px`. Both tests must fail (structural assertion on the loader side and
   computed-style on the jsdom side). Revert the edit.

## Verification commands

```bash
# From packages/haiku-ui:
npx vitest run src/a11y/__tests__/touch-target.test.tsx
npx vitest run src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx
npx tsc --noEmit
```

All three must exit 0. No other tests should be affected because the loader is
test-only and the CSS injected is identical in content to the prior hand-mirror
(just read from a different source).

## Risks

- **Path resolution fragility** — `import.meta.url` relative path must resolve
  from both `vitest` CLI and IDE-triggered runs. `fileURLToPath` is the portable
  pattern already used in `vitest.config.ts` for `setupFiles`; reuse it.
- **Regex brittleness** — if the rule-extraction regex is too strict it'll
  fail on stylistic reformats in `index.css`. Use a permissive regex anchored
  on `.touch-target {` and `}`, not on whitespace or comment structure.
- **Parallel chain clobber (fix loop is parallel)** — other findings may be
  editing `index.css` (e.g., contrast/opacity fixes). Read the file immediately
  before extracting; do not rely on frozen content.
- **Scope creep** — do NOT touch `FeedbackFloatingButton.states.test.tsx` or
  `ThemeToggle.test.tsx`; those only assert classList and are not circular.

## Out of scope

- Reworking the whole jsdom-vs-real-css testing strategy for the repo.
- Adding a Playwright / Vitest browser-mode runner.
- Auditing every other `beforeAll` CSS-injection pattern in the codebase.

## Done when

- Both target tests load `.touch-target` CSS from `src/index.css` directly.
- Both target tests carry a structural assertion that the canonical rule exists
  with `min-height: 44px` and `min-width: 44px` in the source file.
- Deleting or weakening the `index.css` rule causes both tests to fail.
- `npx vitest run` for both files exits 0 on the unmodified source.
