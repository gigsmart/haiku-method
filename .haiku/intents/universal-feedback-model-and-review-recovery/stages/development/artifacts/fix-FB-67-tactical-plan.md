# Fix FB-67 — Tactical Plan (planner, bolt 1)

**Finding:** Tabs component tab buttons have no visible focus indicator (WCAG 2.4.7 Focus Visible).
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/67-tabs-component-tab-buttons-have-no-visible-focus-indicator-w.md`

## Root cause

`packages/haiku-ui/src/components/Tabs.tsx` programmatically moves focus on arrow-key traversal via `tabRefs.current.get(id)?.focus()` (line 37) but at the time this feedback was written, the tab `<button>` className did not include `focusRingClass`. Keyboard users traversing tabs had no visible indicator of where focus landed — WCAG 2.4.7 fail.

Secondary gap called out in the feedback body: `audit-banned-patterns.mjs` is a **ban-gate only** audit — it catches *presence* of bad classes (e.g. `focus:ring-1`) but has no *presence-required* rule that catches *absence* of `focus-visible:ring-*` on `role="tab"` buttons. The FB-23 fix already applied `focusRingClass` to Tabs.tsx in commit `c25d4525`, but there is no mechanical regression guard — a future edit could silently re-introduce the original bug.

## Current state (verified)

Re-read `packages/haiku-ui/src/components/Tabs.tsx` at fix time (parallel-chain clobber guard):

- Line 8: `import { focusRingClass } from "../a11y"` ✓
- Line 81: tab button className starts with `${focusRingClass}` ✓ (FB-23 fix landed)
- Line 104: tabpanel className uses `focusRingClass` (not `focus:outline-none`) ✓

The **code-side** of the finding is already fixed. What remains is the **audit-side** gap: add a `require-focus-ring-on-role-tab` presence check so the absence regression is caught mechanically on future edits.

## Fix approach

**Audit-side only.** Add a `requirePresence: true` rule to the `stage-wide` profile in `packages/haiku-ui/audit-config.json` scoped to `Tabs.tsx` (the only file in the SPA that currently renders `role="tab"`, verified via `rg 'role="tab"' packages/haiku-ui/src`). Pattern: `(focusRingClass|focus-visible:ring-)`. If a future edit strips `focusRingClass` from the tab button and does not substitute a raw `focus-visible:ring-*` class, the audit fails with a `REQUIRED` diagnostic citing FB-67.

This matches the existing `requirePresence` idiom already used by `require-agent-feedback-toggle-canonical` — same mechanism, same `stage-wide` profile, same exit-code semantics. No change to the audit script itself; the `requirePresence` branch at `scripts/audit-banned-patterns.mjs:218` already handles zero-match = fail.

**Why place the rule in `stage-wide` and not `tokens`:** the `tokens` profile is unit-04 scoped to DESIGN-TOKENS §1.1a / §1.4 / §1.7 / §2.6 enforcement. Presence rules and cross-cutting structural guards (XSS sinks, origin-JSX, tab focus) live in the `stage-wide` superset profile. Keeps the unit-04 scope clean and matches the existing `require-agent-feedback-toggle-canonical` placement.

**Scope: single file.** `Tabs.tsx` is the only file rendering `role="tab"` in the SPA today. Scoping to the single file avoids false-positive `REQUIRED` failures on every other file in the package (the presence rule fails when the pattern is missing in any scope-matching file; scoping to the one file that *should* have it is correct).

**Why not a ban-side regex** (e.g. ban `role="tab"` without `focus-visible:ring-` on same element): the button className and the `role="tab"` attribute span multiple lines in the JSX, and `audit-banned-patterns.mjs` iterates line-by-line. Multi-line same-element correlation is out of scope for this audit; the `requirePresence` file-level check is the idiomatic alternative and sufficient — it guarantees that if `role="tab"` is rendered in `Tabs.tsx`, the focus-ring class is also in the same file.

## Files to modify

1. **`packages/haiku-ui/audit-config.json`** — append one rule to `profiles.stage-wide.rules`:
   ```json
   {
     "id": "require-focus-ring-on-role-tab",
     "description": "Any file that renders role=\"tab\" MUST also apply focusRingClass (or an explicit focus-visible:ring-* class) so arrow-key-traversed tab buttons have a visible focus indicator (WCAG 2.4.7 Focus Visible). Regression guard for FB-67.",
     "pattern": "(focusRingClass|focus-visible:ring-)",
     "requirePresence": true,
     "scope": ["packages/haiku-ui/src/components/Tabs.tsx"],
     "exclude": ["**/__tests__/**", "**/__snapshots__/**"]
   }
   ```

2. **`packages/haiku-ui/src/components/Tabs.tsx`** — **no change needed.** `focusRingClass` is already applied at line 81 (tab buttons) and line 104 (tabpanel) via the FB-23 fix. Re-verified at fix time.

## Verification commands

```bash
cd packages/haiku-ui
node scripts/audit-banned-patterns.mjs --profile=tokens       # exit 0
node scripts/audit-banned-patterns.mjs --profile=stage-wide   # exit 0, rule shows [OK] require-focus-ring-on-role-tab (required-presence, N matches)
npx vitest run tests/audit-banned-patterns.test.ts            # exit 0
```

All three must exit 0.

## Risks

- **Parallel-chain clobber.** Sibling fix chains (FB-55, FB-58, FB-61, FB-70, etc.) are editing `audit-config.json` concurrently — specifically, several add new rules to the `tokens` profile. The new rule here lands in `stage-wide`, so no direct conflict, but re-read `audit-config.json` immediately before writing to catch any overlapping additions. The rule append is additive and safe to re-apply on top of any sibling diff.
- **False positive if Tabs.tsx is deleted / renamed.** The rule fails if `Tabs.tsx` is removed from the tree (no scope-matching file = presence pattern not found = fail). That is the desired behavior — if the Tabs component is replaced by another mechanism, the replacement should be added to the rule's scope. Not a real risk, just a note for future refactors.
- **Contrast note in feedback body deferred.** The feedback also mentions inactive-tab light-mode contrast is 4.83:1 (passes AA 4.5:1 by 0.3) and bg-white/80 header-adjacent surface pushes it "marginal." This is not a current WCAG failure and is not in FB-67's fix direction. Not in scope for this bolt — the feedback's explicit fix direction is (1) add focus ring [done via FB-23] and (2) add presence check [this bolt]. Contrast hardening is covered by the broader contrast-audit expansions tracked via FB-55, FB-71, and unit-15.

## Out of scope

- **Modifying Tabs.tsx.** The code-side fix already landed in commit `c25d4525` (FB-23). Re-editing would be a duplicate and risks clobbering unrelated FB-23 deltas.
- **Tab panel focus ring on `tabIndex=-1` tabs.** Inactive tabs carry `tabIndex={-1}` per the ARIA tab pattern — they are not in the tab order and cannot receive keyboard focus outside of programmatic arrow-key traversal (which moves focus AND activates). The focus ring is relevant only while the tab is programmatically focused during traversal; `focusRingClass` uses `:focus-visible` which activates correctly in that path. No additional work needed.
- **Adding the rule to the `tokens` profile.** Presence rules for cross-cutting structural guards belong in `stage-wide`. `tokens` is scoped to unit-04 DESIGN-TOKENS enforcement.

## Done when

- `packages/haiku-ui/audit-config.json` `stage-wide` profile includes the `require-focus-ring-on-role-tab` rule.
- `node scripts/audit-banned-patterns.mjs --profile=stage-wide` exits 0 and the summary line includes `[OK] require-focus-ring-on-role-tab (required-presence, N matches)` with N ≥ 1.
- `node scripts/audit-banned-patterns.mjs --profile=tokens` remains exit 0 (unchanged).
- `npx vitest run tests/audit-banned-patterns.test.ts` exits 0 — both profile test cases pass.
- `git diff` on this commit touches exactly one file: `packages/haiku-ui/audit-config.json`.
