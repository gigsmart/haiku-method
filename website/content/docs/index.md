---
title: Introduction
description: An introduction to AI-DLC and its core concepts
order: 1
---

AI-DLC is the software development profile of the [H•AI•K•U Method](https://haikumethod.ai) (Human AI Knowledge Unification). It provides a framework for structured, iterative software development with AI assistants, organizing work into focused units with clear phases and responsibilities.

## Why AI-DLC?

Software development has undergone a fundamental shift. AI has evolved from code completion to sustained autonomous reasoning — iterating in seconds, maintaining context across hours-long workflows, and writing production code at scale.

Traditional methods like Waterfall, Agile, and Scrum were designed for human-driven processes with long iteration cycles. Their sequential phases, handoff documentation, and approval gates made sense when changing requirements meant weeks of rework. But with AI, those phases are collapsing into continuous flow. Retrofitting AI into these methods constrains its potential.

AI-DLC is built from first principles for this new reality.

## Core Principles

### 1. Hats Drive Focus

AI-DLC uses "hats" to mark explicit transitions between modes of work — Planner, Builder, and Reviewer. When you switch hats, both you and your AI understand that the focus and expectations have changed.

### 2. Focused Units of Work

Work is organized into units — focused pieces of functionality with clear success criteria. Each unit is small enough to complete in one session but meaningful enough to deliver value.

### 3. Quality Through Backpressure

Instead of prescribing how to build, AI-DLC defines constraints that must be satisfied — tests pass, types check, linting is clean. AI iterates until all gates clear. Review is built into the cycle, not bolted on after.

### 4. Measurable Progress

Because work is organized into units with clear criteria, progress is always measurable. You know exactly where you are and what remains.

## Getting Started

1. Install the AI-DLC plugin in your Claude Code project
2. Define your first intent with clear success criteria
3. Move through the core hats: Planner → Builder → Reviewer
4. Complete the unit and move to the next
5. After construction, manage ongoing operations with `/ai-dlc:operate`

See the [Quick Start](/docs/quick-start/) guide for detailed instructions.
