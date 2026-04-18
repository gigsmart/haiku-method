---
title: 'Contrast, type scale, and non-color state signaling'
type: design
closes:
  - FB-10
  - FB-13
  - FB-15
  - FB-19
  - FB-24
depends_on:
  - unit-10-stage-wide-token-audit
inputs:
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/annotation-popover-states.html
  - >-
    stages/design/feedback/10-low-contrast-metadata-text-fails-wcag-aa-across-all-artifact.md
  - >-
    stages/design/feedback/13-closed-rejected-opacity-reduction-drops-text-contrast-below.md
  - >-
    stages/design/feedback/15-10px-and-9px-text-sizes-used-extensively-fail-readability-an.md
  - >-
    stages/design/feedback/19-disabled-button-contrast-fails-aa-for-non-text-ui.md
  - >-
    stages/design/feedback/24-status-distinguished-only-by-colored-left-border-fails-infor.md
outputs:
  - stages/design/artifacts/contrast-and-type-audit.md
  - stages/design/artifacts/state-signaling-inventory.html
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/annotation-popover-states.html
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
quality_gates:
  - >-
    Metadata text (FB-XX · Visit N · origin lines) uses `text-stone-500
    dark:text-stone-400` minimum on white/stone-50 and stone-950 surfaces;
    DESIGN-TOKENS.md §1 explicitly bans `stone-400`/`gray-400` on white/stone-50
    for text and documents measured contrast ≥ 4.5:1
  - >-
    grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/ returns 0 matches —
    9px and 10px user-facing text eliminated; `text-xs` (12px) adopted as the
    hard minimum; `text-[11px]` permitted only when paired with `font-semibold`
    and documented in DESIGN-BRIEF §2 typography
  - >-
    Closed/rejected cards DO NOT apply `opacity-70` or `opacity-50` to the
    entire card; state is conveyed by border color + badge + muted background
    only; `grep -rEn 'opacity-(50|70)' stages/design/artifacts/` on
    closed/rejected card selectors returns 0 matches; rejected title uses
    `text-stone-500 line-through decoration-stone-500` at full opacity
  - >-
    Disabled button contrast ≥ 3:1 for non-text indicator (WCAG 2.2 1.4.11) AND
    ≥ 4.5:1 for button text where text is present; `bg-green-600/50
    text-white/80` pattern replaced everywhere with opaque token pairs (e.g.
    `bg-green-300 text-green-800`); `aria-disabled="true"` present on every
    disabled control alongside `disabled` attribute
  - >-
    Status is conveyed by AT LEAST TWO signals (color + shape OR color + text
    prefix) on every feedback card — not by color alone;
    state-signaling-inventory.html enumerates the chosen second signal per
    status (pending/addressed/closed/rejected) and shows it rendered in both
    compact and expanded card states
  - >-
    contrast-and-type-audit.md written with measured contrast ratios for every
    (foreground, background) pair used in artifacts; any pair below 4.5:1 for
    body text or 3:1 for UI is listed with the remediation applied
status: active
bolt: 2
hat: design-reviewer
started_at: '2026-04-18T03:59:18Z'
hat_started_at: '2026-04-18T04:26:45Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:59:18Z'
    completed_at: '2026-04-18T04:11:00Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T04:11:00Z'
    completed_at: '2026-04-18T04:17:42Z'
    result: reject
    reason: >-
      Gate 1 (metadata contrast ≥ 4.5:1) fails on the rejected-light card title
      — the core FB-13 remediation target. `text-stone-500` (#78716c) on
      `bg-stone-100` (#f5f5f4) measures **4.40:1**, below WCAG 2.1 AA 4.5:1
      body-text. This pattern appears in: feedback-inline-desktop.html:296 and
      state-signaling-inventory.html:177,188. The audit (§2 row "rejected ·
      light") claims 4.61:1 PASS, but 4.61:1 is stone-500 on pure white — the
      audit confused the two backgrounds. Fix: lift rejected-light title to
      `text-stone-600` on `bg-stone-100` (6.99:1), or swap card bg to stone-50
      (where stone-500 = 4.59:1 — still right at floor, prefer stone-600). Also:
      feedback-inline-desktop.html:244 "Reject" button uses `text-gray-500
      bg-gray-100` = 4.39:1, also failing AA. Update DESIGN-TOKENS.md §1.1a
      banned-pair table to include `bg-stone-100` / `bg-gray-100` for
      stone-500/gray-500, and re-measure all (fg, bg) pairs in
      contrast-and-type-audit.md §§1-2 against the actual background token —
      several rows list contrast vs. the wrong background. Gates 2, 3, 4, 5
      pass; only Gate 1 + audit accuracy fail.
  - hat: designer
    started_at: '2026-04-18T04:17:42Z'
    completed_at: '2026-04-18T04:26:45Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T04:26:45Z'
    completed_at: null
    result: null
---
# Contrast, type scale, and non-color state signaling

## Scope

Five FB items all point at the same failure mode: load-bearing information is either illegible (low contrast, tiny text) or invisible to color-blind users (color-only state cues). This unit fixes the type scale floor, the contrast minimums, the opacity-on-state anti-pattern, and adds a non-color second signal to every status.

**FB-to-fix mapping:**

- **FB-10** (metadata contrast): every `text-gray-400 dark:text-gray-500` / `text-stone-400 dark:text-stone-500` metadata line (e.g. `feedback-inline-desktop.html:109`, `feedback-inline-mobile.html:178`, `feedback-card-states.html:85`, `comments-list-with-agent-toggle.html:91/102/117`, `assessor-summary-card.html:55/98`) lifted to `text-stone-500 dark:text-stone-400` minimum — or `text-stone-600 dark:text-stone-300` for any `text-[11px]`-or-smaller line after this unit runs. DESIGN-TOKENS.md adds an explicit "banned text colors on given surfaces" table.
- **FB-13** (opacity on state): drop `opacity-70` on `closed` (feedback-inline-desktop.html:270 and DESIGN-BRIEF §2). Drop `opacity-50` on `rejected` (:286, §2). Replace with: closed = green left-border + muted green background + closed badge; rejected = stone-500 full-opacity title with `line-through decoration-stone-500` + rejected badge. Add a visible "Closed" or "Rejected" text prefix to metadata line.
- **FB-15** (9–10px text): ban `text-[9px]` and `text-[10px]` on any user-facing information. Adopt `text-xs` (12px) as hard minimum. Allow `text-[11px]` ONLY when paired with `font-semibold`. Affected lines enumerated in feedback: `feedback-inline-desktop.html:109/133/175`, `comments-list-with-agent-toggle.html:90/101/116/128/141`, `assessor-summary-card.html:61/65/70`, `revisit-modal-spec.html:115-117/137-139`, `annotation-popover-states.html:153/163/173/210`. DESIGN-BRIEF §2 typography floor updated.
- **FB-19** (disabled contrast): raise disabled button text to token pairs that meet ≥ 3:1 non-text contrast (WCAG 2.2 1.4.11) and — where disabled text is shown — ≥ 4.5:1. Replace `bg-green-600/50 text-white/80` composites with opaque token pairs. Add `aria-disabled="true"` alongside `disabled` on every disabled control (`annotation-popover-states.html:164`, `feedback-card-states.html:201-202`).
- **FB-24** (color-alone status): add a second signal to every status. Recommend a small icon glyph in the left-border region (clock = pending, arrow = addressed, checkmark = closed, X = rejected) PLUS a text prefix in the metadata line in compact state (e.g. "Pending · FB-12 · Visit 1 · adversarial-review"). Verify rejected state's strikethrough is still visible in the compact (truncated) state.

## Approach

The designer hat will:

1. Produce a `contrast-and-type-audit.md` that measures every (fg, bg) pair used across artifacts and states (including compact-vs-expanded card states, light + dark modes, closed/rejected "muted" states) and flags every ratio below 4.5:1 body-text or 3:1 UI threshold.
2. Produce a `state-signaling-inventory.html` rendering every status in both compact and expanded forms with the chosen second signal visible (icon glyph + text prefix).
3. Patch `DESIGN-BRIEF.md` §2 (typography floor, banned text-on-surface pairs, disabled-button tokens, status state-signal rules) and §6 (updated WCAG contrast table including disabled-control pairs).
4. Patch `DESIGN-TOKENS.md` §1 with the banned-pair table + approved minimums.
5. Sweep affected artifact lines.

The design-reviewer hat will re-measure contrast ratios on the artifacts (screenshot + color-picker or the audit report's sample swatches) and confirm every claim.

The feedback-assessor hat (auto-injected) will independently re-check each FB diagnostic: re-measure metadata contrast at a sample of artifact lines; grep for `text-[9px]` / `text-[10px]`; grep for `opacity-50` / `opacity-70` on closed/rejected selectors; check disabled-button pairs against the 3:1 threshold; verify at least two non-color signals for each status.

## Completion criteria

- [x] Metadata text on every card uses `text-stone-500 dark:text-stone-400` minimum on all light + dark card surfaces; DESIGN-TOKENS.md §1 documents this ban-list with measured contrast
- [x] `grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/` returns 0 matches
- [x] `text-[11px]` only appears alongside `font-semibold` in remaining artifacts; this rule is documented in DESIGN-BRIEF §2 typography
- [x] Closed state does NOT apply `opacity-70` to the card; rejected state does NOT apply `opacity-50`; grep confirms
- [x] Rejected title renders as `text-stone-500 line-through decoration-stone-500` at full opacity — visible at compact (truncated) width without clipping mid-word
- [x] Disabled buttons: `bg-stone-100 text-stone-500` or similar pair ≥ 3:1; `bg-green-600/50 text-white/80` pattern removed everywhere; `aria-disabled="true"` present on every disabled control
- [x] Every status has at least TWO signals: color (left border) + shape (icon glyph OR text prefix) visible in BOTH compact and expanded card states
- [x] `contrast-and-type-audit.md` written with measured ratios for every (fg, bg) pair used in the artifacts, including remediation applied
- [x] `state-signaling-inventory.html` renders all 4 statuses in compact + expanded forms showing both signals
- [x] DESIGN-BRIEF §2 + §6 and DESIGN-TOKENS.md updated as described
