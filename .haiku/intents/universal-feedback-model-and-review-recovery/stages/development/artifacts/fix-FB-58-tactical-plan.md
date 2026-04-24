# Fix FB-58 — Tactical Plan (planner, bolt 1)

**Finding:** AnnotationCanvas pin markers: `bg-teal-500` + `text-white` 12px bold numerals = **2.22:1** — fails WCAG 1.4.3 (Minimum Contrast, 4.5:1 normal text) and WCAG 1.4.11 (Non-text Contrast, 3:1 for UI components). Also fails 3:1 when the pin itself is sampled against the artifact beneath it (teal-500 on stone-50 = 2.25:1).
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/58-annotationcanvas-pin-markers-teal-500-white-numerals-fail-wc.md`

## Root cause

`packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx:637` composes every annotation-pin `<button>` className with:

```
border-2 border-white bg-teal-500 text-xs font-bold text-white
…
dark:border-stone-900
```

Three independent problems in the same class string:

1. **Numeral contrast (WCAG 1.4.3).** The rendered numeral `{index + 1}` is inside `<span aria-hidden="true">` with inherited `text-xs font-bold text-white` on `bg-teal-500` (#14b8a6). Contrast = **2.22:1**. The text is 12px bold — NOT "large text" under WCAG (large = ≥18.66px / 14pt bold), so the 4.5:1 floor applies. Even though the numeral is `aria-hidden`, low-vision sighted users rely on it to match the pin to its sidebar row; the `aria-label` fallback works for screen-readers but not for visual users with mild low vision. Fails hard.
2. **Non-text UI component contrast (WCAG 1.4.11).** The pin itself (a UI component) must hit 3:1 against surrounding background. The pin's outer color is `teal-500` (#14b8a6). Against typical artifact backgrounds: white = **2.22:1**, stone-50 (#fafaf9) = **2.25:1**. Below 3:1. The `border-2 border-white` provides no contrast (white on white = 1:1) and does not rescue the pair. In dark mode, `dark:border-stone-900` (#1c1917) on the likely dark artifact (stone-950) gives 1.17:1 — also fails the 3:1 UI floor, though the dark-mode teal-500 against stone-950 is 6.2:1, so the fill itself is fine in dark mode; the light-mode case is the blocker.
3. **Audit did not catch it.** `audit-contrast.mjs` PAIRS roster has no annotation-pin entry. The rendered-mode sampler (unit-15 territory) would walk visible text nodes but does not filter `aria-hidden` text and never fires on example-session routes — pins only exist after click-to-create, so the sampler sees zero.

**Why the fix is NOT "change the numeral color to black."** The feedback body suggests `stone-900` numeral on teal-500 (7.6:1). That fixes WCAG 1.4.3 for the text, but does NOT fix WCAG 1.4.11 (the pin-fill-vs-artifact 2.22:1 / 2.25:1 problem). The correct fix bumps the **fill** so BOTH the numeral and the pin-on-artifact checks pass in one move.

**Why the fix is NOT "add a darker border."** A `border-stone-900` on the pin would raise pin-vs-artifact contrast (stone-900 on white = 18.1:1) but leaves the numeral-on-fill ratio untouched. The feedback flags both problems; borders are a retreat, not the canonical primary.

## Fix approach

**Bump the fill to `bg-teal-700` + keep `text-white`** — the same canonical primary-teal darker shade other components already prefer when over-white contrast matters. Resolved numbers:

- `teal-700` (#0f766e) + `white` = **5.29:1** (passes 4.5:1 for 12px bold body text, WCAG 1.4.3).
- `teal-700` (#0f766e) against `white` artifact = **5.29:1** (passes 3:1 UI non-text, WCAG 1.4.11).
- `teal-700` against `stone-50` = **5.23:1** (passes 3:1 UI non-text).
- Dark mode: keep the `dark:border-stone-900` for the inner-edge separator against stone-950 artifact; the `bg-teal-700` fill against stone-950 = **3.76:1** (passes 3:1 UI non-text in dark mode — the fill itself carries the contrast, the border only delineates pin-edge from artifact within the pin silhouette).

Rationale for `teal-700` over the feedback's alternate (`stone-900` numeral): keeping `text-white` preserves the two-tone pin design (dark fill, bright numeral) which has the highest peripheral-vision legibility; it also matches the `bg-teal-700` token-pair already used elsewhere in the app (e.g., `focus-visible:ring-teal-500` ring pattern remains consistent). Lastly, `teal-700` is already in `TOKEN_HEX` of `audit-contrast.mjs` (line 87), so the PAIRS roster addition is mechanical.

**Add a token-pair roster entry for the pin** so this class of regression is caught deterministically next time. The feedback body explicitly requests this.

**Ban `bg-teal-500` + `text-white` in SPA source** — the failing pair is structurally banned by the audit the same way `bg-emerald-*` was banned by FB-61's fix. In-scope because the feedback body recommends "lock[ing] in" the token pairing and FB-61 already established the banned-pattern pattern.

Out-of-scope escalations the feedback hints at (sampler filtering `aria-hidden`, example-session routes rendering pins at boot so rendered-mode audit catches them) are unit-15 territory — left as follow-ups, not blockers for closure of FB-58.

## Files to modify

1. **`packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`** (line 637)
   - Replace the pin `<button>` className fragment:
     - **From:** `"border-2 border-white bg-teal-500 text-xs font-bold text-white",`
     - **To:** `"border-2 border-white bg-teal-700 text-xs font-bold text-white",`
   - Leave the `dark:border-stone-900` entry on the next line intact — it already correctly delineates the pin edge against dark artifacts.
   - Do NOT touch the focus-visible ring (`focus-visible:ring-teal-500`) — the ring is a 2px halo on the outside of the pin, sampled against the artifact, not the pin fill; ring-color contrast is a separate check and teal-500 on white = 2.22:1 is below 3:1 for focus indicators too, **but** WCAG 2.4.11 (focus-visible) accepts ring-offset-stone-900 variants where the offset carries the contrast. That's an independent finding for unit-13 focus hardening; explicitly out of scope here.
   - Do NOT touch the popover / draft-mode classes below (lines 680+) — `teal-600 + white` at the button level is a separate, already-passing primary-action pair and unrelated to the pin-marker finding.

2. **`packages/haiku-ui/scripts/audit-contrast.mjs`** (PAIRS array, near the `disabled-button` block around line 217–218)
   - Add three entries asserting the new pin-marker token chain passes both 1.4.3 and 1.4.11:
     ```js
     { group: "annotation-pin", variant: "fill-numeral-light", fg: "white", bg: "teal-700", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
     { group: "annotation-pin", variant: "pin-on-white", fg: "teal-700", bg: "white", sizeBucket: "ui-nontext", underlyingBg: "#ffffff" },
     { group: "annotation-pin", variant: "pin-on-stone-50", fg: "teal-700", bg: "stone-50", sizeBucket: "ui-nontext", underlyingBg: "#ffffff" },
     ```
   - All three are already supported by `TOKEN_HEX` (`white`, `stone-50`, `teal-700` present; lines 46, 50, 87). No logic changes — the harness walks PAIRS automatically.

3. **`packages/haiku-ui/audit-config.json`** (profile `tokens`, rules array)
   - Append a `banned-pin-teal-500-white` rule that greps the specific failing combination on the pin element only. Scoped narrowly to `AnnotationCanvas.tsx` to avoid false positives on unrelated teal-500 usages (focus rings, StageProgressStrip tier markers, FAB hover variants) which carry different contrast budgets.
   ```json
   {
     "id": "banned-pin-teal-500-white",
     "description": "bg-teal-500 + text-white on AnnotationCanvas pin markers = 2.22:1 (WCAG 1.4.3 + 1.4.11 fail) per FB-58. Canonical pin fill is bg-teal-700 (5.29:1).",
     "pattern": "bg-teal-500[^\"]*text-white",
     "scope": ["packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   }
   ```
   - Scope restriction avoids clobbering the popover-mode `bg-teal-600 text-white` (different tokens, different ratio, passes) at line 765 in the same file — pattern targets `bg-teal-500` specifically.

## Implementation steps (for the builder in bolt 2)

1. **Clobber-guard read.** Before editing `AnnotationCanvas.tsx`, `audit-contrast.mjs`, and `audit-config.json`, read each file immediately prior to writing. Parallel chains for FB-55 (teal-600 threshold), FB-61 (FooterBar emerald), FB-70 (FAB badge), FB-46 (ReviewContextHeader) all touch one or more of these files. The PAIRS array and the `tokens` profile rules array are both append-safe — if a sibling chain has already added `annotation-pin` entries or a `banned-pin-teal-500-white` rule, skip the duplicate step, do not re-add.
2. Edit `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx` line 637:
   - **From:** `"border-2 border-white bg-teal-500 text-xs font-bold text-white",`
   - **To:** `"border-2 border-white bg-teal-700 text-xs font-bold text-white",`
   - One-character change, one line. No other edits in this file.
3. Edit `packages/haiku-ui/scripts/audit-contrast.mjs`: in the PAIRS array, after the `disabled-button` block and before the `visit-counter` block (roughly line 219), add the three `annotation-pin` entries listed in the Files to Modify section. No other changes.
4. Edit `packages/haiku-ui/audit-config.json`: append the `banned-pin-teal-500-white` rule to the `tokens` profile's `rules` array (after the last existing rule, `banned-button-verb-aria` at lines 74-80). JSON commas — verify trailing-comma handling (the file uses tabs; keep the existing style).
5. Verification suite (all must exit 0):
   ```bash
   cd packages/haiku-ui
   node scripts/audit-contrast.mjs --mode=tokens
   node scripts/audit-banned-patterns.mjs --profile=tokens
   npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx
   npx tsc --noEmit
   npm run build
   ```
6. Visual spot-check (optional, NOT part of CI gate): `npm run dev`, open the review page, create a pin by pressing N over the canvas. Pin should render dark teal (teal-700) with crisp white numeral. Contrast should be obviously higher than the current mid-teal.

## Verification commands

```bash
cd packages/haiku-ui
node scripts/audit-contrast.mjs --mode=tokens            # must include 3 new annotation-pin rows, all pass, exit 0
node scripts/audit-banned-patterns.mjs --profile=tokens  # must flag zero bg-teal-500[...]text-white hits in AnnotationCanvas.tsx, exit 0
npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx
npx tsc --noEmit
npm run build
```

All five must exit 0. The only test file touched is `AnnotationCanvas.test.tsx`; it does not assert the pin's class string, so no snapshot re-recording is expected. If a snapshot elsewhere (StageProgressStrip, FeedbackFloatingButton) happens to include the pin path, the one-character `teal-500`→`teal-700` swap is isolated to `AnnotationCanvas.tsx` and does not cross into those components.

## Risks

- **Parallel-chain clobber on audit-contrast.mjs PAIRS array.** FB-55, FB-61, FB-63, FB-70, FB-46 may all be adding PAIRS entries simultaneously. The array is append-safe — each chain should read the file just before writing, append its entries, and not rewrite existing ones. If a merge conflict arises in PAIRS, resolve by taking all additive entries (no overlap between findings).
- **Parallel-chain clobber on audit-config.json tokens profile.** Same additive-safe pattern. Each `id` is unique per finding (`banned-pin-teal-500-white` is distinct from FB-61's `banned-bg-emerald`).
- **Focus-ring contrast out of scope but noticed.** The pin's `focus-visible:ring-teal-500` paired against a white artifact is also sub-3:1 for focus indicators (WCAG 2.4.11). That is a separate WCAG criterion with a separate finding locus (not yet filed). The 3px offset ring + the newly-dark teal-700 pin edge visually rescues focus legibility in practice, but the *ring color itself* on white is still 2.22:1. Flag for unit-13/unit-15 follow-up; do NOT expand this fix to touch the ring without a dedicated feedback item.
- **Dark-mode pin fill edge-case.** `teal-700` on `stone-950` = 3.76:1 — passes 3:1 UI floor but is closer to the threshold than the previous teal-500 on stone-950 (6.2:1). Visual legibility in dark mode should be spot-checked. If a dark-mode complaint surfaces (unlikely — the `dark:border-stone-900` separator already exists), a `dark:bg-teal-500` override can be layered in a follow-up; in-scope here is the light-mode primary failure, not a dark-mode fine-tune.
- **audit-banned-patterns scope specificity.** The `banned-pin-teal-500-white` rule targets ONLY `AnnotationCanvas.tsx`. If another component later re-uses the failing pair (say, a new inline-annotation marker in `ArtifactsPane.tsx`), the audit won't flag it. That is intentional: a stage-wide `bg-teal-500.*text-white` ban would false-positive on hover/dark variants in multiple existing passing components. If pin markers proliferate, expand the scope in a follow-up.
- **Token-swap regression on visual design.** `teal-700` is noticeably darker than `teal-500`. Anyone visually anchored to the old mid-teal pin palette will see it change. The design direction (DESIGN-TOKENS §1.1a banned-pairs) already blesses teal-700 as a canonical primary-dark variant; no design-stakeholder sign-off is required for a contrast-remediation swap, but the reviewer assessing this fix should confirm no visual-regression snapshot spec claims the old teal.

## Out of scope

- Rendered-mode contrast-audit filter for `aria-hidden` text nodes — unit-15 stage-wide audit owns that gap.
- Example-session routes rendering pins at boot so the rendered-mode sampler catches them — unit-15 fixture work.
- Focus-ring contrast on the pin (separate WCAG criterion, separate finding).
- Index.css `.annotation-pin` CSS class legacy path (line 133) — this is the non-React templated-html embedder's pin renderer, not the React review SPA's pin. Uses `background: #e11d48` (rose-600), contrast against white = 4.88:1, passes 4.5:1 for the inline numeral. Separate code path, separate concern.
- Popover primary-action button (`bg-teal-600 text-white` at line 765) — different pair (4.54:1, passes AA), different element (button inside popover, not the pin marker), not referenced by FB-58.
- Expanding banned-pattern scope beyond `AnnotationCanvas.tsx` — scoped narrowly by design (see Risks).

## Done when

- `AnnotationCanvas.tsx:637` reads `bg-teal-700` instead of `bg-teal-500` on the pin button className. `text-white` retained. Dark-mode `dark:border-stone-900` retained.
- `audit-contrast.mjs` PAIRS roster gains three `annotation-pin` entries: `fill-numeral-light` (4.5:1 text check), `pin-on-white` (3:1 UI check), `pin-on-stone-50` (3:1 UI check). All three pass; audit exits 0.
- `audit-config.json` profile `tokens` gains `banned-pin-teal-500-white` rule scoped to `AnnotationCanvas.tsx`; `audit-banned-patterns.mjs --profile=tokens` flags zero hits; exits 0.
- `npx vitest run src/pages/review/__tests__/AnnotationCanvas.test.tsx` exits 0.
- `npx tsc --noEmit` and `npm run build` exit 0.
- `git diff` on the fix commit touches exactly three files: `AnnotationCanvas.tsx`, `audit-contrast.mjs`, `audit-config.json`. No snapshot churn expected.
