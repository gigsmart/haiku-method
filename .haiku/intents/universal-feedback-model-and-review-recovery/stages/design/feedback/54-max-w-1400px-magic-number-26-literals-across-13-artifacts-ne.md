---
title: 'max-w-[1400px] magic number: 26 literals across 13 artifacts, never tokenized'
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:53:49Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-10 gate line 159 requires: `max-w-[1400px]` either removed from all artifacts OR added to DESIGN-TOKENS.md as a named layout token referenced uniformly.

Neither happened. Grep shows **26 raw literal `max-w-[1400px]` occurrences across 13 files**:
- `feedback-card-states.html`: 2
- `feedback-inline-desktop.html`: 2
- `comment-to-feedback-flow.html`: 3
- `rollback-reason-banner.html`: 5
- `review-flow-with-feedback-assessor.html`: 2
- `comments-list-with-agent-toggle.html`: 2
- `assessor-summary-card.html`: 2
- `revisit-unit-list.html`: 2
- `feedback-lifecycle-transitions.html`: 2
- `stage-progress-strip.html`: 1
- `revisit-modal-spec.html`: 1
- `review-context-header.html`: 1
- `review-package-structure.html`: 1

unit-10 reviewer's own bolt-2 rejection explicitly flagged this (unit-10 lines 103-105): "DESIGN-TOKENS §8.2 line 595 falsely claims artifacts use `var(--layout-max-width)` — 22 literal `max-w-[1400px]` occurrences remain, 0 var refs." After bolt-3 the count grew to 26, and DESIGN-TOKENS.md still lacks a `--layout-max-width` token or a Tailwind-named alternative.

Consistency mandate violation: "all spacing, typography, and color values reference named tokens — no raw hex, px, or magic numbers." `max-w-[1400px]` is a magic-number dimension exactly the mandate forbids.

Fix options (pick one, document decision in DESIGN-TOKENS.md §1.3 and sweep all 26 occurrences):
1. **Token:** add `--layout-max-width: 1400px` to DESIGN-TOKENS.md and define a Tailwind `max-w-page` arbitrary class that references it. Sweep artifacts to `max-w-page`.
2. **Standard Tailwind:** adopt `max-w-screen-2xl` (1536px, closest Tailwind default) or `max-w-7xl` (1280px). Document the choice in DESIGN-BRIEF §4.

Gate command to prove fix: `grep -rE 'max-w-\[1400px\]' stages/design/artifacts/ | wc -l` must equal 0.
