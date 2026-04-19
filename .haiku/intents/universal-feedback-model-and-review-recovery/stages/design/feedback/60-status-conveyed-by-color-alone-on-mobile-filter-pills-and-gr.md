---
title: >-
  Status conveyed by color alone on mobile filter pills and group headers — WCAG
  1.4.1 fail
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:55:01Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 1.4.1 Use of Color (A):** information must not be conveyed by color alone. Unit-11's fix gate required "Status is conveyed by AT LEAST TWO signals (color + shape OR color + text prefix)" and `state-signaling-inventory.html` listing the second signal per status.

**Violations — places where status is distinguished by color alone:**

1. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:185,189,193` — filter pills use a colored dot (`bg-amber-500 / bg-blue-500 / bg-green-500`) alongside the label "Pending / Addressed / Closed". The label is there, but the dot is the only *status-state* indicator; color-blind users rely on label reading alone. This is borderline OK for these (text is present) — but contrast:
   - `text-gray-500 dark:text-gray-400` on the pill label itself. On a transparent pill on stone-50, gray-500 is 4.83:1 (OK) but on dark bg, gray-400 on gray-950 is fine. That's not the issue — the issue is the border of the inactive pills (`border-gray-200`) is gray-200/border-gray-700 which is 1.1:1 against white — no visible boundary. Inactive pill users cannot distinguish pill-shaped tap targets from flat text.

2. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comments-list-with-agent-toggle.html:83-84,110-111,125-126` — Group headers "Pending · 2", "Addressed · 1", "Closed · 2" rely on a tinted background (`bg-amber-50/70`, `bg-blue-50/70`, `bg-green-50/70`) + text color (`text-amber-800`, `text-blue-800`, `text-green-800`) with the label itself containing the word. The word is present — so this particular case passes WCAG 1.4.1. OK.

3. **The real color-alone signal:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:78,97,…` — each card uses `border-l-amber-400` / `border-l-blue-400` / `border-l-green-400` / `border-l-gray-300` as the ONLY visual signal for pending/addressed/closed/rejected at the compact collapsed state. There is no icon glyph in the border region, and the status badge text is hidden behind a truncated card. Unit-11's scope called out `state-signaling-inventory.html` rendering a clock/arrow/check/X glyph in the left-border region — no such file exists in `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/`.

4. `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:321,337,466` — closed (opacity-70) and rejected (opacity-50) cards distinguished from pending ONLY by border color (`border-l-green-400` vs `border-l-gray-300` vs `border-l-amber-400`) and the opacity reduction. No status-text prefix in the metadata line; no icon glyph.

**Fix:** Produce the missing `state-signaling-inventory.html` artifact and apply the second signal in every card surface: icon glyph in the border region (clock/arrow/check/X) OR a text prefix in the metadata line ("Pending ·", "Closed ·", "Rejected ·"). Keep both in compact+expanded views.
