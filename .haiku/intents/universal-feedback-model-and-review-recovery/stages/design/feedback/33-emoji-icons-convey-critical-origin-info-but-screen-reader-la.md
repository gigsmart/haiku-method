---
title: >-
  Emoji icons convey critical origin info but screen reader labels are
  inconsistent
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-17T22:32:15Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

The `FeedbackOriginIcon` component (DESIGN-BRIEF §2) uses emoji to signal where feedback came from (🔍 Review Agent, 🔗 PR Comment, ✎ Annotation, 💬 Comment, 🤖 Agent). This IS paired with a visible text label ("Review Agent", "PR Comment", etc.) — good.

BUT the emoji rendering is inconsistent across artifacts:
- `artifacts/feedback-inline-desktop.html:102` — `<span aria-hidden="true">&#x1F6E1;&#xFE0F;</span> Review Agent` (shield emoji, not magnifier as spec says)
- `artifacts/feedback-inline-mobile.html:172` — same shield emoji for Review Agent
- `artifacts/feedback-card-states.html:80` — shield emoji
- DESIGN-BRIEF.md:173 — **specifies magnifier 🔍 for Review Agent**

The spec and implementation disagree on which emoji represents "Review Agent". This is both a consistency issue and an accessibility issue — some emoji have well-understood screen-reader announcements, others don't. A shield emoji announces as "shield emoji" on VoiceOver, which doesn't convey "review agent" at all.

Additionally:
- `artifacts/feedback-inline-desktop.html:127` — `&#x1F500;` (twisted rightwards arrows = "shuffle") used for "PR Comment" — the spec says `🔗` (link)
- `artifacts/feedback-inline-desktop.html:214` — `&#x2728;` (sparkles) used for "Agent" — the spec says `🤖` (robot)

All three mismatches will confuse users trying to build a mental model. The `aria-hidden="true"` on the emoji is correct, but the visible text labels are the only state signal — so emoji consistency matters less for a11y and more for visual cognition.

**Fix:**
- Pick the actual emoji set (match spec OR match code; one or the other) and update the mismatched artifacts.
- Add an origin-legend in the sidebar header or help overlay so new users learn the icon ↔ origin mapping.
- Test emoji rendering across Windows (Segoe UI Emoji), macOS (Apple Color Emoji), and common Linux distros — some of the fine-grained variants (shield vs shield with cross) render differently.
