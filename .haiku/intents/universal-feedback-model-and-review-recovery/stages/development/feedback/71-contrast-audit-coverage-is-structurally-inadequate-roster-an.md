---
title: >-
  Contrast audit coverage is structurally inadequate — roster and rendered
  sampler both under-cover the real surface
status: closed
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:28:46Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-71:bolt-2'
bolt: 2
upstream_stage: null
---

**Severity:** blocker (meta-audit finding) — the contrast audit that unit-15 approved as "0 fail" does not actually prove what the mandate requires.

**Files:**
- `packages/haiku-ui/scripts/audit-contrast.mjs:45-230` (token PAIRS roster + rendered-mode walker)
- `packages/haiku-ui/audit-config.json` (stage-wide profile — no contrast checks beyond the ones above)

**Claim under audit.** Unit-15 review notes (`stages/development/artifacts/unit-15-review-findings.md` lines 20-21):
> `audit-contrast --mode=tokens` → 25 pairs · 25 pass · 0 fail
> `audit-contrast --mode=rendered` → 5 unique pairs · 0 fail · 4005ms

**What the audit actually proves.**
1. Token mode: 25 hand-enumerated pairs pass 4.5:1 / 3:1. This is a fixed roster. It covers:
   - Feedback-status badge fg/bg (§2.1)
   - Origin badge fg/bg (§2.2)
   - Card-text metadata on status-tinted backgrounds (§2.3)
   - Disabled buttons: stone-600/stone-100, stone-500/white border, stone-300/stone-800, green-800/green-300, amber-900/amber-300 (§1.7)
   - Visit counter tiers (§2.4)
   - Page body text on stone-50/100 (§page-text)
2. Rendered mode: only 5 unique (fg, bg, bucket) tuples surfaced across 4 example-session routes.

**What the audit doesn't cover — the gaps concretely exploited by other findings in this review:**
- **Primary buttons.** No entry for `bg-teal-600 + text-white` (3.10:1 fail — FB-55), `bg-teal-500 + text-white` (2.22:1 fail — FB-58), `bg-emerald-400 + text-white` disabled (1.63:1 fail — FB-61), `bg-emerald-600 + text-white` (3.85:1 fail).
- **FAB count badge.** No entry for `bg-amber-100 + text-amber-700 at 12px bold` (3.68:1 fail — FB-70).
- **Status dots on card bg (UI-nontext 3:1).** No entry for `bg-amber-500 on bg-amber-50/50` (1.64:1), `bg-stone-400 on bg-stone-100` (2.21:1) — FB-70.
- **Pin markers.** No entry for `bg-teal-500 on artifact` or `text-white on bg-teal-500` — FB-58.
- **Skip link.** `bg-teal-600 + text-white` missing — FB-55.
- **Rejected status-badge self-contrast.** `bg-stone-100 + bg-stone-100` zero delta — FB-70.

**Why rendered mode produced only 5 pairs.**
- Example-session fixtures at `/`, `/review/example-session`, `/question/example-session`, `/direction/example-session` render empty / skeleton state. FeedbackItem cards don't render → no action buttons. StageProgressStrip renders with zero stages or just names → no buttons. FAB may or may not paint depending on `useIsMobile()` matchMedia evaluation at desktop viewport (1280×720). AnnotationCanvas pins require user pin-drop — none at boot.
- Sampler at lines 496-521 iterates `document.body.querySelectorAll("*")` and requires a direct text child node to record a pair. Icon-only buttons (close "×", FAB emoji with `aria-hidden` glyph child, pin index under `aria-hidden` span) either slip through or are filtered out. Buttons with only child components also slip.
- No audit on UI-nontext 3:1 floor at all (backgrounds, borders, dots). The rendered sampler only outputs `fg + bg + bucket` for text-bearing elements; it does not emit a second entry for "element bg vs ancestor bg" for UI contrast.

**Why this matters.** The stage-wide review approved unit-15 because its audits exited 0. But the audits report what they measure, not what the mandate requires. The mandate says:
> The agent MUST verify that color contrast ratios meet WCAG AA minimum (4.5:1 for text, 3:1 for large text and UI components)

The audit does not measure "all text," only "pairs in the roster plus pairs the sampler happened to catch in 4 empty example sessions." That is not "all text," and it is certainly not "UI components."

**Fix direction:**
- **Roster expansion.** Add every (bg, fg) pair that appears on any rendered primary / secondary / tertiary button, pin, badge, chip, dot, or icon. Cross-reference component source for `bg-*` + adjacent `text-*` pairings. Minimum additions: teal-600/white, teal-500/white, teal-700/white, emerald-*/white, amber-100/amber-700@12pxbold, amber-500/amber-50, amber-500/amber-950-30, stone-400/stone-100, stone-500/stone-800, green-500/green-50, blue-500/blue-50, pin markers against artifact surface.
- **Rendered sampler overhaul.** (a) Seed populated fixtures so feedback items render with >0 entries, FAB counts > 0, pins exist, all decision buttons paint. (b) Emit UI-nontext pairs as well (`bg of element` vs `bg of parent` where element has a dot/border that functions as state indicator). (c) Fail when scanned pair count drops below a floor (e.g. 40) to catch the empty-fixture regression class.
- **Additional audit:** stage-wide check that every `bg-teal-*` + `text-white` class combination on the same element passes 4.5:1 via AST inspection, so this is a compile-time guarantee, not a runtime one.

This is intrinsically a cross-unit finding: every unit that added new colored buttons (unit-04 tokens, unit-07 FooterBar, unit-08 FeedbackList, unit-09 AgentFeedbackToggle, unit-10 FeedbackSheet, unit-13 AnnotationCanvas, unit-14 DirectionPage/QuestionPage) contributed to the gap. The root-cause fix is audit strengthening in `scripts/audit-contrast.mjs`, not a per-component patch.
