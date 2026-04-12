---
title: "H·AI·K·U Is a Harness"
description: "Anthropic's engineering blog defines 'harness' as orchestration scaffolding for long-running AI agent work. H·AI·K·U fits that definition — and extends it."
date: 2026-03-29
---

Anthropic's engineering team recently published [Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps), a detailed account of building multi-agent orchestration systems for complex, sustained AI work. The post introduces the term **harness** to describe the scaffolding that coordinates AI agents through structured phases, manages context across long-running tasks, and encodes assumptions about what models cannot do alone.

Reading it felt like finding a name for something we had already built.

H·AI·K·U is a harness. Understanding it as one clarifies what it does, why it works, and where it is going.

## What Is a Harness?

The Anthropic post describes a harness as a multi-agent orchestration system that decomposes complex work into specialized roles working in concert. Rather than asking a single model to handle everything end-to-end, a harness assigns distinct responsibilities to separate agents — a planner that transforms brief prompts into comprehensive specifications, a generator that executes the work, and an evaluator that assesses quality using concrete criteria and external tools.

Several design principles emerge from their experience:

**File-based communication for inter-agent handoffs.** Agents communicate asynchronously through structured files rather than direct conversation. One agent writes a file; the next reads it and responds. This eliminates synchronous coordination overhead and creates persistent artifacts that any agent can reference.

**Generator-evaluator feedback loops.** The post's core insight: "separating the agent doing the work from the agent judging it proves to be a strong lever." Self-evaluation fails because models tend to praise their own outputs. A separate evaluator, tuned to be skeptical, provides concrete feedback that drives iterative improvement across multiple cycles.

**Context resets with structured handoffs.** Rather than compacting context by summarizing earlier content in place, the harness clears the window entirely and starts fresh. This solves two problems: models lose coherence on lengthy tasks, and they exhibit what the authors call "context anxiety" — prematurely wrapping up work as they approach their perceived context limit. Resets provide a clean slate, but require handoff artifacts with enough state for the next agent to pick up seamlessly.

**The assumption principle.** This is the post's most portable insight: "Every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions are worth stress testing." Each piece of orchestration scaffolding exists because the model failed without it. But model capabilities change. When Opus 4.6 arrived with improvements in planning, long-context tasks, and self-correction, the authors methodically removed components that were essential for Opus 4.5 — including sprint-based decomposition, which the newer model could handle in longer coherent sequences. The evaluator shifted from per-sprint passes to final-stage validation. The harness got simpler because the model got better.

The practice they recommend: remove one component at a time and measure impact, rather than radical restructuring.

## The Mapping

H·AI·K·U and Anthropic's harnesses occupy the same design space. The concepts map directly:

| Harness Concept (Anthropic) | H·AI·K·U Equivalent |
|---|---|
| Specialized agent roles (planner, generator, evaluator) | Hat-based workflow (planner, builder, reviewer) |
| File-based inter-agent communication | Intent specs, unit specs, operational plans as file artifacts |
| Generator-evaluator feedback loops | Operation, review, fail/advance cycle (bolts) |
| External evaluation driving quality | Backpressure hooks, completion criteria, Stop gates |
| Context resets with structured handoffs | `/haiku:pickup` skill that reconstructs ephemeral state from file artifacts |
| "Every component encodes an assumption" | Each hat and phase encodes a guardrail |
| Harness complexity should decrease with model capability | Regular reassessment of which scaffolding remains necessary |

The vocabulary differs. The architecture rhymes.

H·AI·K·U's hats are Anthropic's specialized agent roles. Both systems assign distinct responsibilities — planning, generating, evaluating — to separate modes of operation rather than letting a single undifferentiated agent try to do everything at once. H·AI·K·U's file artifacts (intent specs, unit specs, scratchpads, iteration state) are the same pattern as Anthropic's file-based inter-agent communication: persistent, structured state that survives context boundaries and enables handoffs. The bolt cycle — operate, review, fail or advance — is a generator-evaluator feedback loop with explicit human-visible transitions. And `/haiku:pickup`, which reconstructs ephemeral session state entirely from file artifacts, is a context reset with a structured handoff.

The alignment is not coincidental. These are convergent solutions to the same underlying problem: models cannot sustain complex work across long contexts without external structure.

## Where H·AI·K·U Diverges

The mapping is close, but three differences matter.

### Collaborative, Not Autonomous

The harnesses described in Anthropic's post are autonomous agent-to-agent loops. The generator produces output. The evaluator grades it. The loop repeats. Humans configure the system and review the final result, but the execution between those endpoints is sealed.

H·AI·K·U centers human judgment.

The human wears hats alongside the AI, approves transitions between phases, and can `/haiku:refine` a specification mid-construction or `/haiku:fail` a review to send work back. Three operating modes — HITL (human in the loop), OHOTL (observer, human on the loop), and AHOTL (autonomous, human off the loop) — let teams dial autonomy up or down per intent. The harness *supports* full autonomy but does not *assume* it.

This is a deliberate design choice. As we argued in [Dark Factories and the Loop](/blog/dark-factories-and-the-loop), the dark factory is a knob you turn, not a system you build. Some work deserves full autonomy. Some work deserves close oversight. The same harness should support both without architectural changes. A security-sensitive authentication flow and a routine dependency upgrade should not require different tools — just a different setting on the same tool.

Anthropic's harnesses optimize for throughput in autonomous execution. H·AI·K·U optimizes for adaptability across the full autonomy spectrum.

### SDLC-Native Structure

The harnesses in the Anthropic post are task-generic. They built a game maker, a DAW, a website builder. The harness pattern applies to any domain where work can be decomposed into plan-generate-evaluate cycles.

H·AI·K·U is domain-specific. It maps to software development lifecycle concepts: intents are epics, units are tickets, bolts are sprints. This specificity is a feature, not a limitation. It gives the harness leverage that generic orchestration cannot have.

Consider quality evaluation. Anthropic's harness relies on an LLM evaluator to assess output quality — and the post is candid about how much work this requires. Out of the box, evaluators are lenient and test superficially. Achieving rigorous QA demanded iterative prompt refinement based on divergences between model judgments and human assessment. They converted subjective criteria into concrete, gradable standards and found that even specific phrasing (like "museum quality") meaningfully steered outputs.

H·AI·K·U sidesteps much of this problem by encoding software-specific quality gates as backpressure. Tests pass or they do not. Types check or they do not. The linter is clean or it is not. These are not LLM judgments — they are deterministic signals from the development toolchain itself. The model does not need to be convinced that its code is buggy; the test suite tells it directly, and the harness blocks advancement until the gate is satisfied.

This does not eliminate the need for LLM-based evaluation entirely — completion criteria still require judgment about whether the intent has been satisfied. But the deterministic backpressure layer handles the mechanical quality questions, leaving the subjective evaluation layer to focus on higher-order concerns: does this implementation actually solve the problem? Is the API intuitive? Does the architecture make sense?

Domain specificity buys you deterministic quality gates. Generic harnesses have to solve quality evaluation entirely through LLM judgment.

### Plugin Infrastructure, Not Agent SDK

Anthropic's harnesses use the Claude Agent SDK to orchestrate separate agent processes. Each agent is a distinct subprocess with its own context window, coordinated by the harness through file-based communication. The harness is a separate orchestration layer that manages agents externally.

H·AI·K·U uses Claude's plugin system — skills, hooks, and CLAUDE.md rules — to shape behavior *within* a single Claude session (Code or Cowork). Skills provide structured commands (`/haiku:elaborate`, `/haiku:pickup`, `/haiku:refine`). Hooks enforce backpressure at tool-call boundaries. CLAUDE.md rules inject context and constraints that persist across the session. When Agent Teams is enabled, the plugin spawns independent teammates, but the orchestration still flows through plugin primitives rather than a separate SDK layer.

This means the harness *is* the development environment. There is no separate system to install, configure, or maintain. You install a plugin and your Claude session gains structured workflows, quality gates, and context management. The harness lives where the work happens.

The tradeoff is real. The Agent SDK approach gives you more control over agent orchestration — you can run agents in parallel, manage their lifecycle explicitly, and build custom communication protocols. The plugin approach gives you tighter integration with the developer experience — the harness is invisible until you invoke it, and it enhances rather than replaces the normal Claude workflow.

Both are valid architectures. They optimize for different things.

## The Stress-Testing Principle

The post's most transferable insight deserves its own section: every component in a harness encodes an assumption about what the model cannot do alone. When the assumption stops being true, the component becomes overhead.

H·AI·K·U's components encode assumptions too:

- **Separate elaboration from implementation** assumes the model will conflate planning with building if given the chance. Without the enforced separation, it starts writing code in the middle of specification.
- **Mandatory review phase** assumes the model will skip validation if not explicitly told to stop and evaluate. Without the reviewer hat, it declares itself done prematurely.
- **Backpressure hooks** assume the model will cut corners without automated gates. Without Stop hooks on test failures and lint errors, it will "fix later" and never come back.
- **Hat transitions** assume the model loses focus without explicit role switches. Without the transition from builder to reviewer, it reviews its own work while still in builder mode — and finds nothing wrong.

These assumptions were correct when H·AI·K·U was designed. They remain correct today, with current models. But "today" is a moving target.

Anthropic demonstrated this concretely. Sprint-based decomposition was essential scaffolding for Opus 4.5 — without it, the model could not sustain coherent work across large tasks. Opus 4.6 handled longer sequences natively, and the sprint decomposition became unnecessary overhead that actually degraded output quality. Removing it improved results.

The same will happen to H·AI·K·U's components. Some future model may plan and build coherently without an explicit hat transition. Some future model may self-evaluate rigorously without a separate review phase. Some future model may maintain quality standards without backpressure hooks.

When that happens, the correct response is not to defend the scaffolding. It is to remove it, measure the impact, and simplify. The harness should get lighter over time. If it is not getting lighter, either the model has not improved in the relevant dimension, or the team is not stress-testing their assumptions.

The Anthropic post recommends removing one component at a time and measuring. We endorse this approach. H·AI·K·U's modular structure — hats are independent files, hooks are individually configurable, workflows are composable YAML — was designed with exactly this kind of incremental simplification in mind.

## What This Means

Positioning H·AI·K·U as a harness does three things.

**It gives people an immediate mental model.** If you have read Anthropic's post, you know what category H·AI·K·U belongs to. It is orchestration scaffolding for long-running AI agent work. It coordinates specialized roles through structured phases, uses file artifacts for state management, and encodes quality standards as automated gates. You do not need to understand the full methodology to understand what kind of thing it is.

**It clarifies that the scaffolding is intentional and should evolve.** The hats, the phases, the hooks, the transitions — these are not bureaucracy. They are load-bearing structure that compensates for specific, identifiable model limitations. Every component exists because removing it made the output worse. And every component should be re-evaluated as models improve. Understanding H·AI·K·U as a harness makes it clear that simplification is not regression — it is the system working as intended.

**It connects H·AI·K·U to a broader design space.** Anthropic is publishing harness design patterns. Other teams are building their own orchestration systems. The problem of coordinating AI agents through complex, long-running work is not specific to any one tool or methodology. By naming H·AI·K·U as a harness, we join a conversation about what these systems should look like, how they should evolve, and what principles govern their design. The answers matter for everyone building in this space.

H·AI·K·U is a collaborative, SDLC-specialized harness built on Claude's plugin primitives. Understanding it as one is the clearest way to understand what it does — and to know when pieces of it should be simplified away.

---

*Built with discipline. Shipped with confidence.*
