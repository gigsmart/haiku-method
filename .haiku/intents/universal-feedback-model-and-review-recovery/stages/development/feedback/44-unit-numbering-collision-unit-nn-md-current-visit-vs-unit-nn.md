---
title: >-
  Unit-numbering collision: unit-NN.md (current visit) vs unit-NN-*.md (older
  visit) refer to different work
status: pending
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:23:58Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

## Gap

`stages/development/artifacts/` contains two parallel, incompatible notions of "unit N":

- **Current visit (unit.md files):** `unit-04-design-token-system.md`, `unit-06-shell-and-routing.md`, `unit-07-review-page-desktop-and-mobile.md`, `unit-08-feedback-components.md`.
- **Earlier bolts (artifact notes):** `unit-04-gate-feedback-check.md`, `unit-06-enforce-iteration-fix.md`, `unit-07-external-review-detection.md`, `unit-08-implementation.md`.

Both series live under `stages/development/`. The same ID (unit-04) means "design-token-system" in `units/` and "gate-feedback-check" in `artifacts/`. `unit-04-tactical-plan.md` was written against the UI meaning; the older `unit-04-gate-feedback-check.md` is a free-form implementation note against a different concept of unit 04.

## Why this is a completeness finding

The mandate requires "acceptance criteria are specific enough to write tests against — no subjective judgments." A downstream reviewer or test author following `knowledge/IMPLEMENTATION-MAP.md → stages/development/units/unit-04` gets the design-token spec and will never land on gate-feedback-check behavior. The stage's artifact namespace is ambiguous: which "unit-04" does `test-baseline.json`'s "gate handler rolls to elaborate when pending feedback exists" test belong to? The answer is "the old unit-04" but nothing in the artifact set says so.

## Required remedy

Either (a) rename the older artifact notes to reflect their actual identity (e.g., `legacy-gate-feedback-check.md`) and add a stage-level index mapping each legacy area to the proper current-visit unit that exercises its regression surface, or (b) promote each legacy note into a current unit file (see related finding on core-backend coverage).

## Evidence

```
$ ls stages/development/artifacts/unit-06*
unit-06-enforce-iteration-fix.md   # legacy note, "Enforce-Iteration Auto-Completion Fix"
unit-06-tactical-plan.md           # current, Shell and routing refactor

$ ls stages/development/units/unit-06-*
unit-06-shell-and-routing.md       # current
```

No file in this stage disambiguates the overlap.

