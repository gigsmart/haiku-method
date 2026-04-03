---
title: "Dark Factories and the Loop"
description: "The dark factory isn't a system you build. It's a knob you turn. AI-DLC treats full autonomy as a point-in-time decision, not an architectural commitment."
date: 2026-02-20
author: The Bushido Collective
---

Dan Shapiro recently published [The Five Levels](https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/), a framework for understanding how teams adopt AI in software development. Modeled after NHTSA's driving automation levels, it maps a progression from Level 0 (spicy autocomplete) through Level 5 (the dark factory). Around the same time, StrongDM [went public](https://www.strongdm.com/blog/the-strongdm-software-factory-building-software-with-ai) with their Software Factory — a system where no human writes code and no human reviews code.

The conversation is moving fast. But it's missing something important.

## The Five Levels, Quickly

| Level | Name                  | The Human Is...                     |
| ----- | --------------------- | ----------------------------------- |
| 0     | Manual Labor          | Writing code, AI suggests           |
| 1     | Discrete Tasks        | Delegating bounded tasks            |
| 2     | Collaborative Pairing | Pair programming with AI            |
| 3     | Human-in-the-Loop     | Reviewing diffs, managing AI output |
| 4     | Specification-to-Code | Writing specs, checking results     |
| 5     | Dark Factory          | Gone. Specs in, software out        |

Shapiro's insight is sharp: each level requires a **role change**, not just a tool upgrade. Going from Level 2 to Level 3, you stop being a coder and become a reviewer. Going from Level 3 to Level 4, you stop being a reviewer and become a product manager. Going to Level 5, you step out entirely.

Most teams are stuck at Level 2 and don't know it. As Shapiro puts it: "Level 2, and every level after it, *feels* like you are done. But you are not done."

## The StrongDM Approach

StrongDM's Software Factory is the most public example of Level 5. Three engineers. No human code writing. No human code review. Their system:

- **Attractor** — A non-interactive agent that takes markdown specs and produces code
- **Scenario-based validation** — Behavioral tests with probabilistic "satisfaction" scores replacing code review
- **Digital Twin Universe** — Behavioral clones of third-party services (Okta, Jira, Slack) for integration testing

It works. For StrongDM. But it has a fundamental characteristic worth examining: **darkness is the architecture**. The entire system assumes humans are not in the loop. If you want oversight mid-process, you fight the system. If you want to intervene on a unit of work, you're reaching into a black box.

This is the bookend model. Humans at the front cover (write the spec) and maybe at the back cover (accept the output). Everything between is sealed.

## Humans on the Loop

AI-DLC takes a different position.

In AI-DLC, **humans don't write code either**. That's the same as StrongDM. The AI plans, builds, and reviews. Backpressure — tests, linting, type checks — enforces quality automatically. Completion criteria define done. The agent works through hat-based workflows (planner, builder, reviewer) autonomously.

The difference is where the human *can* exist.

AI-DLC is built for **humans on the loop**. The architecture supports observation and intervention at every boundary — between hats, between units, between iterations. But none of it is required. You can:

- **Watch every decision** — Run in plan mode, approve each hat transition
- **Observe passively** — Let it run, step in when something looks wrong
- **Walk away entirely** — Full autonomy, backpressure and completion criteria are the only guardrails

The dark factory isn't a system you build. It's a knob you turn.

Same methodology. Same backpressure. Same completion criteria. Same hat workflows. You just choose how much you're watching. And that choice can change per-session, per-intent, or even mid-construction.

## Why This Matters

The five levels framework implies a ladder. You climb from Level 2 to Level 3 to Level 4 to Level 5, and Level 5 is the destination. But that framing assumes every task deserves the same level of autonomy.

It doesn't.

A routine refactor of a well-tested module? Let it run dark. A security-sensitive authentication change? Maybe you want to review the plan before the agent builds. A greenfield feature in an unfamiliar domain? You might want to watch the first iteration closely, then let go once the pattern is established.

The level isn't a property of the team. It's a property of the moment.

StrongDM architecturally committed to one point on the spectrum. That's a valid choice for their context — a mature product with known domains, strong behavioral test infrastructure, and a team that has internalized the patterns. But it's a commitment. You can't easily dial it back for a piece of work that needs more oversight.

AI-DLC lets you slide freely along the entire spectrum without changing your tools, your process, or your artifacts. The same intent file, the same unit specs, the same completion criteria, the same hat workflow — whether a human is watching or not.

## The Paradigm Shift

A bigger change is underway than any framework of levels can capture. Our roles as software developers are fundamentally changing.

The five levels describe *what humans stop doing* — writing code, reviewing code, managing implementation, and finally, watching at all. But they don't describe **what humans start doing**. And that's where the real shift lives.

**Spec-driven development is the future.** Not "specs as documentation" — specs as the primary creative artifact. The intent, the completion criteria, the domain model, the non-functional requirements, the risk analysis, the cross-cutting concerns. This is where human judgment, creativity, and domain expertise concentrate. The spec isn't paperwork before the real work. The spec *is* the work.

But here's what the dark factory framing gets wrong: it treats this as purely transactional. Spec in, software out. A black box. And when the black box is sealed, something critical is lost.

**Humans stop learning.**

If you write a spec, hand it to a factory, and get back a result — you never see how the problem was decomposed. You never watch an approach fail and get reworked. You never develop intuition about why certain architectural decisions lead to better outcomes. You never build the experience that makes your *next* spec better.

Spec in, spec out is a dead end for human growth. You become a better spec writer by watching specs become software — by observing which criteria were easy to satisfy and which were ambiguous, by seeing where units interacted in unexpected ways, by noticing when your domain model didn't match reality.

This is the case for **staying on the loop**. Not because the agents need you — with good backpressure and clear criteria, they often don't. But because *you* need the loop. Human creativity and domain expertise aren't static resources you bring to the table once and walk away. They grow through engagement. They atrophy through disuse.

The on-the-loop model lets agents do the heavy lifting — planning, building, reviewing, testing — while humans remain engaged enough to learn, to develop intuition, and to bring sharper judgment to the next intent. You're not slowing the process down by watching. You're investing in the quality of your future specifications.

The dark factory is a capability, not a destination. Use it when the work is routine and well-understood. Stay on the loop when the work is novel, when the domain is complex, or when you simply want to get better at what you do.

## What the Future Looks Like

The conversation about dark factories tends toward a binary: either you're running one or you're not. We think that's wrong.

The future isn't dark factories vs. human-supervised development. It's **adaptive autonomy** — systems that support the full range, from tight human oversight to complete darkness, and let you choose based on the work, not the architecture.

Here's what we see coming:

**Specification is the new implementation.** As implementation becomes automated, the ability to precisely describe *what should exist* — with clear completion criteria, non-functional requirements, risk analysis, and cross-cutting concerns — becomes the highest-leverage skill. This isn't a demotion from "real engineering." It's the recognition that the hard part of software was never typing the code. AI-DLC's elaboration phase exists precisely because of this: specification is hard enough to deserve its own structured, collaborative process.

**Backpressure replaces review.** Code review is a human bottleneck that StrongDM correctly identified as eliminable. But the replacement isn't "trust the AI" — it's automated quality gates that block progress until satisfied. Tests, linting, type checks, security scans. The AI learns to satisfy these constraints not because a process document says to, but because the system won't let it proceed otherwise. This is backpressure, and it works at every level of autonomy.

**Context resets become a feature.** StrongDM built cxdb — an entire database for conversation histories — to solve the context window problem. AI-DLC takes the opposite approach: embrace context resets. Store state in files (intent, criteria, scratchpad, iteration state), inject it at session start, work in deliberate iterations. No custom infrastructure. The repo *is* the memory.

**Teams of agents, not monolithic agents.** A single agent with a massive context window will always lose to a team of focused agents with clean contexts. AI-DLC's construction loop already breaks work into units with independent worktrees. With Agent Teams support, each unit becomes an independent session with its own context, coordinating through a shared task list. The architecture scales without architectural changes.

**The methodology is the moat, not the tooling.** StrongDM's approach is locked to their custom infrastructure (Attractor, cxdb, Digital Twin Universe). AI-DLC is tool-agnostic markdown files. The methodology — hats, iterations, backpressure, completion criteria, DAG-based unit decomposition — transfers to any AI coding tool. When a better agent arrives, the methodology adapts. The tooling is replaceable. The discipline isn't.

## The Knob, Not the Switch

Level 5 is real. Dark factories produce real software. StrongDM proved it.

But the future isn't a binary choice between "human writes code" and "human disappears." It's a spectrum, and the best systems let you move along it freely.

AI-DLC is that spectrum. Define your intent with rigor. Decompose it into units with clear criteria. Let the agents execute through structured workflows with automated quality gates. Watch closely, or don't. The system works either way.

The dark factory is a point-in-time decision, not an identity.

---

*Built with discipline. Shipped with confidence.*
