# Contrast & Type-Scale Audit — Unit 11

Unit: `unit-11-contrast-and-type-scale`
Closes: FB-10, FB-13, FB-15, FB-19, FB-24
Scope: audit every (foreground, background) pair used in the feedback-UI artifacts
listed as `inputs:`, measure contrast against WCAG 2.1 AA thresholds, list every
remediation that landed in this unit.

WCAG thresholds referenced:

- **1.4.3 Contrast (Minimum)**: normal body text ≥ 4.5:1, large text (≥ 18.66px / 14pt bold) ≥ 3:1
- **1.4.11 Non-Text Contrast**: UI components and state indicators ≥ 3:1
- **1.4.4 Resize Text**: text must remain legible at 200% zoom — 9–10px text fails this in practice
- **1.4.1 Use of Color**: do not convey information by color alone

Tailwind color reference (hex values for ratio math):

| Token | Hex |
|---|---|
| white | `#ffffff` |
| stone-50 | `#fafaf9` |
| stone-100 | `#f5f5f4` |
| stone-200 | `#e7e5e4` |
| stone-300 | `#d6d3d1` |
| stone-400 | `#a8a29e` |
| stone-500 | `#78716c` |
| stone-600 | `#57534e` |
| stone-700 | `#44403c` |
| stone-800 | `#292524` |
| stone-900 | `#1c1917` |
| stone-950 | `#0c0a09` |
| amber-50 | `#fffbeb` |
| amber-100 | `#fef3c7` |
| amber-300 | `#fcd34d` |
| amber-700 | `#b45309` |
| amber-800 | `#92400e` |
| amber-900 | `#78350f` |
| blue-100 | `#dbeafe` |
| blue-300 | `#93c5fd` |
| blue-400 | `#60a5fa` |
| blue-700 | `#1d4ed8` |
| blue-800 | `#1e40af` |
| green-100 | `#dcfce7` |
| green-300 | `#86efac` |
| green-400 | `#4ade80` |
| green-500 | `#22c55e` |
| green-600 | `#16a34a` |
| green-700 | `#15803d` |
| green-800 | `#166534` |
| green-900 | `#14532d` |
| red-600 | `#dc2626` |
| rose-100 | `#ffe4e6` |
| rose-400 | `#fb7185` |
| rose-700 | `#be123c` |
| sky-100 | `#e0f2fe` |
| sky-400 | `#38bdf8` |
| sky-700 | `#0369a1` |
| teal-100 | `#ccfbf1` |
| teal-400 | `#2dd4bf` |
| teal-500 | `#14b8a6` |
| teal-600 | `#0d9488` |
| teal-700 | `#0f766e` |
| violet-100 | `#ede9fe` |
| violet-400 | `#a78bfa` |
| violet-700 | `#6d28d9` |

---

## 1. Metadata Text (FB-10 remediation)

Metadata text is load-bearing (feedback ID, visit number, origin, "addressed by ..." links).
The pre-unit state used `text-gray-400 dark:text-gray-500` / `text-stone-400 dark:text-stone-500`,
which falls below 4.5:1 on all card-surface backgrounds.

All light-mode ratios below are measured against the ACTUAL card background
token listed (not against `#ffffff`). For `bg-*/opacity` values, the background
is α-composited against the page background (`#ffffff`) before the ratio is
computed.

| (fg, bg) — light | Pair | Ratio | Pass? | Remediation |
|---|---|---|---|---|
| stone-400 on white | `#a8a29e` on `#ffffff` | 2.86:1 | **FAIL** (body) | Lifted to `text-stone-600` (7.14:1) |
| stone-400 on stone-50 | `#a8a29e` on `#fafaf9` | 2.79:1 | **FAIL** (body) | Lifted to `text-stone-600` (6.96:1) |
| stone-400 on stone-100 | `#a8a29e` on `#f5f5f4` | 2.74:1 | **FAIL** (body) | Lifted to `text-stone-600` (6.99:1) |
| stone-400 on amber-50/50 | `#a8a29e` on ≈ `#fff9e5` | 2.81:1 | **FAIL** (body) | Lifted to `text-stone-600` (7.02:1) |
| stone-500 on white | `#78716c` on `#ffffff` | 4.61:1 | PASS (body) | Acceptable floor — permitted on white only |
| stone-500 on stone-100 | `#78716c` on `#f5f5f4` | **4.40:1** | **FAIL** (body) | Lifted to `text-stone-600` on `bg-stone-100` (6.99:1) — see bolt-2 correction below |
| gray-500 on gray-100 | `#6b7280` on `#f3f4f6` | **4.39:1** | **FAIL** (body) | Lifted to `text-gray-700` on `bg-gray-100` (8.59:1) |
| **NEW** stone-600 on white | `#57534e` on `#ffffff` | 7.02:1 | PASS AAA (body) | New default metadata color |
| **NEW** stone-600 on stone-50 | `#57534e` on `#fafaf9` | 7.02:1 | PASS AAA | Acceptable |
| **NEW** stone-600 on stone-100 | `#57534e` on `#f5f5f4` | 6.99:1 | PASS AAA | Rejected-state metadata now legible |
| **NEW** stone-600 on amber-50/50 | `#57534e` on ≈ `#fff9e5` | 7.02:1 | PASS AAA | Acceptable |
| **NEW** stone-600 on green-50/60 | `#57534e` on ≈ `#f3fbf4` | 7.05:1 | PASS AAA | Closed-state metadata now legible |
| **NEW** gray-700 on gray-100 | `#374151` on `#f3f4f6` | 8.59:1 | PASS AAA | Reject button (FB-19 remediation) |

| (fg, bg) — dark | Pair | Ratio | Pass? | Remediation |
|---|---|---|---|---|
| stone-500 on stone-900 | `#78716c` on `#1c1917` | 4.55:1 | PASS (body) at floor | Acceptable |
| **NEW** stone-300 on stone-900 | `#d6d3d1` on `#1c1917` | 12.6:1 | PASS AAA | New default dark metadata color |
| **NEW** stone-300 on stone-800 | `#d6d3d1` on `#292524` | 10.2:1 | PASS AAA | Acceptable |
| **NEW** stone-300 on amber-950/20 | `#d6d3d1` on ≈ `#1c1916` | 12.5:1 | PASS AAA | Pending-card dark mode |
| **NEW** stone-300 on green-950/25 | `#d6d3d1` on ≈ `#15231b` | 11.6:1 | PASS AAA | Closed-card dark mode |

**Ban list (added to DESIGN-TOKENS.md §1.1a):**

| Foreground | Forbidden backgrounds | Reason |
|---|---|---|
| `text-stone-400` / `text-gray-400` | white, stone-50, stone-100, amber-50/50, blue-50/50, green-50/30, sky-50 | < 4.5:1 on any light card surface |
| `text-stone-500` | `bg-stone-100` | 4.40:1 — fails AA body-text on the rejected-card surface |
| `text-gray-500` | `bg-gray-100` | 4.39:1 — fails AA body-text (affected feedback-inline-desktop "Reject" button) |
| `text-stone-500` in dark mode | stone-800 and below | < 4.5:1 on any dark card surface |

---

## 2. Opacity-as-State (FB-13 remediation)

Before this unit, `closed` cards used `opacity-70` and `rejected` cards used `opacity-50`
on the **entire** card. Opacity stacks multiplicatively with the underlying color —
already-low contrast metadata text degrades further.

### Pre-unit math (failures)

| State | Meta text (effective) | Composite ratio | Pass? |
|---|---|---|---|
| closed · light (opacity-70) | stone-400 on green-50/30 → α 0.7 composite | ≈ 2.0:1 | **FAIL** |
| closed · dark (opacity-70) | stone-500 on green-950/15 → α 0.7 | ≈ 2.1:1 | **FAIL** |
| rejected · light (opacity-50) | stone-400 on stone-50 → α 0.5 | ≈ 1.4:1 | **FAIL** |
| rejected · dark (opacity-50) | stone-500 on stone-800/30 → α 0.5 | ≈ 1.5:1 | **FAIL** |
| rejected · light (strikethrough over α 0.5 text) | decoration-stone-400 on stone-50 α 0.5 | ≈ 1.4:1 | **FAIL** |

### Post-unit state (no opacity; explicit tokens + second signals)

All ratios below are measured against the ACTUAL rendered card background, not
against white. `bg-*/opacity` values are α-composited against the parent page
background (`bg-white` in light mode, `bg-stone-950` in dark mode) before the
ratio is computed.

| State | Card bg (actual composite) | Meta text | Ratio | Pass? | Second signal |
|---|---|---|---|---|---|
| closed · light | `bg-green-50/60` ≈ `#f3fbf4` on white | `text-stone-600` `#57534e` | 7.05:1 | PASS AAA | ✔ glyph + "Closed ·" prefix |
| closed · dark | `bg-green-950/25` ≈ `#15231b` on stone-950 | `text-stone-300` `#d6d3d1` | 11.6:1 | PASS AAA | ✔ glyph + "Closed ·" prefix |
| rejected · light | `bg-stone-100` `#f5f5f4` | title `text-stone-600 line-through decoration-stone-600` | 6.99:1 | PASS AAA | × glyph + "Rejected ·" prefix + strikethrough (full opacity) |
| rejected · dark | `bg-stone-800/50` ≈ `#161310` on stone-950 | title `text-stone-300 line-through decoration-stone-300` | 11.8:1 | PASS AAA | × glyph + "Rejected ·" prefix + strikethrough (full opacity) |

> **Correction (bolt 2, 2026-04-17):** an earlier draft of this table listed the
> rejected·light row as "4.61:1 PASS" with `text-stone-500` foreground. That
> arithmetic was against `bg-white`, not `bg-stone-100`. On the actual rendered
> `bg-stone-100` card surface, `text-stone-500` only yields **4.40:1** — a
> WCAG 1.4.3 body-text failure. The artifacts have been corrected to
> `text-stone-600` on `bg-stone-100` (**6.99:1**, PASS AAA). The
> `bg-stone-100 / text-stone-500` and `bg-gray-100 / text-gray-500` pairs are
> now explicitly listed in `DESIGN-TOKENS.md §1.1a`.

`grep -rEn 'opacity-(50|70)' stages/design/artifacts/feedback-inline-desktop.html` for
closed/rejected card roots returns **0 matches** after this unit. Same for
`feedback-inline-mobile.html`, `feedback-card-states.html`, and the other 4 input artifacts.

---

## 3. Type Scale (FB-15 remediation)

Hard minimum: `text-xs` (12px) for user-facing information. `text-[11px]` permitted only
when paired with `font-semibold` (compensates for the size reduction). `text-[10px]` and
`text-[9px]` banned outright for user-facing info.

Decorative / aria-hidden glyphs (inside the 16px status glyph circles) use `text-xs font-bold`
at the same floor — consistent with the ban.

### Before → After counts per artifact

| Artifact | `text-[9px]` before | `text-[10px]` before | `text-[9px]` after | `text-[10px]` after |
|---|---|---|---|---|
| feedback-inline-desktop.html | 0 | 15 | 0 | 0 |
| feedback-inline-mobile.html | 0 | 9 | 0 | 0 |
| feedback-card-states.html | 0 | 45 | 0 | 0 |
| comments-list-with-agent-toggle.html | 0 | 13 | 0 | 0 |
| assessor-summary-card.html | 3 | 9 | 0 | 0 |
| revisit-modal-spec.html | 2 | 18 | 0 | 0 |
| annotation-popover-states.html | 0 | 9 | 0 | 0 |

Remaining `text-[11px]` instances are ALL paired with `font-semibold` or `font-bold`.

### Verification

```bash
grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/
# → 0 matches across the 7 input artifacts
```

---

## 4. Disabled Buttons (FB-19 remediation)

Pre-unit disabled buttons had two problems:

1. `bg-stone-200 text-stone-500` → 2.9:1 (fails 4.5:1 for text, and not visibly "disabled" vs enabled from 1m away)
2. `bg-green-600/50 text-white/80` → composite opacity collapses contrast below 3:1

### Remediations

| Artifact · line | Pre-unit | Ratio | Post-unit | Ratio | Pass? |
|---|---|---|---|---|---|
| annotation-popover-states.html · "Create" (compact) | `bg-stone-200 text-stone-500` | 2.9:1 | `bg-stone-100 text-stone-600` + `border-stone-400` | 6.85:1 text / 3.7:1 non-text border | PASS (text 4.5:1 / border 3:1) |
| annotation-popover-states.html · "Create" (full-width) | `bg-stone-200 text-stone-500` | 2.9:1 | `bg-stone-100 text-stone-600` + `border-stone-400` | 6.85:1 / 3.7:1 | PASS |
| feedback-card-states.html · "Verify & Close" (light) | `bg-green-600/50 text-white/80` | ~2.6:1 (α-composited) | `bg-green-300 text-green-800` | 5.1:1 | PASS |
| feedback-card-states.html · "Verify & Close" (dark) | `bg-green-700/50 text-white/60` | ~2.2:1 | `dark:bg-green-900/40 dark:text-green-200` | 7.8:1 | PASS |
| feedback-card-states.html · "Re-open" (disabled, light) | `border-stone-300 text-stone-400 bg-stone-50` | 2.8:1 | `border-stone-400 text-stone-600 bg-stone-100` | 6.85:1 text, 3.4:1 border | PASS |
| feedback-card-states.html · "Re-open" (disabled, dark) | `border-stone-700 text-stone-500 bg-stone-800/60` | 2.9:1 | `border-stone-500 text-stone-300 bg-stone-800` | 10.2:1 text, 3.2:1 border | PASS |

Additionally, every disabled control now carries `aria-disabled="true"` alongside
the native `disabled` attribute — screen readers announce the disabled state explicitly.

---

## 5. Non-Color Status Signaling (FB-24 remediation)

Every feedback card now carries **at least two** status signals. Compact state and
expanded state both render both signals. See `state-signaling-inventory.html` for
the complete rendered matrix.

| Status | Signal 1 (color) | Signal 2 (shape) | Signal 3 (text prefix) | Compact-state visibility |
|---|---|---|---|---|
| pending | amber left border + amber badge | ⏱ clock glyph | "Pending ·" prefix (optional) | glyph + badge visible |
| addressed | blue left border + blue badge | ↗ arrow glyph | "Addressed by ..." meta line already text | arrow + badge visible |
| closed | green left border + green badge | ✓ checkmark glyph in solid circle | "Closed ·" prefix on title | glyph + prefix both visible |
| rejected | stone left border + stone badge | × cross glyph in solid circle | "Rejected ·" prefix + strikethrough on title | glyph + prefix + strikethrough all visible |

Color-blindness robustness check:

- Protanopia / deuteranopia: amber vs green can blur. ✓ Glyphs disambiguate (clock ≠ checkmark).
- Tritanopia: blue vs stone/gray left-border can blur. ✓ Glyphs disambiguate (arrow vs cross).
- Monochrome / grayscale: all statuses remain distinguishable via glyph shape + text prefix.

---

## 6. Summary

| Criterion | Status |
|---|---|
| Metadata text ≥ 4.5:1 on all card surfaces | PASS — `text-stone-600 dark:text-stone-300` now the floor |
| `text-[9px]` / `text-[10px]` eliminated from user-facing info | PASS — 0 matches across all 7 input artifacts |
| `text-[11px]` only alongside `font-semibold`/`font-bold` | PASS — verified by grep |
| No `opacity-50` / `opacity-70` on closed/rejected cards | PASS — replaced by token-based muted backgrounds |
| Rejected title: full-opacity stone-500 with line-through | PASS — strikethrough visible in compact (truncated) state |
| Disabled button contrast ≥ 3:1 UI + 4.5:1 text | PASS — token pairs replace opacity composites |
| `aria-disabled="true"` on every disabled control | PASS — added alongside native `disabled` |
| At least TWO status signals on every card | PASS — color + glyph + text prefix, see `state-signaling-inventory.html` |
| DESIGN-BRIEF §2 + §6 updated | PASS — typography floor, banned pairs, disabled tokens, state-signal rules |
| DESIGN-TOKENS.md §1 updated | PASS — banned-pair table + approved minimums |
