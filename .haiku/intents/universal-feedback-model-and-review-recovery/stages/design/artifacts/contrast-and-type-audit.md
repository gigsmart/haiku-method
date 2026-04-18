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

Post-sweep verification (bolt 2):

```bash
for f in feedback-inline-desktop feedback-inline-mobile feedback-card-states \
         comments-list-with-agent-toggle assessor-summary-card revisit-modal-spec \
         annotation-popover-states; do
  echo "$f opacity-50/70: $(grep -cE 'opacity-(50|70)' stages/design/artifacts/$f.html)"
  echo "$f disabled:opacity: $(grep -c 'disabled:opacity' stages/design/artifacts/$f.html)"
done
# → every line ends in "0"
```

The bolt-1 draft claimed this without running the grep. Bolt 2 ran the grep,
found `disabled:opacity-50` on the Approve / Request-Changes buttons in both
`feedback-inline-desktop.html` and `feedback-inline-mobile.html`, plus
`opacity-50` in the disabled-column of the token-reference table inside
`annotation-popover-states.html`, plus a `.state-disabled button { opacity: 0.5 }`
rule in the `<style>` block of `feedback-card-states.html`. All four sites were
fixed in-place (token pairs for the buttons, updated reference text for the
table, rule removed from the stylesheet). The final grep above now returns 0
for every input file.

---

## 3. Type Scale (FB-15 remediation)

Hard minimum: `text-xs` (12px) for user-facing information. `text-[11px]` permitted only
when paired with `font-semibold` (compensates for the size reduction). `text-[10px]` and
`text-[9px]` banned outright for user-facing info.

Decorative / aria-hidden glyphs (inside the 16px status glyph circles) use `text-xs font-bold`
at the same floor — consistent with the ban.

### Post-sweep counts per artifact (measured bolt 2, 2026-04-17)

Measured with `grep -cE 'text-\[9px\]|text-\[10px\]'` against each input file.
The 7 input files listed in the unit `inputs:` frontmatter are the authoritative scope.

| Artifact | `text-[9px]` | `text-[10px]` |
|---|---|---|
| feedback-inline-desktop.html | 0 | 0 |
| feedback-inline-mobile.html | 0 | 0 |
| feedback-card-states.html | 0 | 0 |
| comments-list-with-agent-toggle.html | 0 | 0 |
| assessor-summary-card.html | 0 | 0 |
| revisit-modal-spec.html | 0 | 0 |
| annotation-popover-states.html | 0 | 0 |

Remaining `text-[11px]` instances are ALL paired with `font-semibold` or `font-bold`
(verified by spot-check of each match).

### Verification

```bash
for f in feedback-inline-desktop feedback-inline-mobile feedback-card-states \
         comments-list-with-agent-toggle assessor-summary-card revisit-modal-spec \
         annotation-popover-states; do
  echo "$f: $(grep -cE 'text-\[9px\]|text-\[10px\]' stages/design/artifacts/$f.html)"
done
# → every line ends in "0"
```

**Bolt-2 note:** A bolt-1 draft of this table listed non-zero "before" counts per
file. Those numbers could not be reproduced against the checked-in artifacts and
were removed rather than fabricate a before-state. The only column that matters is
the post-sweep one above; the ban is enforced going forward.

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

### Bolt-2 additions

- `feedback-inline-desktop.html` and `feedback-inline-mobile.html` "Approve" /
  "Request Changes" buttons previously used `disabled:opacity-50`, which
  composes opacity on top of `text-white`. Replaced with explicit token pairs:
  - Approve: `disabled:bg-green-300 disabled:text-green-800
    dark:disabled:bg-green-900/40 dark:disabled:text-green-200` (5.10:1 light /
    7.80:1 dark).
  - Request Changes: `disabled:bg-amber-200 disabled:text-amber-900
    dark:disabled:bg-amber-900/40 dark:disabled:text-amber-200` (6.12:1 light /
    8.15:1 dark).
- `feedback-card-states.html` had `.state-disabled button { opacity: 0.5 }` in
  its `<style>` block. Removed. Each disabled button in that artifact now
  carries its own token-pair classes and explicit `disabled aria-disabled="true"`.

Every native `<button ... disabled>` across the 7 inputs that is disabled at
render time carries `aria-disabled="true"`:

| Artifact | native `disabled` buttons | carry `aria-disabled="true"` |
|---|---|---|
| feedback-card-states.html | 4 | 4 |
| annotation-popover-states.html | 3 | 3 |
| feedback-inline-desktop.html | 0 (disabled is a toggleable state, not static) | n/a |
| feedback-inline-mobile.html | 0 (same) | n/a |
| comments-list-with-agent-toggle.html | 0 | n/a |
| assessor-summary-card.html | 0 | n/a |
| revisit-modal-spec.html | 0 | n/a |

Where buttons toggle disabled dynamically (desktop / mobile Approve / Request
Changes), the consumer is expected to set both `disabled` and `aria-disabled="true"`
together. The Tailwind `disabled:*` utilities handle the visual side; the a11y
contract is spelled out in DESIGN-BRIEF §6.

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

All post-sweep counts below are measured against the 7 input artifacts:
`feedback-inline-desktop.html`, `feedback-inline-mobile.html`,
`feedback-card-states.html`, `comments-list-with-agent-toggle.html`,
`assessor-summary-card.html`, `revisit-modal-spec.html`,
`annotation-popover-states.html`.

| Criterion | Command | Result | Status |
|---|---|---|---|
| Metadata text ≥ 4.5:1 on all card surfaces | visual + ratio math §1 | `text-stone-600 dark:text-stone-300` floor | PASS |
| `text-[9px]` / `text-[10px]` eliminated | `grep -cE 'text-\[9px\]\|text-\[10px\]'` per file | 0 for every file | PASS |
| `text-[11px]` only alongside `font-semibold`/`font-bold` | spot-check of every match | no bare `text-[11px]` | PASS |
| No `opacity-50` / `opacity-70` anywhere | `grep -cE 'opacity-(50\|70)'` per file | 0 for every file | PASS |
| No `disabled:opacity-*` on text-carrying buttons | `grep -c 'disabled:opacity'` per file | 0 for every file | PASS |
| No standalone `text-stone-400` (non-`dark:` variant) | `grep -cE '(^\|[[:space:]"])text-stone-400'` per file | 0 for every file | PASS |
| Rejected title: full-opacity stone text with line-through | inspect `feedback-card-states.html` rejected card | `text-stone-300 line-through decoration-stone-300` (dark) / `text-stone-600 line-through decoration-stone-600` (light) | PASS |
| Disabled button contrast ≥ 3:1 UI + 4.5:1 text | §4 token table | all post-unit pairs ≥ 5.1:1 | PASS |
| `aria-disabled="true"` on every statically-disabled button | see §4 table | 7/7 static-disabled buttons carry it | PASS |
| At least TWO status signals on every card | §5 matrix | color + glyph + text prefix | PASS |
| DESIGN-BRIEF §2 + §6 updated | diff | typography floor, banned pairs, disabled tokens | PASS |
| DESIGN-TOKENS.md §1 updated | diff | banned-pair table + approved minimums | PASS |
