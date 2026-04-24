# Fix FB-65 — Tactical Plan (planner, bolt 1)

**Finding:** `FeedbackItem` action buttons (Dismiss / Verify & Close / Reopen / Delete) and `FeedbackSummaryBar` filter pills (Pending / Addressed / Closed / Rejected) render at ~60×24 and ~80×24 CSS px respectively, failing the 44×44 floor (WCAG 2.5.5 AAA and 2.5.8 AA). `Tabs.tsx` tab buttons are marginal on height (~40 tall). The existing `audit-touch-targets.mjs` misses these because `/review/example-session` renders zero feedback items (SummaryBar hides on empty list — `FeedbackSummaryBar.tsx:61`), zero filter pills, and thin tabs — the "8 scanned / 0 fail" output is a coverage collapse, not a pass.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/65-feedbackitem-action-buttons-and-feedbacksummarybar-filter-pi.md`

## Root cause

Three independent problems, all enabled by the same audit blind spot:

1. **`FeedbackItem.tsx:56-58` — `ACTION_BUTTON_BASE`.** The base string composes `text-xs font-medium px-2 py-1 rounded-md transition-colors ${focusRingCompactClass}`. None of the four status-scoped class strings (`DISMISS_CLASSES`, `VERIFY_CLOSE_CLASSES`, `REOPEN_CLASSES`, `DELETE_CLASSES`) add `touchTargetClass`. Computed hit area is approximately width(text) + 16 px horizontal × 24 px tall — below 44×44 on every action button on every feedback row. These are the most-tapped controls in the mobile review experience.

2. **`FeedbackSummaryBar.tsx:73` — pill base classes.** The pill class string is `inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full border transition-colors` followed by the active/inactive color variant and `focusRingCompactClass`. No `touch-target`. Computed ≈ 80×24. All four filter pills fail.

3. **`Tabs.tsx:81` — tab button base.** `${focusRingClass} px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ...` — `py-2.5` + 14 px text gives a computed height around 40 px; horizontal padding is usually enough, but height drifts below the 44 px floor on narrow labels. The feedback explicitly flags it as "marginal" — the deterministic fix is to apply `touchTargetClass` so the min-height is guaranteed independent of font metrics.

**`FeedbackSidebar.tsx:269-272` (sheet Dismiss "✕")** — the feedback body explicitly notes this one already has `touchTargetClass` applied via `FeedbackSheet.tsx:274` (the sheet lives in that file now, not `FeedbackSidebar.tsx`). The feedback leaves a guard-note asking the fix sweep NOT to "correct" a passing case. Plan honors that — no edit to the sheet close button.

**Why the audit missed it (supporting evidence):** `packages/haiku-ui/scripts/audit-touch-targets.mjs:81-86` walks four routes — `/`, `/review/example-session`, `/question/example-session`, `/direction/example-session`. At `/review/example-session` the legacy / example fixture renders an **empty** feedback list:
- `FeedbackSummaryBar` early-returns `null` when `items.length === 0` (`FeedbackSummaryBar.tsx:61`), so **zero filter pills paint**.
- `FeedbackItem` only renders when there are items to list, so **zero action buttons paint**.
- Tabs may or may not render depending on route fixture depth.

Result: the audit's denominator (`scanned.length`) collapses to 8 and silently returns "0 fail". A coverage floor would have flagged the collapse; it does not exist.

## Fix approach

Two mechanical edits + one audit hardening:

1. **Visible-sizing variant for action buttons and filter pills.** Apply `touchTargetClass` (min-height/width: 44 px). The pills and action buttons already use flex layout; `touch-target` inflates `min-height`/`min-width` without disturbing the inline-flex alignment. Visible typography (text-xs) stays unchanged; the tap surface expands under the text via `min-height`.

2. **Visible-sizing variant for Tabs.** Same treatment. `Tabs.tsx` uses sticky flex — `touchTargetClass` adds 44 px min-height to each tab button, which is the WCAG-safe path and matches the deliberate tab geometry (tabs are already wide enough; it's the height that drifts).

3. **Audit hardening: fixture coverage floor.** Amend `audit-touch-targets.mjs` so a coverage collapse cannot silently return a pass:
   - Walk an additional route with **seeded** feedback state. The simplest path already available: pass a `?fixture=populated` query param on `/review/example-session` that mounts the canonical fixture items (unit-09 mock generator already exposes these via the feedback-fixtures module). If that fixture lever does not exist, fall back to the "scanned floor" (see below).
   - Add a minimum-scan floor: if `scanned.length < 30` across the four mobile routes, exit 2 (not 0, not 1) with an explicit "coverage collapse" message. This is the narrow fix the feedback body requests in its "audit strengthening" section.

The first three edits (the CSS class additions) are the closure-critical changes. The fixture + floor edit is a belt-and-suspenders to prevent regression — it **is** in scope because the feedback body includes "Audit strengthening" in the fix direction and FB-65's closure requires the 44×44 gate to be mechanically future-proof, not just patched today.

**Why visible-sizing (`touchTargetClass`) rather than invisible (`touchTargetHitAreaClass`):** For action buttons on a mobile feedback row, there is ample horizontal and vertical slack — the buttons sit inside an expanded disclosure body with `flex-wrap` spacing. Letting the buttons grow to 44×44 visible is the cleaner fix (bigger tap targets = easier to hit), matches the `AgentFeedbackToggle` pattern already canonical in the codebase (`AgentFeedbackToggle.tsx` uses `touchTargetClass` on the outer label — see `AgentFeedbackToggle.test.tsx:169-183`), and keeps the existing focus-ring geometry intact. Filter pills: same argument — pills already have generous horizontal padding; growing them to 44 tall gives them a more readable row rhythm in mobile viewports.

**Why NOT reshape the design:** The feedback explicitly does not call for a visual redesign. The fix is to meet the 44×44 floor, not to replace the pill/button styling. `touchTargetClass` is the minimal canonical intervention.

## Files to modify

1. **`packages/haiku-ui/src/components/feedback/FeedbackItem.tsx`**

   - Line 31 `import`: add `touchTargetClass` to the a11y import alongside `focusRingCompactClass, useAnnounce`:
     ```ts
     import { focusRingCompactClass, touchTargetClass, useAnnounce } from "../../a11y"
     ```
   - Line 56-58 `ACTION_BUTTON_BASE`: append `touchTargetClass`:
     ```ts
     const ACTION_BUTTON_BASE =
         "text-xs font-medium px-2 py-1 rounded-md transition-colors " +
         focusRingCompactClass + " " + touchTargetClass
     ```
     (The existing string literal concat pattern is preserved.)

   Every one of the four rendered buttons (Dismiss, Verify & Close, Reopen ×2 branches, Delete) inherits `ACTION_BUTTON_BASE`, so this single edit closes all four cases. No per-branch changes needed.

2. **`packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx`**

   - Line 10 `import`: add `touchTargetClass` alongside `focusRingCompactClass`:
     ```ts
     import { focusRingCompactClass, touchTargetClass } from "../../a11y"
     ```
   - Line 72-78 classes array: append `touchTargetClass`:
     ```ts
     const classes = [
         "inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full border transition-colors",
         isActive ? /* …active variant… */ : /* …inactive variant… */,
         focusRingCompactClass,
         touchTargetClass,
     ].join(" ")
     ```

   All four filter pills inherit this class list. Single edit covers all four.

3. **`packages/haiku-ui/src/components/Tabs.tsx`**

   - Line 8 `import`: add `touchTargetClass`:
     ```ts
     import { focusRingClass, touchTargetClass } from "../a11y"
     ```
   - Line 81-87 className template literal: insert `${touchTargetClass}` into the tab button's className string:
     ```tsx
     className={`${focusRingClass} ${touchTargetClass} px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
         disabled ? /* … */ : isActive ? /* … */ : /* … */
     }`}
     ```

   The `inline-flex items-center` behavior of `<button>` + min-height works correctly under the sticky flex tablist (button's min-height does not affect its parent flex-row's alignment).

4. **`packages/haiku-ui/scripts/audit-touch-targets.mjs`**

   - Add a coverage floor after the per-route scan loop, before the report write (around line 216, before the `await mkdir(REPORTS_DIR, …)` call):
     ```js
     const MIN_SCANNED = 30
     if (scanned.length < MIN_SCANNED) {
         console.error(
             `audit-touch-targets · coverage collapse: only ${scanned.length} interactive elements scanned across ${routes.length} routes (floor: ${MIN_SCANNED}). The audit cannot certify 44×44 compliance when the sample is this thin.`,
         )
         await mkdir(REPORTS_DIR, { recursive: true })
         await writeFile(reportPath, `${JSON.stringify({ scanned: scanned.length, failures, coverageCollapse: true, floor: MIN_SCANNED }, null, 2)}\n`)
         process.exit(2)
     }
     ```
   - Add a fifth route entry for a fixture-populated review view. First choice: extend the existing `/review/example-session` probe to inject populated fixtures into the SPA before measurement. Because the SPA mounts feedback from `useFeedback` which reads from the mock-API, the reliable path is to add a `setItems(...)` lever on the global `window.__HAIKU_TEST_HOOKS__` object when `VITE_AUDIT_MODE` is set; if that lever is not already present in dev builds, fall back to the minimum-scan floor only.
   - Concretely for bolt 1: land the `MIN_SCANNED` floor. The fixture-injection path is a follow-up to be filed as a fresh feedback item IF the floor alone does not drive the scan count ≥ 30 after the first three CSS edits land and are counted across the four routes. If `scanned` is still < 30 post-fix, a narrow `populated-review` route is added in bolt 2.

5. **No edit to `FeedbackSidebar.tsx` / `FeedbackSheet.tsx` close button.** The feedback body explicitly leaves this one alone (it already has `touchTargetClass` — confirmed by grep of the current file, line 274).

6. **No edit to `StageProgressStrip.tsx`.** The feedback body line 33 says "covered in FB-63". Not in scope for FB-65.

## Tests to update / add

Existing touch-target discipline pattern: `packages/haiku-ui/src/components/feedback/__tests__/AgentFeedbackToggle.test.tsx:169-183` injects the canonical `.touch-target` CSS into the jsdom document head in `beforeAll`, renders the component, and asserts `parseFloat(style.minHeight) >= 44 && parseFloat(style.minWidth) >= 44`. The same pattern applies to the three components here.

1. **`FeedbackItem.states.test.tsx`** — add a `describe("FeedbackItem — action buttons meet 44×44", …)` block:
   - Inject the `.touch-target` CSS in a `beforeAll` (copy the 11-line block from `AgentFeedbackToggle.test.tsx:42-55`).
   - Render four cases: pending (Dismiss button present), addressed (Verify & Close + Reopen), closed (Reopen + Delete), rejected (Reopen + Delete).
   - For each rendered action button (`data-action` attribute: `"dismiss"`, `"verify-close"`, `"reopen"`, `"delete"`), assert:
     ```ts
     const style = getComputedStyle(btn)
     expect(parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44)
     expect(parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44)
     expect(btn.classList.contains("touch-target")).toBe(true)
     ```

2. **`FeedbackSummaryBar.states.test.tsx`** — add a `describe("FeedbackSummaryBar — filter pills meet 44×44", …)` block:
   - Same CSS injection pattern.
   - Render with 4 items spanning all four visible statuses so all four pills paint.
   - Assert all four `button[data-status]` elements expose `min-height ≥ 44` and `min-width ≥ 44` via computed style AND carry `touch-target` in classList.

3. **`Tabs`** — add or extend a tabs-focused test file. Existing location: no `Tabs.test.tsx` exists at `packages/haiku-ui/src/components/__tests__/` (verify in bolt 1; if absent, create `Tabs.test.tsx` following the same `touchTargetClass` CSS-inject pattern). Assert every rendered tab button exposes `min-height ≥ 44` and `min-width ≥ 44`, carries `touch-target` in classList.

4. **Snapshot updates.** If the existing `FeedbackSummaryBar.states.test.tsx` / `FeedbackItem.states.test.tsx` / `Tabs`-related tests produce DOM snapshots (check `__snapshots__` directory), the new `touch-target` class will appear in the serialized className — accept the snapshot diff intentionally (run `vitest -u` on the affected files) and verify the only change is the added class.

## Implementation Steps (builder, bolt 1)

1. **Edit `FeedbackItem.tsx`** — add `touchTargetClass` to the import and append it to `ACTION_BUTTON_BASE`. Save.
2. **Edit `FeedbackSummaryBar.tsx`** — add `touchTargetClass` to the import and append it to the pill `classes` array. Save.
3. **Edit `Tabs.tsx`** — add `touchTargetClass` to the import and insert into the tab `className` template. Save.
4. **Edit `audit-touch-targets.mjs`** — insert the `MIN_SCANNED = 30` coverage-collapse floor + exit-2 branch before the existing report write.
5. **Update tests** — extend `FeedbackItem.states.test.tsx`, `FeedbackSummaryBar.states.test.tsx`, and add/extend a Tabs test per §Tests above. Inject the `.touch-target` CSS block in each test's `beforeAll` (copy from `AgentFeedbackToggle.test.tsx`).
6. **Update snapshots** — run `npx vitest run -u` in `packages/haiku-ui` to accept the intentional class-string additions. Review the diff; confirm only `touch-target` appears as a net-new token.
7. **Run the repo-wide verification sequence** (see §Verification commands).
8. **Commit** with message `haiku: fix FB-65 bolt 1 (planner)`. Do NOT push (per hat prompt line 50).

## Verification commands

Each MUST exit as indicated. Invoke from the worktree root unless a `cwd` is specified.

- `grep -n "touchTargetClass" packages/haiku-ui/src/components/feedback/FeedbackItem.tsx` → at least two matches (import + usage in `ACTION_BUTTON_BASE`).
- `grep -n "touchTargetClass" packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx` → at least two matches (import + usage in classes array).
- `grep -n "touchTargetClass" packages/haiku-ui/src/components/Tabs.tsx` → at least two matches (import + usage in className template).
- `grep -n "MIN_SCANNED" packages/haiku-ui/scripts/audit-touch-targets.mjs` → exact match for the coverage-collapse floor constant.
- `cd packages/haiku-ui && npx tsc --noEmit` → exit 0 (no tsc regressions from the new imports or CSS additions).
- `cd packages/haiku-ui && npx vitest run src/components/feedback/__tests__/FeedbackItem.states.test.tsx src/components/feedback/__tests__/FeedbackSummaryBar.states.test.tsx` → exit 0 (all component tests pass; new 44×44 assertions included).
- `cd packages/haiku-ui && npm run build` → exit 0 (SPA build clean, no unused-import errors).
- `cd packages/haiku-ui && node scripts/audit-touch-targets.mjs` → exit 0 if mobile routes render ≥ 30 interactive elements AND all pass 44×44, exit 2 if the coverage collapse floor fires (this is correct behavior — see §Risks 2), exit 1 if any element still fails 44×44. For this fix, exit 0 OR exit 2 is an acceptable transient state; exit 1 is NOT (means a button still below 44×44 somewhere).
- `git diff --name-only HEAD^` after commit → lists exactly: `FeedbackItem.tsx`, `FeedbackSummaryBar.tsx`, `Tabs.tsx`, `audit-touch-targets.mjs`, the three test files (plus any snapshot `.snap` updates), and this tactical plan. No other surprise files.

## Risks

1. **Existing DOM snapshot tests fail on the added class token.** `FeedbackFloatingButton.states.test.tsx.snap` et al. preserve whole className strings. The added `touch-target` token changes the serialized className. **Mitigation:** intentional snapshot update (`vitest -u`) is part of step 6. The builder reviews the diff to confirm ONLY `touch-target` is added — no other drift.

2. **Coverage floor (`MIN_SCANNED = 30`) fires on first run even after the fix.** If `/review/example-session` still renders zero feedback items (the summary bar hides on empty state) and the home / question / direction routes together yield < 30 interactive elements, the audit exits 2 post-fix. **Mitigation:** the floor is the feedback's explicit request — exit 2 on coverage collapse is the correct behavior, not a regression. If the builder observes exit 2 after the three CSS edits land, that reveals the SECOND half of the finding (fixture augmentation), which is then landed as a narrow bolt-2 escalation — NOT a failure of FB-65 closure. The floor exists so the audit cannot silently pass on a thin scan; the feedback-assessor accepts a documented exit 2 with the coverage-collapse message over a fake "0 fail / 8 scanned" success.

3. **`touchTargetClass` on tabs disrupts sticky-tablist layout.** `Tabs.tsx` uses `flex overflow-x-auto ... sticky top-[var(--header-height)]` for the tablist container. Adding `min-height: 44px` to each tab button could push horizontal overflow at narrow viewports. **Mitigation:** tab buttons are already 40 tall, so the delta is 4 px. The tablist container has no fixed height — it grows with its tallest child. Visual regression is bounded to 4 px of tablist thickness. If the design team flags this, the escape hatch is `touchTargetHitAreaClass` on tabs (hit area absorbed by a ::before pseudo, visible geometry unchanged). For bolt 1, the visible-sizing variant is the canonical primary.

4. **`focusRingCompactClass` interaction with `touchTargetClass`.** The compact focus-ring utility sets a 1 px offset ring; `touchTargetClass` sets `position: relative` (per `index.css`). Because `focus-visible` rings are painted with `outline` or `box-shadow`, not `::before`, there is no conflict. **Mitigation:** covered by existing a11y tests on `AgentFeedbackToggle` (which stacks both classes successfully — see `AgentFeedbackToggle.test.tsx:169`).

5. **Invisible hit-area conflict.** If any of the three affected components later nests a `touchTargetHitAreaClass` child (unlikely), the nested `position: relative` in both parent and child could cause double-::before pseudo overlap. **Mitigation:** grep confirms none of the three files currently use `touchTargetHitAreaClass`. Not a concern for this fix.

6. **Parallel-batch warning (per prompt line 4).** Other fix chains may be editing adjacent code (FB-63 touches `StageProgressStrip.tsx`; FB-61 touched approve-button emerald classes). **Mitigation:** the builder re-reads each of the four files immediately before writing, per the prompt's "read before write" instruction. No file overlap with FB-63 or FB-61 is expected — the three files here are scoped to feedback rows, summary pills, and tabs.

## Out of scope (expressly)

- **`StageProgressStrip.tsx`** — covered in FB-63 per feedback body line 33.
- **`FeedbackSidebar.tsx` / `FeedbackSheet.tsx` close button** — already meets the floor; feedback body line 31 explicitly excludes it from the fix sweep.
- **Fixture-injection in audit routes** — noted as aspirational in §Fix approach. Bolt 1 lands the coverage-collapse floor; fixture injection escalates to bolt 2 only if the floor fires post-fix.
- **Redesign of any of the three components.** The fix preserves visible typography and colors; only `min-height`/`min-width` inflate. No design token changes.
- **Other tabs in other components** (e.g. internal disclosure-tab patterns in review page). `Tabs.tsx` is the canonical tab primitive; other local "tab-like" affordances are addressed by their own findings per the adversarial-review convention.
- **`audit-contrast.mjs`** — unrelated audit. Contrast findings are separate (FB-55, FB-58, FB-61, FB-70 territory).

## Completion signal

Fix is ready for feedback-assessor when:

1. `FeedbackItem.tsx` imports `touchTargetClass` and appends it to `ACTION_BUTTON_BASE`.
2. `FeedbackSummaryBar.tsx` imports `touchTargetClass` and appends it to the pill classes array.
3. `Tabs.tsx` imports `touchTargetClass` and includes it in the tab button className template.
4. `audit-touch-targets.mjs` enforces `MIN_SCANNED = 30` with an exit-2 branch and an explicit coverage-collapse message.
5. `FeedbackItem.states.test.tsx`, `FeedbackSummaryBar.states.test.tsx`, and a Tabs test cover the 44×44 computed-style assertion for every rendered action button, filter pill, and tab button using the canonical `.touch-target` CSS injection pattern from `AgentFeedbackToggle.test.tsx`.
6. Vitest run passes in `packages/haiku-ui` (snapshots updated intentionally).
7. `tsc --noEmit` and `npm run build` pass in `packages/haiku-ui`.
8. `audit-touch-targets.mjs` exits 0 (all scanned elements pass 44×44) OR exits 2 (coverage-collapse message surfaces, confirming the new floor works). Exit 1 is NOT acceptable — it means a button still fails 44×44.
9. Commit on the current branch with message `haiku: fix FB-65 bolt 1 (planner)`; no push.
