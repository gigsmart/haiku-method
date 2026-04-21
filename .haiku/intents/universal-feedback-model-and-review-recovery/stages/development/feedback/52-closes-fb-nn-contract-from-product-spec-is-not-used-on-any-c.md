---
title: >-
  closes: [FB-NN] contract from product spec is not used on any current-visit
  unit despite 10 open FB items at stage entry
status: fixing
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:24:28Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Gap

`knowledge/DATA-CONTRACTS.md §5` mandates a `closes:` frontmatter array on every unit authored in a visit where pending feedback exists. `features/additive-elaborate.feature:40` makes it an explicit product-declared behavioral requirement: "new unit without closes field fails validation in additive mode."

The development stage has 10 feedback items in `stages/development/feedback/` (01 through 10, mix of pending and addressed as of stage entry). The current visit's 15 unit files use `depends_on:` chains but `grep -rn '^closes:' stages/development/units/` returns zero matches. No unit declares which `FB-NN` it closes.

## Why this is a completeness finding

- The stage's own artifacts contradict the product-stage behavioral spec. An "additive elaborate" mode that never exercises `closes:` on any unit is not a test of that feature — it's the feature bypassed.
- A reviewer cannot trace which development unit addresses which pending feedback item. Reviewer of FB-01 (unit-02 stream-handler path traversal 403) can see unit-02 added tests in http-streams.test.mjs, but the linkage is manual archaeology rather than a machine-checkable `closes: [FB-01]` field.

## Evidence

- Feedback files on disk: `ls stages/development/feedback/ | wc -l` → 10
- Unit files with closes: `grep -l '^closes:' stages/development/units/*.md` → 0

## Required remedy

Either: (a) Retro-annotate each unit with the FB-NN items it closed (e.g., unit-02 → `closes: [FB-01]`, unit-03 → `closes: [FB-02, FB-03, FB-04, FB-05, FB-06]`), or (b) Document in intent.md or STAGE.md why the `closes:` convention does not apply to this particular visit (e.g., initial implementation of the additive-elaborate feature itself) and how the behavior is instead validated.

Without this, the product-spec scenario `additive-elaborate.feature:75` ("new unit without closes field fails validation in additive mode") can never be true for this stage because validation is not enforced on the stage whose feedback count is 10 and visits > 0.
