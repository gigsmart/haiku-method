---
title: >-
  Feedback gate enforcement — assessor agent + frontmatter check before user
  gate
status: addressed
origin: user-chat
author: user
author_type: user
created_at: '2026-04-17T05:49:00Z'
visit: 1
source_ref: Jason explicit requirement — hard invariant
addressed_by: unit-08-feedback-assessor-ux-and-flow-diagram
---

## Hard invariant

**No stage is allowed to hit the review gate (user-facing approval) until every pending feedback item has been addressed.** This must be enforced structurally by the FSM, not by prompt instruction to the agent.

## Required FSM flow

When a stage finishes execute (all units complete), the orchestrator MUST walk this exact path before exposing the user gate:

```
execute (units complete)
    ↓
run_next
    ↓
quality gates (typecheck, tests, coverage, build)
    ↓
review agents (adversarial review fan-out)
    ↓   including a MANDATORY auto-injected "feedback-assessor" subagent
    ↓
feedback frontmatter check (structural — all feedback.md status must be terminal)
    ↓
user gate  ← only reached if every preceding step passes
```

If ANY step above fails or is inconclusive, the FSM MUST roll the stage back to the start of that stage's elaborate phase (additive mode, visits++).

## Feedback-assessor agent (NEW)

**Always injected as one of the review-agent subagents** — agents do not opt in, the orchestrator appends it. Its sole responsibilities:

1. Read every `.haiku/intents/{slug}/stages/{stage}/feedback/*.md` file.
2. For each item with `status: pending`, assess whether the current stage's artifacts + committed work actually resolve the concern.
3. On resolution: update the feedback item's frontmatter — set `status: addressed`, fill `addressed_by: unit-NN-xxx` (or `addressed_by: [commit-sha]` for spec-only stages like design), write `addressed_at: ISO-timestamp`.
4. On non-resolution: leave `status: pending` and annotate `addressed_by: null` plus a reason in the body (e.g. `## Assessor note: not addressed — missing spec for annotation creation UX`).
5. Emit a structured summary the orchestrator can parse: total feedback count, still-pending count, items updated.

## Rollback rule

If the feedback-assessor:
- fails to run (error, timeout), OR
- reports any item still `status: pending` after its pass, OR
- cannot write the frontmatter updates (file lock, parse error, missing field),

the orchestrator MUST:
1. Roll phase back to `elaborate`, increment `visits`.
2. Emit an `additive_elaborate` action citing the unresolved feedback by id.
3. Require new units with `closes: [FB-NN]` for each item the assessor couldn't close.

## Frontmatter check (final gate before user)

After review agents complete (including the assessor), the orchestrator MUST re-read all feedback files and refuse to advance to the user gate if ANY item has `status: pending`. This is a belt-and-suspenders check — the assessor should have closed or left-pending, but this check guarantees the FSM never silently advances with open items.

## Non-negotiable

- Agent prompts alone are NOT sufficient. The assessor is a subagent the orchestrator spawns; the frontmatter check is orchestrator code.
- Terminal feedback states are: `addressed`, `closed`, `rejected`. `pending` is the ONLY state that blocks.
- This applies to every stage uniformly, not just the ones the agent remembers.

## Tests required

1. Stage with zero feedback passes straight through to user gate (existing behavior preserved).
2. Stage with one pending feedback + no unit resolves it: assessor leaves pending → FSM rolls back to elaborate → `additive_elaborate` returned.
3. Stage with one pending feedback + a unit that closes it: assessor flips to addressed → frontmatter check passes → user gate opens.
4. Assessor crashes mid-run: FSM rolls back to elaborate (fail-closed), NOT forward to user gate.
5. Assessor writes invalid frontmatter: orchestrator refuses the change and rolls back.

## Architecture diagram sync (MANDATORY)

Per `.claude/rules/architecture-prototype-sync.md`, any change to the phase model or review-agent fan-out is a sync surface. When this spec is implemented in the development stage, the following MUST be updated in the same PR:

1. **`website/public/prototype-stage-flow.html`** — the interactive runtime-architecture map:
   - Add the feedback-assessor to the per-stage review-agents block (auto-injected, not declared in `stages/{stage}/review-agents/`).
   - Insert a new phase-transition arrow: `review` → `feedback_frontmatter_check` → `gate`.
   - Add the rollback edge: `feedback_frontmatter_check` (failed) → `elaborate` (with `visits++` annotation).
   - Update `payloadFor(...)` registry for the new transition ids (`review-to-feedback-check`, `feedback-check-to-gate`, `feedback-check-to-elaborate-rollback`).
   - Rerun `node website/_build-prototype-content.mjs` so the bundled studio-content sidecar picks up the assessor review-agent definition.

2. **`website/content/papers/haiku-method.md`** — the methodology paper:
   - Under "Quality Enforcement" (or equivalent) document the hard invariant: user gate unreachable with any `status: pending` feedback.
   - Under "Review Agents" add the mandatory feedback-assessor with its contract (read + update + report).
   - Document the rollback semantics as a first-class FSM transition, not an agent-prompt nicety.

3. **Any stage-level `phases/review.md` overrides** — if studios override the review phase, they inherit the mandatory assessor injection; overrides cannot disable it.

4. **Memory** — update `project_review_stage_feedback_model.md` with the flow diagram change.

**Design stage deliverable:** a diagram artifact (`artifacts/review-flow-with-feedback-assessor.html`) that visualizes the new flow — this is the reference the development stage will port into `prototype-stage-flow.html`.
