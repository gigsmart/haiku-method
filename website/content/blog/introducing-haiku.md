---
title: "Introducing H·AI·K·U: Why We Rebranded and What Changes"
description: From AI-DLC to H·AI·K·U — a methodology evolution from software-specific lifecycle to domain-agnostic work orchestration.
date: 2026-04-02
author: GigSmart
---

We started with **AI-DLC** — the AI-Driven Development Lifecycle. It was a methodology built for software teams working with AI agents. Hats, units, bolts, quality gates. It worked. It worked well enough that people kept asking the same question: *can I use this for things that aren't code?*

The answer was always "sort of, but you'd have to bend it." The git-centric persistence, the software-specific stages, the development-flavored language — it all assumed you were writing software. That assumption was baked into every layer.

So we rebuilt the layers. **H·AI·K·U** is what came out the other side.

## Why H·AI·K·U

The name stands for **H**uman + **AI** **K**nowledge **U**nification — and it reflects what the methodology actually does: unifies human domain expertise with AI execution capability through structured, iterative collaboration. Like the poetry form it echoes, H·AI·K·U values constraint as a creative force. Strict structure. Clear boundaries. Surprising depth within those boundaries.

The core insight that drove the rebrand: **all structured work flows through the same pattern**. A marketing team creating a campaign goes through research, creative, review, and publish. A software team goes through inception, design, development, and operations. A hardware team goes through requirements, PCB design, firmware, and integration testing. The pattern is the same. The domain is the variable.

AI-DLC encoded one instance of this pattern. H·AI·K·U encodes the pattern itself.

## What Changed

### Studios

The biggest conceptual addition. A **studio** is a named lifecycle for a specific domain. It defines the stage order and the persistence layer — how work is saved, versioned, and delivered.

- **Software studio**: stages like inception, design, product, development, operations, security. Persistence via git — branches, commits, pull requests.
- **Marketing studio**: stages like research, creative, copy, review, publish. Persistence via Notion or filesystem.
- **Ideation studio**: the universal default. Research, create, review, deliver. Works for anything.

Studios aren't just configuration. They're the mechanism that makes H·AI·K·U domain-agnostic. You pick a studio (or build your own), and the entire lifecycle adapts — stages, hats, quality gates, persistence, delivery.

### Stages Replace Phases

The old model had phases (elaboration, construction, operation). The new model has **stages** — and they're defined by the studio, not hardcoded. Each stage follows the same internal loop: **plan, build, review, gate**. This is true whether the stage is "inception" in a software studio or "research" in a marketing studio.

Stages can advance, revise (loop within the stage), or go back to a previous stage. The review gate at the end of each stage can be automatic, ask the user, or require external approval.

### Persistence Abstraction

Git was previously the only way to save work. Now, persistence is an adapter declared by the studio:

- **Git**: branches, commits, PRs — for software
- **Notion**: pages, blocks, shares — for content
- **Filesystem**: directories and files — for anything
- **Custom**: bring your own adapter

The core loop doesn't know or care how work is saved. It just calls the persistence interface.

### New Commands

The plugin commands shifted from `/ai-dlc:*` to `/haiku:*`:

- `/haiku:new` — create a new intent and select a studio
- `/haiku:resume` — run the stage pipeline (continuous mode)
- `/haiku:execute` — drive unit implementations within a stage
- `/haiku:elaborate` — collaborative planning and elaboration
- `/haiku:review` — pre-delivery quality review

The old commands still work as aliases during the transition period.

### Knowledge Architecture

H·AI·K·U formalizes two layers of accumulated context that every stage reads:

1. **Global knowledge pool** — project-level understanding that persists across intents (architecture decisions, conventions, domain knowledge)
2. **Intent artifacts** — accumulated outputs from completed stages within the current intent

This means later stages always have the full context of what earlier stages produced. No information loss between stages.

## What Didn't Change

The core philosophy is the same. H·AI·K·U still believes:

- **Elaboration is the investment that makes execution autonomous.** Clear criteria = autonomous AI. Vague criteria = constant human intervention.
- **Hats create focused agents.** Each hat starts with a clean context window and a specific mandate. No context drift.
- **Quality gates enforce standards, not suggestions.** Hard gates that reject non-conforming work, not optional checklists.
- **Human oversight scales with task clarity.** Supervised, observed, or autonomous — choose based on how well-defined the work is.

The three-layer hierarchy — **intent** (the what), **unit** (the work), **bolt** (the cycle) — remains unchanged. These concepts are domain-agnostic by nature.

## The Philosophy

We kept hearing from teams that weren't writing software but needed the same rigor: marketing teams, operations teams, research teams, legal teams. They all had the same problem: AI agents are powerful but undirected. Without structure, they produce quantity without quality.

H·AI·K·U is the answer. It's not a software development methodology with domain bolted on. It's a work orchestration system where software development is one studio among many.

If your team does structured work with AI — any kind of structured work — H·AI·K·U gives you the lifecycle, the quality gates, and the persistence layer to make that work reliable.

Read the full methodology in the [H·AI·K·U paper](/paper/).

---

*The same discipline. More domains. Better name.*
