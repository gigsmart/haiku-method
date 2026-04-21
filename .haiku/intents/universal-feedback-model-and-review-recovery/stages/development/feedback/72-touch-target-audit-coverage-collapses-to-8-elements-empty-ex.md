---
title: >-
  Touch-target audit coverage collapses to 8 elements — empty example sessions
  hide nearly every mobile tap surface
status: fixing
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:29:15Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

**Severity:** blocker (meta-audit finding) — same class as FB-71 but distinct script.

**Files:**
- `packages/haiku-ui/scripts/audit-touch-targets.mjs:81-231`

**Claim under audit.** Unit-15 review notes:
> `audit-touch-targets.mjs` → 8 interactive elements · 0 fail (375×667 viewport, 4 routes)

**What 8 interactive elements actually is.** Walking the SPA at 375×667 across `/`, `/review/example-session`, `/question/example-session`, `/direction/example-session` in their current fixture state produces:
- NotFoundShell "/" has maybe 2-3 links / theme toggle.
- Review example-session: sheet FAB appears (mobile branch), but no FeedbackItem buttons (empty feedback), no SummaryBar (hidden when empty), no StageProgressStrip buttons (empty `stage_states`), no FooterBar decision buttons (they render, so ~3).
- Question example-session: one submit button, maybe one textarea, no image carousel (single image or none).
- Direction example-session: maybe one submit, one close in preview (but preview is closed by default).

That gives roughly 8 — which is what the audit reports. The number is **coverage-limited, not quality-limited**. The 44×44 floor is not being exercised on:
- StageProgressStrip stage dots (14-20 px — FB-63).
- FeedbackItem action buttons (60×24 — FB-65).
- FeedbackSummaryBar filter pills (80×24 — FB-65).
- Tabs tab buttons (varies, unchecked — FB-67).
- AnnotationCanvas pin buttons (28×28 visible, but `::before` extension to 44×44 per `components/AnnotationCanvas.tsx:644-659` — this SHOULD pass the audit's `::before` exception, but is unverified because pins don't render in example session).
- Legacy ReviewSidebar / ReviewPage action rows in `components/ReviewPage.tsx` (lines 730, 762, 730+).
- DirectionPage preview close button, carousel nav buttons.
- Theme toggle, keyboard-help trigger (both in Header).

**Consequence.** A mobile user cannot tap the Dismiss button on a feedback card reliably. The audit will continue to report "0 fail" while FB-65 remains an open defect, because the audit never paints the surface.

**Fix direction:**
- Seed fixtures that populate: `/review/example-session` with ≥3 feedback items (one per status), populated `stage_states` (≥3 stages with visits > 0), 1+ pin pre-planted (or add a second route that simulates a post-click state).
- `/question/example-session` should have ≥2 image URLs (to exercise the carousel), both free-text and multi-choice variants.
- `/direction/example-session` should open the PreviewDialog programmatically (e.g. `?preview=archetype-a` query param) so the dialog's close button gets measured.
- Add a hard floor: `if (scanned.length < 40) { fail("coverage collapse — fixtures under-populated") }`.
- Add a presence check: specific `data-testid` selectors that MUST be present and measured on each route (e.g. `[data-testid="annotation-pin-*"]`, `[data-testid="feedback-item"] button[data-action]`, `[data-testid="stage-progress-dot"]`). Missing testid → audit fails with a clear message.

Same root cause as FB-71; both scripts need coverage floors and populated fixtures. Rolling them into one audit infrastructure fix in a follow-up unit is probably the right call.
