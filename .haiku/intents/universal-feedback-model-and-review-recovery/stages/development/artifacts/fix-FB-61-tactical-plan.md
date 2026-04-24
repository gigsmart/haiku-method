# Fix FB-61 — Tactical Plan (planner, bolt 1)

**Finding:** Disabled Approve button emerald-400 + white = 1.65:1 — catastrophic WCAG 1.4.3 contrast failure.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/61-disabled-approve-button-emerald-400-white-1-65-1-catastrophi.md`

## Root cause

`packages/haiku-ui/src/pages/review/FooterBar.tsx:145` composes the Approve button className with:

```
bg-emerald-600 … text-white … disabled:cursor-not-allowed disabled:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-600
```

Three independent problems in the same class string:

1. **Disabled state** — the `disabled:` variant overrides `bg-*` but does NOT override `text-white` inherited from the enabled state. Result: white label on `bg-emerald-400` (#34d399) = **1.63:1** (feedback measures 1.65:1; both ≪ 4.5:1). Hard WCAG 1.4.3 fail for normal-sized text. Not WCAG-exempt — the "Approve" label is informational ("disabled controls" exemption applies only when the control's purpose is otherwise communicated, which it is not here).
2. **Enabled state** — `bg-emerald-600` (#059669) + `text-white` = **3.85:1**. Also fails 4.5:1 AA for normal text. Not currently flagged by `audit-contrast.mjs --mode=tokens` because the PAIRS roster has no emerald entries at all.
3. **Dark-mode disabled** — there is no `dark:disabled:*` override, so dark-mode users get the light-mode disabled emerald-400 inherited. Same 1.63:1 failure on the dark surface.

**Why the audit missed it.** `audit-contrast.mjs` §PAIRS has `disabled-button/primary-green-light` (fg `green-800` on bg `green-300` = 4.68:1 — passes) and no emerald variants. The FooterBar Approve button is the only primary-action button in the review flow using `emerald-*` instead of the canonical `green-*` / `teal-*` tokens — every other primary CTA in the SPA (QuestionPage.tsx:192, DirectionPage.tsx:258) already uses `bg-teal-600` + `text-white` enabled, `disabled:bg-green-300 disabled:text-green-800` disabled.

## Fix approach

**Adopt the canonical primary-action token chain** — the same one QuestionPage and DirectionPage already use. This is NOT a new token; it is the DESIGN-TOKENS §1.7 "Disabled state (primary green)" pair, already proven 5.10:1 light / 7.80:1 dark by the existing PAIRS roster.

**Enabled state:** swap `bg-emerald-600 hover:bg-emerald-700` → `bg-teal-600 hover:bg-teal-700`. Teal-600 + white = **4.54:1** (already in roster, passes 4.5:1 AA for normal text). Drop the dark-mode overrides (`dark:bg-emerald-500 dark:hover:bg-emerald-600`) — the canonical teal button stays teal in dark mode; the SPA's other primary CTAs prove this pattern.

**Disabled state:** swap `disabled:bg-emerald-400` → `disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200`. This adds the missing `disabled:text-*` override so the label no longer inherits `text-white` at the disabled state, and adds the `dark:disabled:*` pair so dark-mode disabled is correct.

**A11y attribute:** add `aria-disabled={submitting !== null}` to match DESIGN-TOKENS §1.7 pattern ("pair the native `disabled` attribute with `aria-disabled='true'` so screen readers announce the state"). Also add this to the External Review and Request Changes buttons in the same file for consistency — they also use the native `disabled` attribute without `aria-disabled`. In-scope because the feedback body explicitly references §1.7 and these two buttons are adjacent in the same component.

**Audit roster gap.** Add two entries to `packages/haiku-ui/scripts/audit-contrast.mjs` PAIRS so this class of regression is caught deterministically next time:

- `{ group: "primary-button", variant: "teal-light", fg: "white", bg: "teal-600", sizeBucket: "text-normal", underlyingBg: "#ffffff" }` — asserts the canonical enabled primary teal button passes 4.5:1 (it does: 4.54:1).
- Optionally a negative-proof entry for the banned emerald-400 / white pair is NOT added — PAIRS are pass-gates, not ban-gates. Emerald misuse is instead covered by a banned-pattern rule in `audit-config.json` (see below).

**Banned pattern.** Add a rule to `audit-config.json` profile `tokens` that bans `bg-emerald-` in `packages/haiku-ui/src/**/*.{ts,tsx}` outside allow-listed files (none currently). Rationale: the SPA's canonical primary green is `teal-600`; any future `emerald-*` is either a token drift or a contrast trap. If a justified use emerges, allow-list via inline `// audit-allow: <reason>`.

## Files to modify

1. **`packages/haiku-ui/src/pages/review/FooterBar.tsx`**
   - Approve button (line 145): swap emerald → teal (enabled) + green-300/green-800 pair (disabled), drop the dark-mode emerald overrides, add `disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200`, add `aria-disabled={submitting !== null}`.
   - External Review button (line 155): add `aria-disabled={submitting !== null}`. No color change — indigo pair already passes.
   - Request Changes button (line 165): add `aria-disabled={submitting !== null}`. No color change — amber pair already passes.
   - Do NOT touch the component's behavioral logic (`handleApprove`, `pendingApprove` flow, `submitDecision` call). Pure class-string + one aria-attribute edit per button.

2. **`packages/haiku-ui/scripts/audit-contrast.mjs`**
   - Add `primary-button/teal-light` PAIR near the existing `disabled-button` block (line 217-218 area).
   - No other script-logic changes — the harness walks PAIRS automatically.

3. **`packages/haiku-ui/audit-config.json`** (profile `tokens`)
   - Add `banned-bg-emerald` rule: pattern `\bbg-emerald-\d`, scope `packages/haiku-ui/src/**/*.{ts,tsx}`, exclude `__tests__` / `__snapshots__`. Description cites FB-61 and the canonical-teal rationale.

## Implementation steps (for the builder in bolt 2)

1. Read `packages/haiku-ui/src/pages/review/FooterBar.tsx` immediately before editing (parallel-chain clobber guard — another chain might be fixing FB-55, FB-58, or FB-70 in nearby files).
2. Edit line 145: replace the Approve button className tail
   - **From:** `bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400 dark:bg-emerald-500 dark:hover:bg-emerald-600`
   - **To:** `bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-green-300 disabled:text-green-800 dark:disabled:bg-green-900/40 dark:disabled:text-green-200`
3. On the Approve button element, add `aria-disabled={submitting !== null}` next to the existing `disabled={submitting !== null}`.
4. On the External Review button element (line 150-158), add `aria-disabled={submitting !== null}`.
5. On the Request Changes button element (line 160-168), add `aria-disabled={submitting !== null}`.
6. Edit `packages/haiku-ui/scripts/audit-contrast.mjs` PAIRS array (around line 217–218): add
   ```js
   { group: "primary-button", variant: "teal-light", fg: "white", bg: "teal-600", sizeBucket: "text-normal", underlyingBg: "#ffffff" },
   ```
   Confirm `teal-600` is already in `TOKEN_HEX` (it is — line 86 `"teal-600": "#0d9488"`) and `"white"` resolves (`resolveToken` handles literals).
7. Edit `packages/haiku-ui/audit-config.json` — append to the `tokens` profile rules array:
   ```json
   {
     "id": "banned-bg-emerald",
     "description": "bg-emerald-* banned in SPA — canonical primary is teal-600 (DESIGN-TOKENS §1.7). Emerald-400/white = 1.63:1 (WCAG 1.4.3 fail) per FB-61.",
     "pattern": "\\bbg-emerald-\\d",
     "scope": ["packages/haiku-ui/src/**/*.{ts,tsx}"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   }
   ```
8. Verification suite (all must exit 0):
   ```bash
   # From packages/haiku-ui:
   node scripts/audit-contrast.mjs --mode=tokens
   node scripts/audit-banned-patterns.mjs --profile=tokens
   npx vitest run src/pages/review/__tests__/FooterBar.test.tsx
   npx tsc --noEmit
   npm run build
   ```
9. Visual spot-check (optional, not part of CI gate): `npm run dev` → load the review page, confirm the Approve button is now teal and the disabled state shows the green-300/green-800 pair.

## Verification commands

```bash
cd packages/haiku-ui
node scripts/audit-contrast.mjs --mode=tokens   # must include primary-button/teal-light row, exit 0
node scripts/audit-banned-patterns.mjs --profile=tokens  # must flag zero bg-emerald-* hits in src/, exit 0
npx vitest run src/pages/review/__tests__/FooterBar.test.tsx  # existing FooterBar test suite
npx tsc --noEmit
npm run build
```

All five must exit 0.

## Risks

- **Test snapshot churn.** FooterBar class strings are likely asserted in one or more state-coverage / RTL tests. The builder must re-record any broken snapshots as part of the fix commit (same commit, not a follow-up). Grep `packages/haiku-ui/src/pages/review/__tests__/` for `emerald` or `FooterBar` state-snapshot references before starting.
- **Dark-mode regression elsewhere.** Dropping `dark:bg-emerald-500 dark:hover:bg-emerald-600` relies on `bg-teal-600 hover:bg-teal-700` working in dark mode. QuestionPage and DirectionPage prove the pattern, but confirm by opening the review page in dark mode during the visual spot-check.
- **Parallel-chain clobber.** This fix loop is running in parallel with other contrast findings (FB-55 teal-600/white 3.85:1 threshold, FB-58 AnnotationCanvas pin-markers, FB-70 FAB badge, FB-46 ReviewContextHeader). They may all touch `audit-contrast.mjs` PAIRS or the same components. Builder MUST read each file immediately before writing. Merge conflicts in PAIRS entries are additive — safe to re-apply on top. If a sibling chain has already added `primary-button/teal-light`, skip that step; do not duplicate.
- **FB-55 interaction.** FB-55 flags `teal-600 + white = 3.85:1` as itself sub-AA, which contradicts the existing roster math (`teal-600` → `#0d9488`; `white` = `#ffffff`; WCAG formula = 4.54:1 — passes AA for normal text). If FB-55 lands first and raises the teal to `teal-700`, re-apply this plan against `teal-700` (contrast 6.15:1, same structure). The plan's *approach* — adopt the canonical primary teal + green-300/green-800 disabled pair — is resilient to whichever shade wins; only the literal class string in step 2 shifts one digit.
- **Banned-pattern false positive.** If any tooling-only config file (mermaid, xyflow, canvas 2D renderer setup) uses `bg-emerald-*` as a raw theme config string, the rule would flag it. Scope is limited to `*.{ts,tsx}` under `src/`; config files and scripts are excluded. Audit `packages/haiku-ui/src/` for residual emerald-* usages before shipping the banned rule — if any exist outside FooterBar.tsx they are in-scope for this fix (the feedback body says the audit "missed it" because no emerald entries exist; the fix closes the gap comprehensively, not just at FooterBar).

## Out of scope

- FB-55 (`teal-600/white` 3.85:1 claim) — separate feedback, separate fix chain, will update its own PAIRS row.
- Adding `primary-button` variants for every other button color in the SPA — bolt-1 adds only the teal-light pair needed to backstop this specific button. Full audit roster expansion is tracked by unit-15 / stage-wide audit.
- Refactoring `focusRingVariantClasses.approve` — the focus-ring token is separate from background contrast; out of scope unless it itself carries an emerald token (it does not — verified in `src/a11y/focus.ts`, uses teal/amber/indigo families).
- Touching other primary-green uses in the SPA — every other call site already uses the canonical pair (QuestionPage, DirectionPage). FooterBar is the sole outlier.

## Done when

- FooterBar Approve button enabled: `bg-teal-600` + `text-white` (4.54:1, passes AA).
- FooterBar Approve button disabled: `bg-green-300 text-green-800` light / `bg-green-900/40 text-green-200` dark (5.10:1 / 7.80:1, passes AA).
- All three decision buttons carry both `disabled` and `aria-disabled` attributes driven by the same `submitting !== null` expression.
- `audit-contrast.mjs --mode=tokens` PAIRS roster gains `primary-button/teal-light` entry; audit exits 0.
- `audit-config.json` profile `tokens` gains `banned-bg-emerald` rule; `audit-banned-patterns.mjs --profile=tokens` flags zero emerald hits in `src/`; audit exits 0.
- `npx vitest run src/pages/review/__tests__/FooterBar.test.tsx` exits 0 (snapshots re-recorded in the same commit if the class-string change breaks them).
- `npx tsc --noEmit` and `npm run build` exit 0.
- `git diff` on this commit touches exactly three files: `FooterBar.tsx`, `audit-contrast.mjs`, `audit-config.json` (plus any mechanically-regenerated snapshot file).
