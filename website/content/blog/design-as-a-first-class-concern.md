---
title: "Design as a First-Class Concern"
description: "AI-DLC now includes a design direction system and persistent project knowledge layer, making visual design and domain understanding part of the methodology — not an afterthought."
date: 2026-04-01
author: The Bushido Collective
---

Every AI-generated interface looks the same. Sidebar on the left. Header across the top. Card grid in the content area. Tailwind defaults. Blue buttons. Rounded corners. The aesthetic is competent, inoffensive, and utterly interchangeable.

This is not a model capability problem. Models can produce wildly different visual outputs given the right constraints. The problem is that nothing in the workflow injects those constraints. Design decisions happen during construction — if they happen at all — which means the agent reaches for whatever patterns are most statistically common in its training data. Every project gets the same look because no system told the agent to think about aesthetics before writing the first line of code.

AI-DLC now does.

## Design Direction

The design direction system activates during elaboration, not construction. This placement is the entire point. Design is forethought — it belongs in Phase 2.75, right after the intent is understood and before any unit decomposition happens. By the time the builder hat writes its first component, visual direction has already been decided and documented.

For greenfield projects or early-stage work without existing design knowledge, the system presents a visual picker: a browser-based MCP tool that renders four design archetypes as live preview HTML in sandboxed iframes. The archetypes — Brutalist, Editorial, Dense/Utilitarian, and Playful/Warm — are not themes or templates. They are starting positions in a design space, each with distinct opinions about density, typography, color mood, shape language, and layout structure.

The picker exposes tunable parameters as continuous sliders from 0 to 100. Density, expressiveness, shape language, color mood — each adjusts CSS tokens via linear interpolation between the archetype's defined bounds. This is not "pick one of four options." It is "start from an archetype and fine-tune until it matches your vision." The interpolation is smooth, not bucketed.

All four archetypes and their parameter ranges live in `plugin/data/archetypes.json` — a single source of truth consumed by both the TypeScript MCP server and the shell blueprint generator. One definition, two consumers, no drift.

The output is a `design-blueprint.md`: concrete CSS tokens, layout guidelines, typography rules, and component guidelines. Not aspirational mood board language — actual values that a builder can apply. When Phase 6.25 generates wireframes, it reads this blueprint and applies its tokens. Wireframes shift from gray-box generic to direction-aware styled. A Brutalist wireframe looks nothing like an Editorial one, even at the wireframe stage.

When MCP is unavailable, the system falls back to text-based selection in the terminal. In autopilot mode, it auto-selects Editorial with default parameters — a reasonable autonomous default that avoids the generic look without making a bold choice that might surprise a returning human.

## Project Knowledge

The design direction system solves the "every project looks the same" problem. The knowledge layer solves a different one: every intent starts from zero.

Before this change, the second feature you built knew nothing about the first. Design decisions, architecture patterns, domain understanding, coding conventions — all of it lived in the agent's expired context window. Each new intent was a blank slate.

The project knowledge layer makes intelligence persistent. Five artifact types — `design.md`, `architecture.md`, `product.md`, `conventions.md`, `domain.md` — live in `.ai-dlc/knowledge/` and accumulate across intents. The design direction system seeds the first one. Subsequent intents read and extend all of them.

Each hat loads the knowledge relevant to its discipline. The designer hat gets design knowledge. The builder gets architecture, conventions, and domain knowledge. The planner gets product, domain, and architecture knowledge. The reviewer checks compliance against documented patterns. Knowledge is not dumped wholesale into every context — it is routed to where it is useful.

For brownfield projects, a synthesis subagent scans the existing codebase and reverse-engineers knowledge artifacts with confidence scores. A high-confidence finding like "this project uses Next.js App Router with server components" goes directly into `architecture.md`. A medium-confidence inference is marked as such. The system does not pretend to have certainty it does not have.

Knowledge artifacts are maturity-aware. Greenfield projects get scaffold artifacts that fill in as the project develops. Established projects get deep synthesis reflecting accumulated decisions. The system knows the difference between "we have not decided yet" and "we decided this three intents ago."

Writes are thread-safe via `flock`-based locking — because multiple agents working in parallel via Agent Teams should not corrupt shared knowledge.

## Compounding Intelligence

The design direction system and the knowledge layer are two parts of a single idea: projects should get smarter over time.

The first intent in a new project triggers the design direction picker, produces a blueprint, and seeds `knowledge/design.md`. The second intent reads that knowledge, applies those design tokens, and adds architecture decisions it discovers during construction. The third intent has design direction, architecture context, and emerging conventions. Each intent builds on what came before.

This is how human teams work. A senior developer does not re-derive the architecture from first principles on every ticket. They absorb accumulated context and make decisions consistent with what the team has already built. The knowledge layer gives the agent the same advantage.

The archetype system ensures that accumulated knowledge starts from a real design position, not from defaults. A project that chose Brutalist in its first intent carries that direction through every subsequent intent — not because the agent memorized the choice, but because the choice is documented in persistent artifacts that every hat reads.

## Forethought, Not Afterthought

The conventional AI workflow treats design as something you fix after the code exists. Generate the feature, look at it, adjust the CSS, iterate. Design is reactive — a correction applied to defaults the agent chose without guidance.

AI-DLC inverts this. Design direction is established during elaboration, before any unit is decomposed, before any builder writes a line of code. The blueprint is an input to construction, not an output of it. By the time the agent generates a component, it already knows the density target, the shape language, the color mood, and the typography scale.

This is the same principle that makes passes work: the right discipline at the right time produces better outcomes than applying all disciplines simultaneously. Design belongs in elaboration. Architecture belongs in elaboration. Domain understanding belongs in elaboration. These are the decisions that *shape* implementation. Making them explicit and early means the builder operates with constraints instead of defaults.

The knowledge layer extends this principle across time. Design direction is forethought for the first intent. Accumulated knowledge is forethought for every intent after that.

Projects should not converge on the same look. Agents should not forget what they learned. AI-DLC now ensures neither happens.

---

*Built with discipline. Shipped with confidence.*
