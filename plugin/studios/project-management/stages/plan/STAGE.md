---
name: plan
description: Create work breakdown, allocate resources, and define timeline
hats: [planner, estimator]
review: ask
unit_types: [work-breakdown, resource-plan]
inputs:
  - stage: charter
    discovery: project-charter
---

# Plan

## Criteria Guidance

Good criteria examples:
- "Work breakdown structure elaborates every in-scope deliverable to work packages of 40 hours or less"
- "Resource allocation maps each work package to a named owner with confirmed availability"
- "Critical path is identified with float calculations and contingency buffers at high-risk junctions"

Bad criteria examples:
- "Plan is done"
- "Resources are assigned"
- "Timeline is set"

## Completion Signal (RFC 2119)

Project plan **MUST** exist with work breakdown, resource allocations, dependency map, and critical path identified. Planner **MUST** have confirmed all scope items from the charter are represented in the work breakdown. Estimator **MUST** have validated effort estimates using historical data or expert judgment with documented assumptions.
