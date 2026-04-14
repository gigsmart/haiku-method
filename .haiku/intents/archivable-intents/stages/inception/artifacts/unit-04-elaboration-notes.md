---
unit: unit-04-prototype-runtime-map-sync
hat: elaborator
date: 2026-04-14
---

# Unit 04 Elaboration Notes

## What changed in the spec
- Replaced vague "register in TOOL_SPECS" wording with exact line-number anchors from research-notes.md.
- Pinned insertion point for new entries: immediately after `haiku_intent_reset` (line 4646), preserving `haiku_intent_*` grouping.
- Added explicit instruction to drop the `confirm` guard (archive is reversible, unlike reset).
- Added `haiku_run_next` amendment task (lines 4605 – 4615) scoped to description + writes only. Explicit "no new `payloadFor` map key" — no clickable chip exists to attach it to.
- Pinned Orchestrator modal insertion line 4025 under `**FSM drivers**` (not state tools — these are lifecycle mutations).
- Added tool-count bump `27 → 29` on line 4011 as a first-class success criterion.
- Explicit "DO NOT run `node website/_build-prototype-content.mjs`" — tool-spec additions never require a sidecar rebuild.
- Added `model: sonnet` — coordinated multi-file edits following a known pattern, no architectural decisions.

## Dependency
Blocked on unit-02 landing the actual `haiku_intent_archive` / `haiku_intent_unarchive` surface in `packages/haiku/src/state-tools.ts`. Unit-02 shows `completed` in the status table, so this unit is unblocked.

## Why sonnet, not haiku
More than pure copy-paste: the developer must choose grouping (FSM drivers vs state tools), amend `haiku_run_next` description prose, and keep the prototype consistent with orchestrator code (sync-rule ground-truth clause). Judgment calls exist, so sonnet is the right tier. Not opus — no architectural decisions, the insertion points and shapes are fully pinned.

## Out-of-scope clarifications
- No `payloadFor` map key for archived refusal. Unreachable UI — not worth the edit.
- No website docs (unit-05 owns that).
- No plugin edits (unit-02 owns, done).
- No sidecar rebuild.
