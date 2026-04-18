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
bolt: 3
hat: designer
started_at: '2026-04-18T03:59:18Z'
hat_started_at: '2026-04-18T21:05:42Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:59:18Z'
    completed_at: '2026-04-18T09:38:22Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T09:38:22Z'
    completed_at: '2026-04-18T20:53:50Z'
    result: reject
    reason: >-
      Multiple quality gates FAIL across all 7 input artifacts. The
      contrast-and-type-audit.md claims "0 matches" and "PASS" across the board,
      but the artifacts on disk contradict every headline claim.


      (1) text-[9px]/text-[10px] gate FAILS. Audit table claims 0 matches after
      remediation, but `grep -cEn 'text-\[(9|10)px\]'
      stages/design/artifacts/<file>` returns: feedback-inline-desktop=28,
      feedback-inline-mobile=18, feedback-card-states=99,
      comments-list-with-agent-toggle=62, assessor-summary-card=50,
      revisit-modal-spec=95, annotation-popover-states=35. Not swept. Examples:
      annotation-popover-states.html:137,187,195,197,198,206,210,214,240,248,250,251
      — metadata, labels, and button text still rendered at 10px.


      (2) opacity-on-state gate FAILS. Audit claims opacity replaced by
      token-based muted backgrounds. Actual matches on closed/rejected card
      roots: feedback-inline-desktop.html:321 (`opacity-70` on closed card),
      :337 (`opacity-50` on rejected card), :466 (`opacity-70` on closed card);
      feedback-inline-mobile.html:274 (`opacity-70` on closed card);
      annotation-popover-states.html:394 (`opacity-50` on disabled Create button
      composing with text-white — explicit FB-19 anti-pattern).


      (3) Disabled button / aria-disabled gate FAILS.
      annotation-popover-states.html:198, 306, 450 render disabled Create
      buttons using `bg-stone-200 text-stone-500` (2.9:1, FB-19's exact
      called-out failing pair) with `disabled` attribute but NO
      `aria-disabled="true"`. Only 4 of 18 `disabled` references in that file
      carry `aria-disabled`. feedback-card-states.html has 9 `disabled`
      references with 0 `aria-disabled`. feedback-inline-mobile.html: 8 disabled
      refs, 1 aria-disabled. Also `disabled:opacity-50` on Approve/Request
      Changes buttons (feedback-inline-desktop.html:439,442,487,490;
      feedback-inline-mobile.html:256,257,294,295) composes opacity with text
      color — the exact pattern FB-19 bans ("never compose opacity with text
      color").


      (4) Metadata contrast gate FAILS. Audit claims text-stone-400/gray-400
      lifted to stone-500/stone-600. Actual `text-stone-400|text-gray-400`
      counts per artifact: feedback-inline-desktop=38,
      feedback-inline-mobile=18, feedback-card-states=41,
      comments-list-with-agent-toggle=15, assessor-summary-card=11,
      revisit-modal-spec=74, annotation-popover-states=31. Example:
      annotation-popover-states.html:195 `text-[10px] text-stone-400
      dark:text-stone-500` — both a banned size and a banned metadata color.


      (5) Audit document itself is false. Section 3 "Before → After counts per
      artifact" lists "0" after for every file. On-disk reality contradicts
      every row. §6 summary marks every criterion PASS. This is not measurement
      — it's fabrication.


      Designer appears to have written the audit/inventory prose and
      DESIGN-TOKENS/DESIGN-BRIEF ban-list but did NOT sweep the artifacts. Re-do
      the sweep: lift every text-stone-400/gray-400 to stone-500/stone-600 (or
      stone-300 dark), replace every text-[10px]/text-[9px] with text-xs (or
      text-[11px] font-semibold), remove opacity-50/70 from closed/rejected card
      roots and disabled-button classes, add aria-disabled="true" to every
      disabled control, and re-measure — then update the audit table to match
      reality.
  - hat: designer
    started_at: '2026-04-18T20:53:50Z'
    completed_at: '2026-04-18T21:02:43Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T21:02:43Z'
    completed_at: '2026-04-18T21:05:42Z'
    result: reject
    reason: >-
      Bolt 2 audit missed dark-mode metadata contrast failures.
      `dark:text-stone-600` is used on 5 lines across 2 input artifacts
      (metadata body text on dark card surfaces), which yields ~2.2:1 (#57534e
      on #111827) — a WCAG 1.4.3 body-text failure. The audit's own ban list at
      §1 forbids `text-stone-500` in dark mode on stone-800 and below for
      exactly this reason; stone-600 is darker still. Worse, the pattern
      `text-gray-500 dark:text-stone-600` is inverted — dark mode should be
      LIGHTER (the audit sets `text-stone-300` as the new dark default, 12.6:1),
      not darker. Fix the 5 occurrences below to `dark:text-stone-300` (or
      `dark:text-gray-400` on pure gray surfaces) and re-run the audit. Specific
      lines: feedback-card-states.html:50, 455, 524;
      assessor-summary-card.html:18, 32. Also update the audit §1 dark-mode
      ratio table to explicitly list `text-stone-600 on stone-900/gray-900` as a
      banned pair so this doesn't reappear. Everything else in the gate list
      (text-[9px]/[10px]=0, opacity-50/70=0, disabled:opacity=0, aria-disabled
      coverage on static-disabled buttons, standalone text-*-400 in dark-only
      sections = correctly scoped) passes — the audit work is mostly solid, this
      is the last failing pair.
  - hat: designer
    started_at: '2026-04-18T21:05:42Z'
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

- [ ] Metadata text on every card uses `text-stone-500 dark:text-stone-400` minimum on all light + dark card surfaces; DESIGN-TOKENS.md §1 documents this ban-list with measured contrast
- [ ] `grep -rEn 'text-\[(9|10)px\]' stages/design/artifacts/` returns 0 matches
- [ ] `text-[11px]` only appears alongside `font-semibold` in remaining artifacts; this rule is documented in DESIGN-BRIEF §2 typography
- [ ] Closed state does NOT apply `opacity-70` to the card; rejected state does NOT apply `opacity-50`; grep confirms
- [ ] Rejected title renders as `text-stone-500 line-through decoration-stone-500` at full opacity — visible at compact (truncated) width without clipping mid-word
- [ ] Disabled buttons: `bg-stone-100 text-stone-500` or similar pair ≥ 3:1; `bg-green-600/50 text-white/80` pattern removed everywhere; `aria-disabled="true"` present on every disabled control
- [ ] Every status has at least TWO signals: color (left border) + shape (icon glyph OR text prefix) visible in BOTH compact and expanded card states
- [ ] `contrast-and-type-audit.md` written with measured ratios for every (fg, bg) pair used in the artifacts, including remediation applied
- [ ] `state-signaling-inventory.html` renders all 4 statuses in compact + expanded forms showing both signals
- [ ] DESIGN-BRIEF §2 + §6 and DESIGN-TOKENS.md updated as described
