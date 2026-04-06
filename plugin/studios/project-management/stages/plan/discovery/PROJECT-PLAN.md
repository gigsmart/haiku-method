---
name: project-plan
location: .haiku/intents/{intent-slug}/knowledge/PROJECT-PLAN.md
scope: intent
format: text
required: true
---

# Project Plan

Work breakdown, resource allocations, and critical path for the project.

## Content Guide

Structure the plan for execution tracking:

- **Work breakdown structure** -- all in-scope deliverables decomposed to trackable work packages
- **Dependencies** -- inter-package dependencies with sequencing rationale
- **Resource allocations** -- each work package assigned to a named owner with availability confirmed
- **Effort estimates** -- estimates with methodology, assumptions, and confidence ranges
- **Critical path** -- identified critical path with float calculations
- **Schedule risks** -- high-risk items with contingency buffers

## Quality Signals

- Every charter scope item is represented in the work breakdown
- Dependencies form a valid, acyclic graph
- Estimates use documented methodology with stated assumptions
- Critical path is identified and schedule risks are flagged proactively
