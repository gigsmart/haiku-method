---
title: >-
  FeedbackItem action buttons and FeedbackSummaryBar filter pills fail 44x44
  touch target
status: closed
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:26:27Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-65:bolt-3'
bolt: 3
upstream_stage: null
---

**Severity:** blocker — WCAG 2.5.5 Target Size (AAA) and 2.5.8 (Minimum, AA) violated across the most-tapped mobile controls.

**Files and offenders:**

1. **`packages/haiku-ui/src/components/feedback/FeedbackItem.tsx:54-78` (ACTION_BUTTON_BASE + all status-action buttons).**
   `text-xs font-medium px-2 py-1 rounded-md` → computed size roughly `~60×24` CSS px. Every Dismiss / Verify & Close / Reopen / Delete button on every feedback row is below the 44×44 floor.
   - `DISMISS_CLASSES`, `VERIFY_CLOSE_CLASSES`, `REOPEN_CLASSES`, `DELETE_CLASSES` — none apply `touchTargetClass` or `touchTargetHitAreaClass`.
   - These are the most repeated controls in the mobile review experience.

2. **`packages/haiku-ui/src/components/feedback/FeedbackSummaryBar.tsx:80-97` (filter pills).**
   `inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full` → roughly `~80×24`. The Pending / Addressed / Closed / Rejected filter pills all fail 44×44.

3. **`packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:269-272` (sheet Dismiss "✕").**
   `inline-flex items-center justify-center rounded-md px-3 py-1 text-sm` — height ≈ 28 px; it does have `touchTargetClass` but the actual `hit area` includes the text-sized content. Let me double-check: `touchTargetClass` resolves to `.touch-target { min-height: 44px; min-width: 44px }` — so it DOES hit 44. OK on this one. (Leaving this note so the fix sweep does not "correct" a passing case.)

4. **`packages/haiku-ui/src/components/StageProgressStrip.tsx:43` — covered in FB-63.**

5. **`packages/haiku-ui/src/components/Tabs.tsx:69-90` (tab buttons).**
   `px-4 py-2.5 text-sm font-medium` → roughly 44-60 wide × 40 tall. Marginal on height; depends on computed font. Without `touchTargetClass` the min-height is not guaranteed.

**Why the audit missed it.** `audit-touch-targets.mjs` at `/review/example-session` sees only 8 interactive elements. Empty example sessions render ZERO feedback items (so ACTION_BUTTON_BASE never paints), ZERO filter pills (SummaryBar hides itself when items are empty — line 61), and potentially ZERO tabs if the legacy ReviewPage's fixture data is thin. The audit's "0 fail / 8 scanned" output is a coverage failure, not a pass.

**Fix direction:**
- Add `touchTargetClass` (or the 2-utility `touchTargetHitAreaClass` where visible size must stay compact) to every action button pattern above.
- Fixture augmentation: the rendered-audit routes need fixtures that populate feedback items AND summary bar AND nav strip before the 44×44 audit runs.
- Audit strengthening: the audit report should include a hard floor on `scanned` count (e.g. `if scanned.length < 30 then fail`) so a coverage collapse cannot silently return a pass.
