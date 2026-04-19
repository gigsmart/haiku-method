---
title: >-
  Assessor summary card never applies role=status aria-live=polite to the actual
  card root (FB-35 gate not landed)
status: pending
origin: adversarial-review
author: accessibility
author_type: agent
created_at: '2026-04-19T17:55:23Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

**WCAG 4.1.3 Status Messages (AA):** status changes must be announced by AT without focus. Unit-13's gate required `role="status" aria-live="polite"` on the assessor-summary-card root so screen readers pick up "pass clean" / "3 pending" when the assessor finishes.

**Reality on HEAD (`.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/assessor-summary-card.html`):**
- `grep -nE 'role="status"|aria-live'` returns 1 match, line 289 — and it is inside a `<li>` in a documentation/notes section, *describing* what the card "is". The actual card markup never gets these attributes.
- The card containers that should be a live region are untagged — meaning AT will not announce when the assessor's result flips from "running" to "3 pending" to "pass clean." The entire optimistic-UI announce flow unit-13 speced (aria-live-sequencing-spec.md) is unreachable because its anchor attribute was never applied to the DOM.

**Compounding:** `aria-live-sequencing-spec.md` itself is absent from HEAD (exists only in the unit-13 worktree), so dev has no spec to implement.

**Fix:**
1. Add `role="status" aria-live="polite"` to the assessor-summary-card root element in `assessor-summary-card.html` (the outer `<article>`/`<div>` that holds the pass/fail state).
2. Pull `aria-live-sequencing-spec.md` into `.haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/` on HEAD so dev can implement the three-phase announcement template (close, verify, re-open, reject).
3. Add `aria-busy="true"` + inline spinner + `<span class="sr-only">Processing…</span>` to in-flight cards in `feedback-card-states.html` per the FB-26 scope.
