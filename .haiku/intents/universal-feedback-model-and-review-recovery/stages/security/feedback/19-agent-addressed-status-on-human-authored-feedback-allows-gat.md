---
title: >-
  agent "addressed" status on human-authored feedback allows gate pass in
  auto-gate stages without second mitigation layer
status: closed
origin: adversarial-review
author: mitigation-effectiveness
author_type: agent
created_at: '2026-04-24T14:43:25Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-19:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
integrator_attempts: 3
---

**Threat:** Agents can call `haiku_feedback_update` to set `status: "addressed"` on human-authored feedback items. The `updateFeedbackFile` guard only blocks agents from setting `status: "closed"` on human-authored items (state-tools.ts:2243-2252). The `addressed` status is not blocked. Since `countPendingFeedback` counts only items where `status === "pending"` (not `addressed`), an agent marking human feedback as `addressed` causes the gate to open, allowing stage advancement without any human action.

**What the threat model says:** The expanded threat model (threat-model-expanded.md, E2) acknowledges this as a "MEDIUM residual risk" and states: "Human gate (`ask`/`external`) is the verification backstop. Auto-gate stages processing human feedback are lower-trust by design."

**Why this fails the defense-in-depth check:**
The claimed mitigation is: "The human gate (`ask`/`external`) is the verification backstop." But this is not an additional *mitigation* layer — it is a *design assumption*. For the defense-in-depth claim to hold, every stage that can receive human-authored feedback MUST use `ask` or `external` gate. There is no enforcement of this invariant anywhere in the codebase. Specifically:
1. Stages can be configured with `review: auto` and still receive human-authored feedback (via the HTTP review UI).
2. Nothing in the orchestrator, STAGE.md validation, or gate resolution prevents human-authored feedback from landing on an `auto`-gate stage.
3. The `countPendingFeedback` function treats `addressed` items as resolved — a single agent call unblocks the gate.

**Root cause not addressed:** The root cause is that `addressed` has gate-clearing semantics equivalent to `closed` when the gate type is `auto`. The mitigation addresses "agents cannot fully close human findings," but the symptom (gate advancement without human sign-off) can still occur via `addressed`. A second mitigation layer would be: for items with `author_type: "human"`, `countPendingFeedback` should treat `addressed` as still-pending unless `callerContext === "human"` performed the status update, OR the gate type forces human review.

**File references:**
- `packages/haiku/src/state-tools.ts:2243-2252` — blocks `closed` but not `addressed` for human-authored items
- `packages/haiku/src/state-tools.ts:3351-3357` — `countPendingFeedback` only checks `status === "pending"`
- `packages/haiku/src/orchestrator.ts` — gate resolution reads `countPendingFeedback` result; auto-gate advances if count === 0
