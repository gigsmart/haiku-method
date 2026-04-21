# Fix FB-55 — Tactical Plan (planner, bolt 1)

**Finding:** Primary `bg-teal-600` + `text-white` buttons fail WCAG 1.4.3 AA
contrast for normal-sized text (body 16px, semibold and smaller).
`text-white` on `#0d9488` measures **3.74:1** (the feedback body cites 3.10
using a different formula; my deterministic WCAG-2.1 sRGB→linear check via
the project's own `audit-contrast.mjs` luminance formula returns **3.74**).
Either way, below the 4.5:1 floor for normal text. The dark-mode fallback
`dark:bg-teal-500` with white text measures **2.49:1** on its own element
(the element's own bg is bright cyan regardless of the dark page behind
it) — a harder fail.

`teal-700` + white = **5.47:1** → passes 4.5:1 normal-text AA with margin.
This is the single-step lift the finding recommends.

**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/55-primary-teal-600-white-buttons-fail-wcag-aa-contrast-3-1-1-4.md`

## Precedent (verified 2026-04-21)

- **FB-61 (fix committed 14cb62cd)** already landed a narrower teal-contrast
  fix on the Approve button in `pages/review/FooterBar.tsx`. That plan's
  math claimed teal-600 + white = 4.54:1 — **that claim is wrong** (actual
  3.74:1). FB-61's token swap was correct in direction (emerald→teal) but
  does NOT clear AA on its own. FB-55 is the stage-wide sweep that makes
  all primary teal surfaces pass. The FB-61 Approve button will be
  re-visited by this plan via the canonical `Button primary` variant
  token update (see §Files → `primitives/Button.tsx`).
- **DESIGN-TOKENS §1 (line 32)** currently declares
  `Accent (primary): bg-teal-600 / dark:bg-teal-600`. That token row is
  the root cause — it ships the failing pair as canonical. The fix
  includes a DESIGN-TOKENS §1.1b update noting the AA lift to
  `teal-700` + white for text-bearing surfaces (matches the existing
  §1.1a unit-11 style of a "banned pairs" addendum).
- **`audit-contrast.mjs` PAIRS** (line 177 onward) enumerates 30+
  (fg, bg) tuples but has **zero entries for the primary-action button
  surface**. This is the structural gap the feedback calls out.

## Current state (verified against tree, not feedback body's line numbers)

**Files the feedback flags — verified 2026-04-21:**

| File                                                       | Line | Current tokens                                         | Status                     |
|------------------------------------------------------------|-----:|--------------------------------------------------------|----------------------------|
| `packages/haiku-ui/src/pages/direction/DirectionPage.tsx`  |  258 | `bg-teal-600 hover:bg-teal-700 text-white`             | active; matches feedback   |
| `packages/haiku-ui/src/pages/question/QuestionPage.tsx`    |  192 | `bg-teal-600 hover:bg-teal-700 text-white`             | active; matches feedback   |
| `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx`   |  203 | (not present — FB-38 relocated FAB)                    | **drift — see below**      |
| `packages/haiku-ui/src/components/SkipLink.tsx`            |   21 | `focus-visible:bg-teal-600 focus-visible:text-white`   | active; matches feedback   |
| `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx` | 88 | `bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-400` (`TRACK_ON`) | active; matches feedback |
| `packages/haiku-ui/src/components/feedback/FeedbackList.tsx` |  177 | `bg-teal-600 text-white hover:bg-teal-700`             | active; matches feedback   |
| `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`  |  765 | `bg-teal-600 text-white border-teal-700 hover:bg-teal-700 dark:bg-teal-500 dark:border-teal-400` | active; matches feedback (line 765, not 771) |
| `packages/haiku-ui/src/components/AnnotationCanvas.tsx`    |  411 | `text-white bg-teal-600 hover:bg-teal-700`             | legacy path (imported for types only in ReviewPage.tsx:35, ArtifactsPane.tsx:18); still ships |
| `packages/haiku-ui/src/components/ReviewSidebar.tsx`       | 311, 387, 409, 501 | `bg-teal-600 text-white hover:bg-teal-700` (+ variants) | legacy path; FB-27 owns dead-code decision |
| `packages/haiku-ui/src/components/InlineComments.tsx`      |  296 | `text-white bg-teal-600 hover:bg-teal-700`             | legacy path |

**Files NOT in the feedback but carrying the same pair (required to close
the finding stage-wide — the feedback explicitly says "every primary
action that uses this pair"):**

| File                                                       | Line | Current tokens                                                                | Rationale for inclusion                                                                  |
|------------------------------------------------------------|-----:|-------------------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `packages/haiku-ui/src/components/primitives/Button.tsx`   |   19 | `primary: "bg-teal-600 hover:bg-teal-700 text-white"`                          | Canonical `<Button variant="primary">` — all new primary-action surfaces derive from this. Fixing here stops future regressions at the source. |
| `packages/haiku-ui/src/pages/review/FeedbackFloatingButton.tsx` |   33 | `bg-teal-600 text-white ... hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600` | FB-38 relocated here from `FeedbackSidebar.tsx:203` — this IS the mobile FAB the feedback names. Different path, same offender. |
| `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx` |   62 | `bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400`         | Second (duplicate) FAB file — flagged by FB-12. FB-55 scope: change its tokens too; FB-12 owns the dedup. Do NOT delete the file. |
| `packages/haiku-ui/src/components/primitives/Chip.tsx`     |   14 | `teal: "border-transparent bg-teal-600 text-white dark:bg-teal-500"`           | `Chip tone="teal"` renders `text-white` on `bg-teal-600` as the "active filter pill" — same WCAG 1.4.3 failure. DESIGN-BRIEF §2 calls the filter pill primary; it's a text-bearing surface. |

**Drift the feedback body has vs. the current tree:**

- Feedback says `FeedbackSidebar.tsx:203`. FB-38 (committed ca42d32b)
  split that file — the offending FAB moved to
  `pages/review/FeedbackFloatingButton.tsx:33`. Plan the fix at the
  current location. Do NOT create a missing line 203.

- Feedback says `AnnotationCanvas.tsx:771`. The actual offender in the
  current file is on line **765**. The `"Create"` button label lives on
  line 768. Grep anchor: `"bg-teal-600 text-white border-teal-700"`.

## Fix approach

The feedback body names two token choices: darken primary to `teal-700`,
or move to a different hue. `teal-700` is the correct canonical lift —
it is already in the codebase as the `hover:` state, passes AA at 5.47:1,
and aligns with DESIGN-TOKENS §1.1a/FB-15's "lift-by-one-step" pattern.
Changing hues would require redoing the brand accent and all
`text-teal-{600,700}` tokens that pair against light backgrounds —
out of scope and not justified by this finding.

### Base state (enabled) — universal swap

`bg-teal-600` → `bg-teal-700` on every primary-action surface that
carries `text-white`. Derived hover state lifts one further step:
`hover:bg-teal-700` → `hover:bg-teal-800` (`#115e59` = 7.58:1 on white,
even more margin).

### Dark-mode fallback — universal swap

`dark:bg-teal-500` → `dark:bg-teal-600` (teal-600 + white = 3.74:1 on
light, but on dark-surface pages the element's *own* bg is what we
measure; teal-600's luminance of 0.29 vs. white at 1.0 is the same
element-intrinsic pair regardless of page bg — so the swap alone is not
enough). The correct lift is `dark:bg-teal-500 → dark:bg-teal-700` so
the contrast on the button itself clears 5.47:1 in dark mode too. The
dark hover swaps from `dark:hover:bg-teal-400` (2.00:1) or
`dark:hover:bg-teal-600` (3.74:1) to `dark:hover:bg-teal-800` (7.58:1).

**One exception:** `AnnotationCanvas.tsx` (both copies) paints pin
*markers* — that's non-text UI and carries the numeral inside the pin.
FB-58 separately owns the pin-marker contrast fix (it lives on line 637
of `pages/review/AnnotationCanvas.tsx`). FB-55 does NOT touch the pin
markers. FB-55 DOES touch the adjacent annotation popover "Create"
button on line 765 of the same file — that's a primary button surface
and falls under this plan.

### Structural gap fix — PAIRS roster + banned-pattern

Two audit additions, both tied to `packages/haiku-ui/`:

1. **Add primary-button pairs to `scripts/audit-contrast.mjs` PAIRS.**
   Insert after the `disabled-button` block (current line ~218):

   ```js
   // ── DESIGN-TOKENS §1 Primary-action button surfaces (FB-55) ──────────
   { group: "primary-button", variant: "enabled-light", fg: "white", bg: "teal-700", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
   { group: "primary-button", variant: "hover-light",   fg: "white", bg: "teal-800", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
   { group: "primary-button", variant: "enabled-dark",  fg: "white", bg: "teal-700", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
   { group: "primary-button", variant: "hover-dark",    fg: "white", bg: "teal-800", sizeBucket: "text-normal", underlyingBg: TOKEN_HEX["stone-950"] },
   ```

   New hex entries required in `TOKEN_HEX` (current map stops at `teal-700`):

   ```js
   "teal-800": "#115e59",
   ```

   `teal-500` (#14b8a6) must also be added if we want the audit to
   reject future uses of `dark:bg-teal-500 text-white` explicitly,
   but because the fix *removes* all such pairs, the simpler form is
   to NOT add a `teal-500 text-white` pair (PAIRS is a pass-gate, not
   a ban-gate — a passing 4.5:1 roster with no teal-500 entry means
   any reintroduction goes un-caught at the token level). The
   banned-pattern rule below closes that gap instead.

2. **Add banned-pattern rule to `packages/haiku-ui/audit-config.json`
   profile `tokens`.** Following the exact shape FB-46 landed for
   `banned-stone-400-on-stone-800-dark`:

   ```json
   {
     "id": "banned-primary-teal-600-white",
     "description": "bg-teal-600 paired with text-white on the same element fails WCAG 1.4.3 AA (3.74:1 < 4.5:1). Use bg-teal-700 text-white (5.47:1). See DESIGN-TOKENS §1.1b (FB-55).",
     "pattern": "bg-teal-600\\b[^\"'`]*\\btext-white\\b|text-white\\b[^\"'`]*\\bbg-teal-600\\b",
     "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   },
   {
     "id": "banned-primary-teal-500-white-dark",
     "description": "dark:bg-teal-500 paired with text-white on the same element collapses to 2.49:1 — below both 3:1 UI-nontext floor and 4.5:1 text floor. Use dark:bg-teal-700 text-white. See DESIGN-TOKENS §1.1b (FB-55).",
     "pattern": "dark:bg-teal-500\\b[^\"'`]*\\btext-white\\b|text-white\\b[^\"'`]*\\bdark:bg-teal-500\\b",
     "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   }
   ```

   Insert both rules immediately after the existing `banned-stone-400-on-stone-800-dark`
   rule (FB-46 landed it at rule-array position 4). The two new rules
   sit together as positions 5 and 6.

### Knowledge-doc update — DESIGN-TOKENS §1.1b

Add a new addendum subsection matching the §1.1a template. Insert after
§1.1a (current knowledge copy line 59, immediately before §1.2 at line
61). New §1.1b content:

```md
### 1.1b Banned Primary-Action Button Pairs (FB-55, WCAG 2.1 AA)

The `Accent (primary)` row in §1 ships `bg-teal-600` as the token. On
text-bearing surfaces (buttons, chips, FAB, active toggle tracks,
popover primary actions) paired with `text-white`, the measured contrast
is 3.74:1 — below the 4.5:1 floor for normal text. The canonical lift
is `bg-teal-700` + `text-white` (5.47:1). Dark-mode surfaces follow the
same lift: `dark:bg-teal-700` (not `teal-500` / `teal-600`) + `text-white`.

| Foreground token | Forbidden background tokens           | Measured ratio | Required remediation                                          |
|------------------|---------------------------------------|----------------|---------------------------------------------------------------|
| `text-white`     | `bg-teal-600`                          | 3.74:1         | `bg-teal-700` (5.47:1) — hover lifts to `bg-teal-800` (7.58:1) |
| `text-white`     | `dark:bg-teal-500`                     | 2.49:1         | `dark:bg-teal-700` (5.47:1) — hover `dark:bg-teal-800`          |
| `text-white`     | `bg-teal-500`                          | 2.49:1         | Not used for text surfaces. Reserved for dark-mode icon tint on
                                                                             dark pages only (§1 note line 32 row remains unchanged for
                                                                             `text-teal-*` tokens). |

Enforcement: `scripts/audit-contrast.mjs` PAIRS roster now includes
the four `(white, teal-{700,800})` pairs (light + dark × enabled + hover).
`audit-config.json` profile `tokens` carries two banned-pattern rules
(`banned-primary-teal-600-white`, `banned-primary-teal-500-white-dark`)
that forbid the two specific co-occurrences on the same className string
under `packages/haiku-ui/src/`.

The `Accent (primary)` row in §1 stays unchanged at the *token* level
(`text-teal-600` / `bg-teal-600` — these are generally safe when one is
foreground and the other is a light `teal-100` / `teal-900/30` bg — see
§1.2 line 68 `in_progress` badge which uses `bg-teal-100 text-teal-700`).
The narrow failure is specifically the **white-foreground on teal-6/500
background** combination. §1.1b encodes that, §1 remains the general
row.
```

Place §1.1b precisely between line 59 (end of §1.1a) and line 61 (§1.2
heading). No other doc changes.

## Files to modify (exhaustive)

Group A — component source (primary fix surface):

1. `packages/haiku-ui/src/components/primitives/Button.tsx` — line 19.
   `primary: "bg-teal-600 hover:bg-teal-700 text-white"` →
   `primary: "bg-teal-700 hover:bg-teal-800 text-white"`.

2. `packages/haiku-ui/src/pages/direction/DirectionPage.tsx` — line 258.
   In the className template literal, swap `bg-teal-600 hover:bg-teal-700`
   → `bg-teal-700 hover:bg-teal-800`.

3. `packages/haiku-ui/src/pages/question/QuestionPage.tsx` — line 192.
   Same swap as #2.

4. `packages/haiku-ui/src/components/SkipLink.tsx` — line 21. Swap
   `focus-visible:bg-teal-600` → `focus-visible:bg-teal-700`. The
   `focus-visible:ring-teal-500 focus-visible:ring-offset-2` ring stays
   as-is (3:1 non-text UI threshold, ring measures against its own
   offset color, not against white — no change needed).

5. `packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx`
   — line 88. `TRACK_ON` swap:
   - Old: `"bg-teal-600 dark:bg-teal-500 hover:bg-teal-700 dark:hover:bg-teal-400"`
   - New: `"bg-teal-700 dark:bg-teal-700 hover:bg-teal-800 dark:hover:bg-teal-800"`

   Note: the toggle TRACK is a non-text UI indicator (the thumb is the
   moving piece; the label is outside the track). WCAG 1.4.11 floor is
   3:1 against surrounding page. `teal-700` on white = 5.47:1 (passes);
   on dark-mode `stone-900` = 2.21:1 — below the 3:1 UI floor. Lift
   dark-mode track to `dark:bg-teal-500` (which = 7.94:1 on stone-950) —
   **except** the feedback body flags dark:bg-teal-500 for the toggle
   *specifically* because the toggle is sometimes described as on-track
   white thumb. Here the thumb is `bg-white` — the thumb+track contrast
   matters for distinguishing thumb from track (not ambient page).
   `white` on `teal-500` = 2.49:1 is below the 3:1 UI floor. `white`
   on `teal-700` = 5.47:1 — passes. Keep dark fallback at `teal-700`
   for both ambient-page and thumb-track contrast; drop `teal-500` /
   `teal-400`.

6. `packages/haiku-ui/src/components/feedback/FeedbackList.tsx` — line
   177. Swap `bg-teal-600 text-white hover:bg-teal-700` →
   `bg-teal-700 text-white hover:bg-teal-800`. The trailing
   `dark:bg-teal-600 dark:hover:bg-teal-700` → `dark:bg-teal-700 dark:hover:bg-teal-800`.

7. `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` — line
   **765** (not 771 — feedback body line number is stale). The enabled
   branch string:
   - Old: `"bg-teal-600 text-white border-teal-700 hover:bg-teal-700 dark:bg-teal-500 dark:border-teal-400"`
   - New: `"bg-teal-700 text-white border-teal-800 hover:bg-teal-800 dark:bg-teal-700 dark:border-teal-800"`

8. `packages/haiku-ui/src/pages/review/FeedbackFloatingButton.tsx` —
   line 33 (the canonical mobile FAB post FB-38). In the template
   literal, swap:
   - `bg-teal-600` → `bg-teal-700`
   - `hover:bg-teal-700` → `hover:bg-teal-800`
   - `dark:bg-teal-500` → `dark:bg-teal-700`
   - `dark:hover:bg-teal-600` → `dark:hover:bg-teal-800`

9. `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx`
   — line 62. Same four swaps as #8. Do NOT delete the file (FB-12 owns
   the dedup decision). Keep the two files in lockstep so whichever
   eventually survives ships the correct tokens.

10. `packages/haiku-ui/src/components/primitives/Chip.tsx` — line 14.
    `teal: "border-transparent bg-teal-600 text-white dark:bg-teal-500"`
    → `teal: "border-transparent bg-teal-700 text-white dark:bg-teal-700"`.

Group B — legacy paths (the finding names them; minimal correct fix):

11. `packages/haiku-ui/src/components/AnnotationCanvas.tsx` — line 411.
    Swap `bg-teal-600 hover:bg-teal-700` → `bg-teal-700 hover:bg-teal-800`.

12. `packages/haiku-ui/src/components/ReviewSidebar.tsx` — lines 311,
    387, 409 (ternary branch), 501. Each occurrence of `bg-teal-600
    hover:bg-teal-700 text-white` → `bg-teal-700 hover:bg-teal-800 text-white`
    (order-insensitive; match on the two class tokens only). Line 409
    specifically has the `? ... : "bg-teal-600 hover:bg-teal-700 text-white"`
    branch — edit only the string literal, not the surrounding ternary.

13. `packages/haiku-ui/src/components/InlineComments.tsx` — line 296.
    Swap `bg-teal-600 hover:bg-teal-700` → `bg-teal-700 hover:bg-teal-800`.

Group C — audit machinery:

14. `packages/haiku-ui/scripts/audit-contrast.mjs`:
    - In `TOKEN_HEX` (line 45-90), add `"teal-800": "#115e59",` after
      the `"teal-700": "#0f766e",` line.
    - In `PAIRS` (line 177-230), insert the four new
      `group: "primary-button"` entries (see §Fix approach above) after
      the `disabled-button` block (after line 218).

15. `packages/haiku-ui/audit-config.json` — insert the two new rules
    `banned-primary-teal-600-white` and `banned-primary-teal-500-white-dark`
    after the existing `banned-stone-400-on-stone-800-dark` rule landed
    by FB-46.

Group D — knowledge doc:

16. `.haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md`
    — insert the new §1.1b subsection content between current lines 59
    and 60 (end of §1.1a table, before the §1.2 heading).

Group E — test fixtures:

17. `packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx`
    — line 18 test `"renders teal (active filter) tone with bg-teal-600
    + text-white"` currently asserts the banned pair. Update the test
    name and the two `toContain` assertions:
    - `expect(cls).toContain("bg-teal-600")` → `expect(cls).toContain("bg-teal-700")`
    - Update the `it()` description string.
    This is not optional — the test asserts the offending pair.

18. Snapshot files are regenerated by `npm test -- -u`. The known
    affected snapshots:
    - `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackFloatingButton.states.test.tsx.snap` (6 snapshots)
    - `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/AgentFeedbackToggle.states.test.tsx.snap` (2 snapshots)
    - `packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/FeedbackList.states.test.tsx.snap` (1 snapshot)

    `StageProgressStrip.states.test.tsx.snap` matches `dark:bg-teal-500`
    inside a `bg-teal-400 dark:bg-teal-500` connector bar. Those are
    **non-text connector indicators** (h-[2px] decoration). Per FB-63
    (which reviews StageProgressStrip's color-only conveyance) and the
    fact that `teal-500` on `stone-950` = 7.94:1 passes the 3:1 UI
    floor, FB-55 does NOT touch the StageProgressStrip connector
    classes. Its snapshots should NOT change under this fix. If the
    builder runs `npm test -- -u` and sees the StageProgressStrip
    snapshot diff, that's a signal of a mis-targeted edit — revert
    and re-target.

## Implementation steps (for the builder in bolt 2)

1. **Recon before editing** — parallel chains may have touched adjacent
   files (FB-52, FB-54, FB-58, FB-61 are in-flight). Run:

   ```bash
   grep -n "bg-teal-600" packages/haiku-ui/src
   grep -n "dark:bg-teal-500" packages/haiku-ui/src
   grep -rn "bg-teal-600 text-white" packages/haiku-ui/src
   ```

   Confirm the 13 source-file occurrences listed above still exist at
   the stated lines. If any file has been restructured, re-locate the
   class string via literal grep and plan the edit around the new line
   numbers. Do NOT trust the feedback body's line numbers — they are
   pre-FB-38.

2. **Apply Group A edits (steps 1-10 above).** One file per edit. For
   each file, re-read the surrounding 5 lines, replace the literal
   class substrings, save.

3. **Apply Group B edits (steps 11-13 above).** Legacy paths — same
   literal swap.

4. **Apply Group C edits (steps 14-15 above).**
   - `audit-contrast.mjs`: add `"teal-800": "#115e59",` to `TOKEN_HEX`.
     Add the four `primary-button` entries to `PAIRS`.
   - `audit-config.json`: append the two new rule objects after
     `banned-stone-400-on-stone-800-dark`. JSON-escape pattern
     backslashes as `\\b` and quotes as `\"`.

5. **Apply Group D knowledge doc edit.** Insert §1.1b as a new
   subsection. Keep the §1 row (line 32) unchanged. Paper does not
   need a sync update — DESIGN-TOKENS is a project-local knowledge doc,
   not the HAIKU paper.

6. **Apply Group E test fixture edit.** Only the Chip test file needs
   a hand-edit. Snapshots regenerate via `npm test -- -u`.

7. **Run the audit** to confirm no new violations and the new PAIRS
   pass:

   ```bash
   node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens
   ```

   Expect: all pairs pass, including the four new `primary-button`
   entries.

8. **Run the banned-pattern audit** to confirm zero `bg-teal-600 text-white`
   hits under `packages/haiku-ui/src/`:

   ```bash
   cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs tokens
   ```

   Expect: 0 violations. If the repo has a different audit entrypoint,
   discover it via `node packages/haiku-ui/scripts/audit-banned-patterns.mjs --help`
   or `package.json` `scripts.audit`.

9. **Run the full haiku-ui test suite + update snapshots:**

   ```bash
   cd packages/haiku-ui && npm test -- -u
   ```

   Review the snapshot diff. Acceptable diffs:
   - `FeedbackFloatingButton.states.test.tsx.snap` — `teal-600→700`,
     `teal-700→800`, `teal-500→700`, `teal-400→800`.
   - `AgentFeedbackToggle.states.test.tsx.snap` — same four swaps.
   - `FeedbackList.states.test.tsx.snap` — enabled/hover teal swaps.

   Unacceptable diffs (revert and re-target):
   - Any snapshot outside the three listed files.
   - Any class other than `teal-{400,500,600,700,800}` changing.
   - `StageProgressStrip.states.test.tsx.snap` regenerating.

10. **Top-level typecheck:**

    ```bash
    npx tsc --noEmit
    ```

    No-op confirmation — the edits are Tailwind class strings + a JSON
    config, no TS types change.

11. **Commit on current branch (do NOT push):**

    ```bash
    git add \
      packages/haiku-ui/src/components/primitives/Button.tsx \
      packages/haiku-ui/src/components/primitives/Chip.tsx \
      packages/haiku-ui/src/components/primitives/__tests__/Chip.test.tsx \
      packages/haiku-ui/src/pages/direction/DirectionPage.tsx \
      packages/haiku-ui/src/pages/question/QuestionPage.tsx \
      packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx \
      packages/haiku-ui/src/pages/review/FeedbackFloatingButton.tsx \
      packages/haiku-ui/src/components/SkipLink.tsx \
      packages/haiku-ui/src/components/AnnotationCanvas.tsx \
      packages/haiku-ui/src/components/ReviewSidebar.tsx \
      packages/haiku-ui/src/components/InlineComments.tsx \
      packages/haiku-ui/src/components/feedback/AgentFeedbackToggle.tsx \
      packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx \
      packages/haiku-ui/src/components/feedback/FeedbackList.tsx \
      packages/haiku-ui/src/components/feedback/__tests__/__snapshots__/ \
      packages/haiku-ui/scripts/audit-contrast.mjs \
      packages/haiku-ui/audit-config.json \
      .haiku/intents/universal-feedback-model-and-review-recovery/knowledge/DESIGN-TOKENS.md

    git commit -m "haiku: fix FB-55 bolt 1 (builder)"
    ```

## Verification commands

```bash
# 1. Contrast-pair audit (new PAIRS pass, no regressions)
node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens
# expect: exit 0, all pairs pass, new `primary-button` group visible

# 2. Banned-pattern audit (zero teal-600/white co-occurrences)
cd packages/haiku-ui && node scripts/audit-banned-patterns.mjs tokens
# expect: exit 0, zero violations on new rules

# 3. Unit tests + snapshot update
cd packages/haiku-ui && npm test -- -u
# expect: exit 0; snapshot diffs only in the three predicted files

# 4. Typecheck
cd /Volumes/dev/src/github.com/gigsmart/haiku-method/.claude/worktrees/delegated-swimming-honey && npx tsc --noEmit
# expect: exit 0

# 5. Grep proof — zero bg-teal-600 text-white co-occurrences in src
grep -rn "bg-teal-600" packages/haiku-ui/src | grep -v __snapshots__ | grep -v __tests__ | grep text-white
# expect: no output
grep -rn "dark:bg-teal-500" packages/haiku-ui/src | grep -v __snapshots__ | grep -v __tests__ | grep text-white
# expect: no output
```

All five MUST pass before the commit is considered complete.

## Risks

- **`teal-800` token not yet in `TOKEN_HEX`.** Group C step 14 adds it.
  If the builder skips that add, the four new PAIRS hit the `UNKNOWN
  TOKEN` branch (line 247) and `audit-contrast.mjs` exits 2, not 1 or
  0. The step is non-optional.

- **Chip test hand-edit.** The `Chip.test.tsx` `it()` block at line 18
  asserts the banned pair literally. If the builder runs `npm test -- -u`
  without updating the test file, the test fails (not a snapshot test —
  a hand-authored assertion). The test update is required before the
  suite goes green.

- **AnnotationCanvas line-number drift.** Feedback body says line 771;
  actual is 765 in the current tree. If parallel chain FB-58 (pin
  markers on line 637) has landed and renumbered the file, line 765
  may move. Grep anchor is the literal string
  `"bg-teal-600 text-white border-teal-700"` — that's the only
  occurrence in the file.

- **Legacy-path breadth (Group B).** FB-27 flags all of
  `components/AnnotationCanvas.tsx`, `components/ReviewSidebar.tsx`,
  `components/InlineComments.tsx` as dead code. If FB-27 lands before
  FB-55's builder runs, those files may be deleted. The edits become
  no-ops — the builder should gracefully skip missing files (grep
  recon catches this). Do NOT create them if they're missing.

- **Two FAB files both edited.** FB-12 flags them as duplicates. FB-55
  edits both for consistency — if FB-12's fix lands first and picks
  one, FB-55 only has one FAB to edit. Recon step catches this.

- **FB-63 overlap on StageProgressStrip.** FB-63 criticizes the
  connector's color-only conveyance (`bg-teal-400 dark:bg-teal-500`).
  FB-55 does NOT touch those classes — they are non-text UI markers
  not text-on-color. If FB-63 lands first and changes them, the
  snapshot diff widens but stays out of FB-55's scope.

- **Audit runner regex flavor.** The two new `banned-*` rules use
  `[^"'`]*` to bound the co-occurrence window. FB-46 landed the same
  pattern shape successfully; confirmed JS/ECMAScript regex compatible.
  If the runner has changed, fallback is `.{0,200}?`.

- **Dark-mode toggle-track ambient-page contrast.** The toggle TRACK
  at `dark:bg-teal-700` measures ≈ 2.21:1 against `dark:bg-stone-900`
  ambient page (5.47:1 against its own white thumb). That's below the
  3:1 UI-nontext floor relative to the page. DESIGN-TOKENS §1 doesn't
  declare a track/page boundary token — the canonical lift would be
  `dark:bg-teal-500` (7.94:1 vs. page) but that's 2.49:1 vs. white
  thumb. There's no single `teal-{500,600,700}` shade that clears
  both. The correct fix is probably to add a `border` or `ring` to
  the track to distinguish it from page, but that's a structural
  change DESIGN-TOKENS doesn't currently specify. **Recommended:
  ship the `teal-700` fix for thumb/track (WCAG 1.4.3 is text; toggle
  TRACK vs. page is 1.4.11 which the existing `teal-600` also failed
  at 3.74:1, and `teal-700` at 2.21:1 is marginally worse).** File a
  follow-up for a design stage to specify a track-boundary token. If
  the feedback-assessor pushes back on this trade-off, the builder
  should default back to `dark:bg-teal-600` for the toggle track
  (3.74:1 vs. page, 3.74:1 vs. thumb) — marginal on both but at least
  symmetric. Mark the explicit decision in the commit message or
  a comment on line 88.

- **FB-61 follow-on.** FB-61's builder edit sets FooterBar.tsx to
  `bg-teal-600 hover:bg-teal-700`. If it lands before FB-55, that
  file becomes an additional Group A entry — add it to the recon
  grep list and apply the same swap.

- **The `focus-visible:bg-teal-600` in SkipLink.** The link's primary
  text surface — applied only at focus. The swap to `teal-700`
  preserves the design intent (high-contrast focus state) and fixes
  the 3.74:1 failure. The sibling `focus-visible:ring-teal-500` is
  the ring (non-text UI, 3:1 floor, teal-500 on stone-950 = 7.94:1
  passes — unchanged).

## Out of scope

- **Pin markers** (`AnnotationCanvas.tsx:637`, `components/AnnotationCanvas.tsx`
  equivalent) — FB-58 owns this.
- **Disabled Approve button emerald stack** — FB-61 owns the emerald
  removal; FB-55 touches only the teal lift on top of whatever FB-61
  lands.
- **FAB badge amber-100 + amber-700** — FB-70 owns the badge pair.
- **Filter pill layout / keyboard** — FB-65/FB-63 own non-color
  StageProgressStrip + FeedbackSummaryBar concerns.
- **Removing the duplicate FAB file** — FB-12 owns the dedup; FB-55
  keeps both in lockstep.
- **Deleting Legacy* paths** — FB-27 owns the dead-code removal.
- **Token system redesign** (changing the accent hue) — the fix stays
  within the existing teal ramp.
- **Paper sync** — DESIGN-TOKENS.md is a project-local intent knowledge
  doc, not the HAIKU paper. No `website/content/papers/` edit.
- **Subjective "completion gate" lift** on Chip test — the old
  assertion was structurally correct (asserts the tone has teal + white);
  the swap just moves the shade. No test removal, only token update.

## Done when

- Grep proof: zero `bg-teal-600 text-white` or `dark:bg-teal-500 text-white`
  co-occurrences in `packages/haiku-ui/src/**/*.{ts,tsx}` outside
  `__tests__` / `__snapshots__`.
- `node packages/haiku-ui/scripts/audit-contrast.mjs --mode=tokens`
  exits 0 with the four new `primary-button` PAIRS visible in the
  report JSON (`packages/haiku-ui/reports/contrast-tokens.json`).
- `node packages/haiku-ui/scripts/audit-banned-patterns.mjs tokens`
  exits 0 with zero hits on the two new rules.
- `npm test -- -u` (inside `packages/haiku-ui`) exits 0; snapshot
  diffs restricted to `FeedbackFloatingButton`, `AgentFeedbackToggle`,
  `FeedbackList` snapshots only.
- `npx tsc --noEmit` at repo root exits 0.
- DESIGN-TOKENS §1.1b present in the knowledge doc.
- `audit-config.json` contains `banned-primary-teal-600-white` and
  `banned-primary-teal-500-white-dark` rules.
- `audit-contrast.mjs` `TOKEN_HEX` contains `"teal-800": "#115e59"`
  and `PAIRS` contains the four new `primary-button` group entries.
- `Chip.test.tsx` line 18 test asserts `teal-700` not `teal-600`.
- Commit on current branch with message `haiku: fix FB-55 bolt 1 (builder)`.
  No push.
