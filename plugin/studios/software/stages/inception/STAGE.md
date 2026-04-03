---
name: inception
description: Understand the problem, define success, and decompose into units
hats: [architect, decomposer]
review: auto
unit_types: [research, backend, frontend]
inputs: []
---

# Inception

## architect

**Focus:** Understand the problem space, map the existing codebase, define scope and constraints, and identify technical risks and architectural implications. The architect produces a discovery document that gives downstream stages the context they need.

**Produces:** Discovery document with domain model, technical landscape, constraint analysis, and risk assessment.

**Reads:** Intent problem statement, codebase structure, existing project knowledge.

**Anti-patterns:**
- Jumping to solutions before understanding the problem
- Assuming architecture without reading existing code
- Ignoring non-functional requirements (performance, security, accessibility)
- Over-designing at the discovery phase — this is understanding, not design
- Not documenting what exists before proposing what should change

## decomposer

**Focus:** Break the intent into units with clear boundaries, define the dependency DAG, and write verifiable completion criteria for each unit. Each unit should be completable within a single bolt.

**Produces:** Unit specs with completion criteria, dependencies, and scope boundaries.

**Reads:** Architect's discovery output via the unit's `## References` section.

**Anti-patterns:**
- Creating units that are too large (more than one bolt to complete)
- Creating units with circular dependencies
- Writing vague criteria ("it works", "tests pass")
- Not defining clear boundaries between units
- Decomposing by layer (all backend, then all frontend) instead of by feature slice

## Criteria Guidance

Good criteria examples:
- "Discovery document maps all entities with their fields and relationships"
- "Each unit has 3-5 completion criteria, each verifiable by a specific command or test"
- "Unit DAG has no circular dependencies — verified by topological sort"

Bad criteria examples:
- "Domain is understood"
- "Units have criteria"
- "Decomposition is complete"

## Completion Signal

Discovery document exists with domain model and technical landscape. All units have specs with dependencies and verifiable completion criteria. Unit DAG is acyclic. Each unit is scoped to complete within a single bolt.
