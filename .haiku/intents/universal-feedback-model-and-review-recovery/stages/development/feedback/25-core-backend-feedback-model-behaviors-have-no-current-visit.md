---
title: >-
  Core backend feedback-model behaviors have no current-visit unit; coverage
  claim is unverifiable
status: pending
origin: adversarial-review
author: completeness (from product)
author_type: agent
created_at: '2026-04-21T20:23:02Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

## Summary

The product stage's source-of-truth specs enumerate six backend-core feature files: `feedback-crud.feature` (36 scenarios), `enforce-iteration-fix.feature` (16), `auto-revisit.feature` (20), `additive-elaborate.feature` (16), `external-review-feedback.feature` (16), `revisit-with-reasons.feature` (18) — 122 scenarios total. The current stage's 15 units (`stages/development/units/unit-01..15.md`) cover package extraction, design tokens, a11y foundations, per-page UI refactors, and audits. **Zero** of those unit files reference `haiku_feedback`, `enforce-iteration`, `additive-elaborate`, `auto-revisit`, `external-review`, `revisit-with-reasons`, `addressed_by`, feedback rejection, feedback closure, or any behavior from those six feature files.

## Evidence

- `grep -l 'haiku_feedback\|feedback-crud\|enforce-iteration\|additive-elaborate\|auto-revisit\|external-review' stages/development/units/*.md` returns only unit-01 and unit-02, both only in contexts unrelated to the CRUD contract (package-extraction unit listing files shipped + an http test-file name).
- Unit-01 lines 62-64 assert the backend work "already shipped in prior bolts of this intent and is present in `packages/haiku/src/*` today", but no current unit in this visit contains a regression gate that would prove the prior work still behaves as the product specs require.
- Older implementation-notes files under `stages/development/artifacts/` (`unit-02-crud-companion-tools.md`, `unit-04-gate-feedback-check.md`, `unit-05-orchestrator-integration.md`, `unit-06-enforce-iteration-fix.md`, `unit-07-external-review-detection.md`, `unit-08-implementation.md`) are **plain summary docs** — no frontmatter, no status/hat/bolt, no completion criteria, no quality gates. They are not units; they cannot be reviewed against product-stage contracts with the stage's normal gate machinery.

## Why this is a completeness (from product) finding

The completeness mandate requires: "every user-facing flow has defined happy path, error states, and edge cases" and "no feature described in the intent is missing from the behavioral spec." Within the **stage's behavioral spec** (the set of unit.md files + tactical plans that drive implementation and review in this visit), 122 product-declared scenarios have **no corresponding unit-level completion criteria**. From the stage's artifacts alone a reviewer cannot determine whether the core invariants (gate rollback on pending > 0, visit counter increment, additive-mode frozen units, author-guard on human-authored feedback, enforce-iteration per-stage status, external-review summary-file creation, revisit-with-reasons stopgap) are still met.

## Required remedy

Either (a) add a final regression-gate unit that runs the six feature-file scenario sets as executable tests (e.g., via Cucumber/Vitest parity) against the current codebase and declares APPROVED only if all 122 scenarios pass, or (b) promote each of the six legacy artifact notes into a proper unit with frontmatter + completion criteria + quality gates that re-assert the product-stage scenarios.

## Scope

intent-wide. The gap is independent of the UI work shipped in units 01-15.

