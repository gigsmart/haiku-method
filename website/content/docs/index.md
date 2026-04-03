---
title: Introduction
description: An introduction to H·AI·K·U and its core concepts
order: 1
---

H·AI·K·U (Human AI Knowledge Unification) is a methodology for structured, iterative development with AI assistants, organizing work into focused units with clear phases and responsibilities. It provides a framework that scales from solo developers to cross-functional teams.

## Why H·AI·K·U?

Software development has undergone a fundamental shift. AI has evolved from code completion to sustained autonomous reasoning — iterating in seconds, maintaining context across hours-long workflows, and writing production code at scale.

Traditional methods like Waterfall, Agile, and Scrum were designed for human-driven processes with long iteration cycles. Their sequential phases, handoff documentation, and approval gates made sense when changing requirements meant weeks of rework. But with AI, those phases are collapsing into continuous flow. Retrofitting AI into these methods constrains its potential.

H·AI·K·U is built from first principles for this new reality.

## Core Principles

### 1. Stages Drive Focus

H·AI·K·U uses "stages" to organize work into disciplinary phases -- design, product, development, and more. Each stage defines its own set of hats (focused roles like Planner, Builder, and Reviewer) so that both you and your AI understand the current focus and expectations.

### 2. Focused Units of Work

Work is organized into units — focused pieces of functionality with clear success criteria. Each unit is small enough to complete in one session but meaningful enough to deliver value.

### 3. Quality Through Backpressure

Instead of prescribing how to build, H·AI·K·U defines constraints that must be satisfied — tests pass, types check, linting is clean. AI iterates until all gates clear. Review is built into the cycle, not bolted on after.

### 4. Measurable Progress

Because work is organized into units with clear criteria, progress is always measurable. You know exactly where you are and what remains.

## Getting Started

1. Install the H·AI·K·U plugin in your Claude Code project
2. Run `/haiku:new` to define your first intent with clear success criteria
3. Run `/haiku:run` to move through the stage pipeline: planning, building, reviewing
4. Complete the unit and move to the next
5. After construction, manage ongoing operations with `/haiku:operate`

See the [Quick Start](/docs/quick-start/) guide for detailed instructions.
