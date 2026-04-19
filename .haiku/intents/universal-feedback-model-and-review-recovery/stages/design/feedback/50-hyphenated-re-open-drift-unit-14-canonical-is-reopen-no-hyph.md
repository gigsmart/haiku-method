---
title: >-
  Hyphenated "Re-open" drift: unit-14 canonical is "Reopen" (no hyphen) — ~30
  occurrences remain
status: pending
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-19T17:53:05Z'
iteration: 2
visit: 2
source_ref: null
closed_by: null
---

unit-14 completion criteria line 122 declares canonical copy: `closed/rejected → "Reopen" (one word, no hyphen)`. Line 125 requires a recursive search for the hyphenated spelling in `stages/design/` to return 0 matches in artifact files. Actual count: **~30 occurrences across 4 artifacts + the state-coverage grid itself**.

Affected files:
- `feedback-card-states.html`: 16+ occurrences at lines 52, 57, 62, 126, 145, 164, 182, 201, 285, 304, 323, 341, 360, 458, 557 — rendered buttons and descriptive copy.
- `feedback-lifecycle-transitions.html`: 8+ occurrences at lines 116, 123, 130, 174, 182, 190, 211, 212, 213 — SVG transition labels and list items.
- `review-ui-mockup.html:819, 822` — live-demo buttons rendered as `Re-open`.
- `state-coverage-grid.md:32, 33` — even the state-coverage grid (itself a consistency-audit artifact) uses the hyphenated spelling.
- Even `feedback/34-footer-button-copy-drift...md` lines 29-30 use hyphenated as part of the FB body; that one's fair since it's documenting history.

DESIGN-BRIEF.md uses the un-hyphenated `Reopen` at lines 480, 481, 482, 580, 593 — so the brief disagrees with the wireframes. Dev stage will read conflicting vocabulary.

Consistency mandate violation: "component naming follows the existing pattern language." For action-copy this means one canonical verb + one canonical hyphenation.

Fix: sweep all 30 occurrences of `Re-open` → `Reopen` across the 4 artifacts and state-coverage-grid.md.

Gate command to prove fix: `grep -rn 'Re-open' stages/design/artifacts/ stages/design/units/ stages/design/DESIGN-BRIEF.md | grep -v '^stages/design/feedback/'` must equal 0 (feedback files excluded — they document historical drift).
