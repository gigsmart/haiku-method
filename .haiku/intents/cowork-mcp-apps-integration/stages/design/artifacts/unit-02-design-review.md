---
unit: unit-02-boot-and-status
hat: design-reviewer
reviewed_at: 2026-04-15
artifacts:
  - stages/design/artifacts/boot-screen.html
  - stages/design/artifacts/host-bridge-status.html
---

# Unit-02 Design Review — Boot Screen + HostBridgeStatus Pill

## Completion Criteria — Pass/Fail

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | `boot-screen.html` exists with ≥ 3 `phase=` markers | PASS | 6 hits (`phase=loading`, `phase=connecting`, `phase=ready` ×2 in label + annotation, plus reduced-motion label) |
| 2 | `host-bridge-status.html` exists with ≥ 3 `state=` markers | PASS | 14 hits across state labels, showcase rows, and annotations |
| 3 | `aria-live` copy documented for each state transition | PASS | 23 `aria-live` hits in host-bridge-status.html; full aria-live docs block with 7 trigger→string entries including `assertive` for retry-failure |
| 4 | `prefers-reduced-motion` fallback rendered as alternate frame | PASS | Dedicated reduced-motion frame in boot-screen.html; `@media (prefers-reduced-motion: reduce)` overrides in both files |
| 5 | Contrast ≥ 4.5:1 for pill text against `stone-950` | PASS | All ratios documented in comments: teal-500→8.2:1, teal-400→10.4:1, stone-300→7.4:1, amber-400→9.1:1, red-500→5.9:1 — all ≥ 4.5:1 |
| 6 | Touch target ≥ 44px for error-state retry affordance | PASS | `.pill-touch-zone` button: `min-height: 44px; min-width: 44px; padding: 11px 0` — verified in mockup |
| 7 | No raw hex in style attributes | PASS | `rg '#[0-9a-fA-F]{3,6}'` returns zero hits in both files |

## Token Discipline

All colors use named `rgb()` values with inline comments mapping to Tailwind token names (e.g. `/* teal-500 */`, `/* stone-950 */`). No bare hex. Token names align with `DESIGN-TOKENS.md` definitions:

- `--iframe-bg` → `stone-950` ✓
- `--topbar-bg` → `stone-900` ✓
- `--host-bridge-connected` → `teal-500` ✓
- `--host-bridge-reconnecting` → `amber-400` ✓
- `--host-bridge-error` → `red-500` ✓
- `--iframe-boot-fade` → `200ms ease-out` ✓
- `--iframe-min-touch` → `44px` ✓

## Visual Consistency with Unit-01

Cross-checked against `iframe-shell-narrow-collapsed.html`:

- Font family, size, weight: consistent (ui-sans-serif, 11px/500 for pill)
- Topbar height (36px), bg (`stone-900`), border (`stone-800`): consistent
- Pill border-radius (`rounded-full`/9999px): consistent
- Pill padding (`2px 8px` in unit-01 vs `2px 9px` in unit-02): minor 1px delta — within acceptable tolerance, not a defect
- Pill gap (`4px` unit-01 vs `5px` unit-02): minor 1px delta — acceptable
- Color semantics (teal-500/amber-400/red-500): consistent
- `pillPulse` animation for reconnecting: unit-01 uses `pulse`, unit-02 uses `pillPulse` with equivalent keyframes — functionally identical, naming inconsistency is LOW severity

## Accessibility

- `role="status" aria-live="polite"` on connected/reconnecting pills ✓
- `<button>` with `aria-label` + `aria-live="polite" aria-atomic="true"` on error pill ✓
- `aria-hidden="true"` on all decorative elements (dot, spinner, logo, retry icon) ✓
- `focus-visible` outline on error button: `2px solid red-500` ✓
- Reduced-motion fallback disables spinner rotation, dot pulse, and fade transition ✓
- Retry failure uses `aria-live="assertive"` for urgency — documented in aria-live block ✓
- One gap: the reduced-motion static frame only shows "Loading…" copy; "Connecting…" and "Ready" phase labels are mentioned as text-replacement in annotation but the static frame itself doesn't render alternate static frames for connecting/ready phases. LOW severity — annotation clarifies intent clearly.

## Issues Summary

| Severity | Description |
|----------|-------------|
| LOW | `pillPulse` animation name in unit-02 differs from `pulse` in unit-01 (same keyframes). No user impact; name-align during implementation. |
| LOW | Reduced-motion frame shows only `loading` phase statically. Annotation documents connecting/ready text-replacement but no separate visual frames. Builder should add static frames for all three phases or confirm annotation-only coverage is sufficient. |
| LOW | Pill padding/gap 1px delta vs unit-01 (`2px 9px` / `5px` vs `2px 8px` / `4px`). Negligible visual impact; builder should align to unit-01 values. |

No HIGH or BLOCKING issues found.

VERDICT: PASS
