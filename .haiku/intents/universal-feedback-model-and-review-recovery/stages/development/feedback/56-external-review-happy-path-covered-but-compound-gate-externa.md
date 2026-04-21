---
title: >-
  External-review happy-path covered, but compound gate [external, ask] +
  changes-requested pathway has no unit criteria
status: fixing
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:24:54Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Gap

`features/external-review-feedback.feature:138` declares: "External gate with compound type [external, ask] and changes-requested". The implementation-notes file `stages/development/artifacts/unit-07-external-review-detection.md` describes the `checkExternalState` helper and basic GitHub/GitLab integration, but:

- It does not describe how a compound `review: [external, ask]` gate resolves when the external provider reports changes-requested. Does the ask-gate fire next? Does the feedback file block it? Is the user presented with a local-approval option on top of the external changes-requested summary?
- No current-visit unit file references the compound-gate path.
- `knowledge/DATA-CONTRACTS.md` covers single-gate types but does not enumerate the state machine for compound review arrays.

## Why this is a completeness finding

The mandate: "every user-facing flow has defined happy path, error states, and edge cases." A user who configures `review: [external, ask]` in STAGE.md is making a supported choice per CLAUDE.md's terminology table (compound gates documented there). The behavioral spec for how the new pending-feedback-blocks-gate machinery interacts with that choice is undefined. Two behaviors are consistent with the partial specs: (a) pending feedback rolls to elaborate regardless of gate type (feature:138 implies this), (b) compound `ask` lets the local human override the pending-feedback block (implementation could plausibly do this).

## Required remedy

Extend `features/external-review-feedback.feature:138` with explicit Given/When/Then for the 2-3 sub-cases (changes-requested on external, ask approves; changes-requested on external, ask rejects; feedback pending while external=approved, ask=approves). Add unit criteria covering the compound-gate resolution path in a current-visit development unit, either as a new regression test or extending the legacy `unit-04-gate-feedback-check.md` into a proper unit.
