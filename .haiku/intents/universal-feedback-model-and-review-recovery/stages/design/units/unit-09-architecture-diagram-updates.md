---
title: Architecture diagram updates for new FSM concepts
type: design
closes: [FB-05, FB-06, FB-08, FB-09]
depends_on:
  - unit-08-feedback-assessor-ux-and-flow-diagram
inputs:
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/05-haiku-revisit-must-fully-reset-stage-and-uncomplete-intent.md
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/06-revisit-plus-additive-elaborate-end-to-end-broken.md
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/08-visits-should-be-iterations-array-with-timestamps.md
  - .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/09-post-elab-gate-predicate-no-separate-additive-state.md
  - .claude/rules/architecture-prototype-sync.md
  - website/public/prototype-stage-flow.html
outputs:
  - stages/design/artifacts/architecture-diagram-diff-spec.md
  - stages/design/artifacts/iteration-timeline-ui.html
---

# Architecture diagram updates for new FSM concepts

## Goal

Design is not responsible for the FSM code, schema, or tool signatures behind FB-05 / FB-06 / FB-08 / FB-09 — those belong to product + development. Design IS responsible for keeping the canonical architecture diagram (`website/public/prototype-stage-flow.html`) and its surrounding documentation (paper glossary, CLAUDE.md terminology, studio content sidecar) in sync with the methodology changes these feedback items introduce, per `.claude/rules/architecture-prototype-sync.md`.

This unit produces a **diagram-diff specification** that the development stage uses to update the prototype + paper + CLAUDE.md in one coordinated sync pass, plus a **UI mock for the iteration-timeline rendering** that appears on the stage banner.

## Scope — what this unit covers

- Revisit atomicity (FB-05, FB-06): the prototype must show revisit as a single atomic transition that resets the target stage AND uncompletes the intent. New edge labels + annotations.
- Iteration timeline (FB-08): rename `visits: N` → `iterations: IterationRecord[]`. The prototype's state-write visualization and the review UI's stage banner both surface the timeline.
- Gate-predicate model (FB-09): the prototype must visualize the post-elab predicate (`pending_feedback > 0 && uncompleted_units == 0` blocks advancement) rather than showing `additive_elaborate` as a separate node. Collapse the split-path visualization into a single `elaborate` node with a gate annotation.

**Out of scope** (explicitly — these belong elsewhere):
- Orchestrator TypeScript code for revisit atomicity or gate predicate → product/development.
- `state.json` schema migration or the `iterations[]` hydration shim implementation → product/development.
- `haiku_feedback` tool's `message is required` bug fix → product/development.
- Binary build CI enforcement (so source changes can't land without the compiled binary) → operations.

## Quality Gates

- **Architecture-diagram-diff spec** (`architecture-diagram-diff-spec.md`) produced, enumerating exactly what the development stage must change in `website/public/prototype-stage-flow.html`:
  - Nodes to add / remove / relabel (e.g. remove `additive_elaborate`, re-annotate `elaborate` with the gate predicate).
  - Edges to add / remove / relabel (e.g. new revisit edge atomicity annotation; iteration-bump edge).
  - `payloadFor(...)` registry entries to update (e.g. `revisit-from-X-to-Y` now carries `{ iterations[++n].started_at, uncompleteIntent: true }`).
  - `HOOKS` / `STAGES` / `ACTORS` registry updates if any new actors appear (none expected for FB-05/06/08/09 alone; FB-07's feedback-assessor is owned by unit-08).
  - Any studio-content-sidecar rebuild required (`node website/_build-prototype-content.mjs`).
- **Iteration-timeline UI mock** (`iteration-timeline-ui.html`) produced showing how the stage banner renders the iteration list — e.g. *"Iteration 2 of 2 · started 2026-04-16 21:04"* with a hover tooltip showing each record's `outcome`, `triggered_by`, and `feedback_scope`.
- **Paper + CLAUDE.md update spec** listed in the diff-spec file: which sections of `website/content/papers/haiku-method.md` and which rows of `CLAUDE.md`'s terminology table get updated (add `Iteration` at the stage level; remove legacy mentions of `additive_elaborate` as a distinct state).
- **Non-goal section** in the diff-spec is explicit and complete. Anyone reading this unit's output cannot confuse "design owns the diagram and docs update" with "design owns the FSM rewrite."
- **Product hand-off list** enumerates every non-design concern this intent still needs: revisit atomicity (code), uncomplete-intent (code), `haiku_feedback` `message is required` bug, binary-build CI enforcement, `iterations[]` schema + hydration shim, post-elab gate predicate (code), collapse of `additive_elaborate` from the orchestrator (code — already partially done in-flight).

## Completion Signal

The development stage can open the diff-spec and make every listed change to `prototype-stage-flow.html`, `paper`, and `CLAUDE.md` without further design input. The iteration-timeline mock is hand-off-ready for the review-UI work stream.
