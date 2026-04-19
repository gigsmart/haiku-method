---
title: >-
  Emoji origin mapping still drifted (FB-33 regression): shield/shuffle/sparkles
  still in use across mockups
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:54:15Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 1.1.1 Non-text Content (A):** decorative emoji used as the origin indicator must map consistently and have a textual alternative. When the emoji and its label drift between artifacts, screen-reader users get one origin, sighted users get another, and dev ships whichever file they copy first.

Unit-13 bolt-3 reject reason explicitly flagged this drift and said it was fixed before advance. aria-landmark-spec §6 declares the canonical mapping: `🔍 U+1F50D Review Agent`, `🔗 U+1F517 External PR/MR`, `🤖 U+1F916 Agent`. §9 verification grep forbids the drifted codepoints.

**Reality on HEAD — drifted emoji still present:**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:211` — `&#x1F6E1;&#xFE0F;` (🛡 shield) labeled "Review Agent" (should be 🔍)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:237` — `&#x2728;` (✨ sparkles) labeled "Agent" (should be 🤖)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:263,277` — `&#x1F500;` (🔀 shuffle) labeled "PR Comment"/"Annotation" (should be 🔗 for PR/MR)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html` — same drifted trio
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:80,99,…` — ~18 occurrences of shield/shuffle/sparkles
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comments-list-with-agent-toggle.html:76,90,101,116,131,141` — all drifted
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/comment-to-feedback-flow.html` — drifted

**aria-label consistency:** labels also drift — same emoji (🛡) is read as "Review Agent" in one place and nothing in another; 🔀 means both "External PR" and "Annotation" in different cards. Screen reader users will be confused about what each badge actually represents.

**Impact:** Reviewers on one artifact see `🛡 Review Agent` badge; developer reads `aria-landmark-spec.md` (once it lands on HEAD) and implements `🔍 Review Agent`. Shipping inconsistency guarantees a second round of FB-33.

**Fix:** Global sweep across every file in `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/`:
  - `&#x1F6E1;&#xFE0F;` → `&#x1F50D;` (🛡 → 🔍, Review Agent)
  - `&#x1F500;` → `&#x1F517;` (🔀 → 🔗, External PR/MR)
  - `&#x2728;` → `&#x1F916;` (✨ → 🤖, Agent)
Plus ensure every emoji `<span>` is `aria-hidden="true"` (already done in most places) AND the badge has adjacent visible text of the origin name (for sighted color-blind users who can't distinguish emoji cleanly). Reconcile DESIGN-BRIEF §2 to match.
