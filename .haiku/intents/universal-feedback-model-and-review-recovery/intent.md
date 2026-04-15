---
title: Universal feedback model and review recovery
studio: software
mode: continuous
status: active
created_at: '2026-04-15'
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
---

# Universal feedback model and review recovery

Persist every review-phase finding (adversarial review subagents, external PR/MR comments, user visual review UI comments) as durable feedback files on disk, and use the pending-feedback count as the structural gate that keeps the FSM from advancing review → gate until findings are addressed or explicitly rejected. Introduce a haiku_feedback tool and CRUD companions (update, delete, reject) with author-based guards so agents cannot modify user-authored items or delete pending items to bypass them. Rewrite the elaborate phase to run in additive mode when visits > 0 — existing completed units are read-only and new units must declare closes: [FB-NN] for every pending feedback they claim to address. Fix enforce-iteration so it keys intent completion off per-stage state.json status instead of globbing unit files across stage directories. Two concrete defects motivate this: the cowork-mcp-apps-integration intent wrongly flipping to status: completed mid-development, and adversarial review findings being lost on session restart because they lived only in the parent agent's conversation context. Out of scope for v1: background external poll, review UI auth carrying real user identity, max visits cap per stage, feedback dependency graph.

Design was iterated over a long conversation covering: (1) the cowork-mcp-apps-integration auto-completion bug traced to enforce-iteration.ts:119-131 globbing unit files instead of checking per-stage status, (2) the adversarial-review soft-enforcement gap where findings were only prompt-enforced and lost on session restart, (3) the convergent solution as feedback files being the universal currency of "things to fix" across all sources (adversarial-review, external-pr, external-mr, user-visual, user-chat, agent), (4) the core invariant that review → gate auto-rolls to elaborate when pending feedback exists, (5) haiku_feedback as the single write path for feedback from subagents, parent agent, and orchestrator-internal paths, (6) haiku_revisit gaining optional reasons param as a convenience that internally calls the feedback writer, (7) review-UI incremental persistence of draft comments as the user types (debounced), (8) CRUD surface with author-based guards preventing agents from bypassing user-authored feedback, (9) additive elaborate mode with closes: [FB-NN] on new units as the mechanism that ties feedback resolution to unit completion, (10) external review poll extended to detect changes-requested and route comments to the agent for synthesis, (11) authorship as a flat 'user' literal for v1 since the MCP has no reliable runtime access to human identity. Pedro Garza's separate review-tab-reopening bug was fixed in PR #231 against main, independent of this intent.
