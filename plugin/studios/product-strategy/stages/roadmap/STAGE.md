---
name: roadmap
description: Create the roadmap with sequencing, dependencies, and milestones
hats: [roadmap-architect, capacity-planner]
review: ask
elaboration: collaborative
unit_types: [roadmap, milestone]
inputs:
  - stage: prioritization
    discovery: priority-matrix
---

# Roadmap

## Criteria Guidance

Good criteria examples:
- "Roadmap sequences initiatives with explicit dependency chains between items"
- "Each milestone has measurable success criteria and a list of constituent initiatives"
- "Capacity plan identifies resource constraints and maps them to roadmap phases"

Bad criteria examples:
- "Roadmap is created"
- "Milestones are defined"
- "Dependencies are noted"

## Completion Signal (RFC 2119)

Roadmap document **MUST** exist with sequenced initiatives, dependency graph, and milestone definitions. Each milestone **MUST** have measurable success criteria. Capacity planner **MUST** have validated feasibility against resource constraints and flagged bottlenecks. The roadmap tells a coherent narrative — why this sequence, why these milestones, what happens if assumptions change.
