---
title: >-
  Closed/rejected cards still apply opacity-70 / opacity-50 to entire card —
  WCAG 1.4.3 fail + FB-13 regression
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:52:10Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 1.4.3 (AA)** compounds with opacity on already-muted text. Unit-11's quality gate required `grep -rEn 'opacity-(50|70)' stages/design/artifacts/` on closed/rejected card selectors to return 0; it claims PASS.

**Reality (on HEAD):**
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:321` — `<div … border-l-green-400 … opacity-70">` (closed card root — exact FB-13 anti-pattern)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:337` — `<div … border-l-gray-300 … opacity-50">` (rejected card root)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-desktop.html:466` — closed card in another section still `opacity-70`
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-inline-mobile.html:274` — `<div … border-l-green-400 … touch-target opacity-70">` (closed mobile card)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/annotation-popover-states.html:394` — `bg-teal-600 text-white opacity-50 cursor-not-allowed` (disabled Create button composing opacity with text-white — exact FB-19 anti-pattern)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/feedback-card-states.html:15` — `.state-disabled button { opacity: 0.5; }` (CSS rule applied to every rendered disabled button in this canonical inventory artifact)

**Impact:** Under 70% opacity, `text-gray-500` (which is already near 4.5:1) drops to ~3.1:1 — below WCAG AA for body text. Reviewers with low vision cannot read closed/rejected feedback. Because this is also FB-13 (already logged as a blocker in the pre-existing feedback set), reintroducing it is a regression.

**Fix:** Per unit-11 scope — closed state = green left-border + muted green background + "Closed" badge; rejected state = stone-500 full-opacity title with `line-through decoration-stone-500` + "Rejected" badge + prefix in metadata. No opacity on the card root. For disabled buttons, opaque token pairs (e.g. `bg-stone-200 text-stone-700` ≥ 4.5:1) — never compose opacity with text color.
