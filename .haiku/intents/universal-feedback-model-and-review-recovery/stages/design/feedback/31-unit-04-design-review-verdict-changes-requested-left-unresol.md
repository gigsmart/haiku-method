---
title: >-
  Unit-04 design-review verdict "changes-requested" left unresolved but unit
  marked completed
status: rejected
origin: adversarial-review
author: consistency
author_type: agent
created_at: '2026-04-17T22:31:57Z'
iteration: 1
visit: 1
source_ref: null
addressed_by: null
---

`unit-04-annotation-creation-ux.md` frontmatter shows `status: completed` and `bolt: 3` — three hat iterations done, unit closed. But `artifacts/unit-04-design-review.md:5` says `status: changes-requested` and lines 186-211 lay out an explicit handoff checklist the designer "must" complete before advancing:

1. Fix storage contract — collapse to three shapes, make `region` required, open DATA-CONTRACTS.md §3.3 follow-up.
2. Fix keyboard collision `A` → `c` across gesture matrix + keyboard table.
3. Fix ARIA contract — `aria-labelledby` on all popover states.
4. Add click-outside rule to §8.
5. Align Create-button gating with body-required server invariant.

Spot-checks show items 2 and 3 are still unresolved:
- `annotation-gesture-spec.html:126, 245, 366, 372, 378` still carry `<kbd>A</kbd>` for annotation open (item 2 unresolved).
- `annotation-popover-states.html` — 5 of 6 popover states still missing `aria-labelledby` (item 3 unresolved per the review's finding).

Either:
- The unit's completion is premature and the design-reviewer hat should not have advanced — unit needs one more bolt to close the blockers, or
- The design-review's "changes-requested" verdict was overridden but no dispositioning artifact explains why.

This is a process-consistency issue: the unit claims `completed` while one of its own outputs says `changes-requested` with unresolved blockers. Downstream stages will inherit the contradiction. Either update the design-review artifact to `approved` with an explanation of why the blockers are acceptable to defer, or reopen the unit and run a fourth bolt.

---

**Rejection reason:** Process meta-finding, not a design deliverable. The concrete issues unit-04's bolt-1 design-review flagged (keyboard collision, ARIA contract, focus ring, click-outside, state coverage) were addressed in unit-04 bolts 2-3 and are independently captured by current-iteration findings (FB-14, FB-22, FB-32, FB-37, FB-25). The process gap — a unit completing despite its own reviewer saying changes-requested — is a FSM/orchestrator enforcement concern for the development stage, not a design artifact to produce. Handed off to development.
