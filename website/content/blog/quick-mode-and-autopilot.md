---
title: "Quick Mode and Autopilot"
description: "Two new operating modes for H·AI·K·U — quick mode for trivial tasks with full hat discipline, and autopilot for autonomous feature delivery with strategic human checkpoints."
date: 2026-03-31
author: The Bushido Collective
---

In [Dark Factories and the Loop](/blog/dark-factories-and-the-loop), we argued that autonomy is a knob, not an architecture. The same harness, the same hats, the same backpressure — you just choose how much you are watching. That was the principle. This week, we shipped the two ends of that knob.

**Quick mode** handles trivial tasks with full hat discipline. **Autopilot** handles autonomous feature delivery with strategic human checkpoints. Together with the existing `/elaborate` and `/execute` manual flow, H·AI·K·U now covers the full spectrum from 30-second fixes to unattended multi-unit builds.

## The Problem with the Old `/quick`

The original `/quick` skill was a bypass. It skipped hats, skipped the planner/builder/reviewer cycle, skipped workflows entirely. The pitch was speed: for trivial changes, why run the full machinery?

The answer turned out to be: because the machinery is what makes the output good.

Even a one-file typo fix benefits from a reviewer hat catching an adjacent issue. Even a config change benefits from a builder hat that commits atomically. The original `/quick` traded quality for speed, and the tradeoff was not worth it. Users who cared about quality used `/elaborate` for everything, including tasks that took longer to specify than to build.

## Quick Mode, Rebuilt

The new `/quick` accepts an optional workflow name and a task description: `/quick tdd fix the validator`. It reads the hat sequence for that workflow from `workflows.yml` and runs a full in-memory hat loop.

The key design decisions:

**Intelligent routing.** When users describe tasks without a slash command, the system assesses scope using heuristic signals — files touched, nature of the change, whether tests are needed, whether design decisions are involved. It then suggests `/quick` or `/elaborate`. The user always confirms. The system recommends; it does not decide.

**Temporary artifacts.** Quick mode creates a `.haiku/quick/` directory with minimal intent state so the existing hook system can inject hat context. This directory is cleaned up after completion and never committed. The hook infrastructure does not know or care that the task is "quick" — it sees intent state and behaves normally. No special cases, no bypasses.

**Builder/reviewer cycle.** Builder hats produce one commit per cycle. If the reviewer rejects, work loops back to the builder. After three failed cycles, quick mode stops and recommends `/elaborate` — the task was not trivial after all. This is scope detection through execution rather than upfront estimation.

**Pre-delivery review.** Every quick mode PR goes through `/haiku:review` before PR creation. The review skill catches issues locally before external CI or review bots see the work. No shortcuts on the way out.

**Six named workflows.** Default, TDD, adversarial, design, hypothesis, BDD — each with a different hat sequence tuned for a different kind of task. `/quick tdd` runs test-first. `/quick adversarial` adds a skeptical reviewer. `/quick design` includes design consideration. The workflow shapes the discipline; the discipline runs at full strength regardless of task size.

The result: a task that used to bypass all quality infrastructure now runs through the same hat-based workflow as a multi-unit feature build. It just does it in memory, in one pass, and cleans up after itself.

## Autopilot

At the other end of the spectrum, `/haiku:autopilot <description>` runs the entire H·AI·K·U lifecycle in a single command. Elaborate, plan, execute all units, deliver via PR.

Autopilot operates in AHOTL mode — Autonomous, Human on the Loop. The agent elaborates requirements from the description and the codebase, elaborates into units, executes each unit through the full builder/reviewer cycle, and delivers the result. No clarification questions. No manual approvals per unit. Backpressure quality gates are the primary enforcement mechanism.

But autopilot is not unattended. It pauses at strategic boundaries:

**Scope guardrail.** If elaboration produces more than five units, autopilot stops. It presents options: continue with the current elaboration, drop to manual execution, or re-elaborate with a narrower scope. Five units is the threshold where autonomous execution shifts from "efficient" to "risky" — the blast radius of a bad elaboration grows nonlinearly.

**Blocker escalation.** When a unit hits a blocker that requires human input — an ambiguous requirement, a missing dependency, a design decision the codebase does not answer — autopilot pauses and surfaces it rather than guessing.

**Pre-delivery checkpoint.** Autopilot always pauses before PR creation. The human sees the full scope of changes and confirms delivery. This is the final strategic boundary: the agent did the work, but the human authorizes the handoff.

The design principle is that pauses should correspond to moments where human judgment adds the most value. Not every hat transition. Not every unit boundary. The three moments where getting it wrong has the highest cost: scope, blockers, and delivery.

## The Autonomy Spectrum

The interesting insight is not that these modes exist. It is what they prove about the relationship between discipline and autonomy.

| Aspect | Quick Mode | Manual Flow | Autopilot |
|--------|-----------|-------------|-----------|
| Task size | Trivial (1-2 files) | Any | Full features (multi-unit) |
| Elaboration | None | Full, human-guided | Full, auto-approved |
| Workflow | Single hat loop | Full lifecycle, manual | Full lifecycle, autonomous |
| Human role | Confirms routing | Approves transitions | Strategic boundary review |

Quick mode proves that you can have full hat discipline on a 30-second fix. The planner/builder/reviewer cycle is not overhead that should be skipped for small tasks — it is lightweight enough to run on anything. The cost of discipline approaches zero when the harness handles it.

Autopilot proves that you can have strategic human judgment on a fully autonomous build. You do not need to choose between "human approves everything" and "human approves nothing." The system identifies the three moments where human input matters most and concentrates oversight there.

These are not opposites. They are the same principle — discipline and autonomy are orthogonal axes, not opposing forces — applied at different scales. Quick mode maximizes discipline at minimal scale. Autopilot maximizes autonomy at full scale. Both maintain the quality properties that matter: hat-based role separation, backpressure enforcement, and structured review.

## The Knob in Practice

The dark factory post was a philosophical argument. Quick mode and autopilot make it concrete.

A developer's Monday might look like this: `/quick tdd fix the flaky test` in the morning. `/elaborate` a new API endpoint after standup, then `/execute` each unit with close review because the domain is unfamiliar. `/autopilot add pagination to the list endpoints` after lunch, because the pattern is well-established and the test coverage is strong.

Same tool. Same hats. Same backpressure. Same quality gates. Three different positions on the autonomy knob, chosen based on the work, not the architecture.

The spectrum is not theoretical anymore. It ships.

---

*Built with discipline. Shipped with confidence.*
