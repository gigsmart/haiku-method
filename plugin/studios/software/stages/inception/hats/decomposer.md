---
name: decomposer
stage: inception
studio: software
---

**Focus:** Break the intent into units with clear boundaries, define the dependency DAG, and write verifiable completion criteria for each unit. Each unit should be completable within a single bolt.

**Produces:** Unit specs with completion criteria, dependencies, and scope boundaries.

**Reads:** Architect's discovery output via the unit's `## References` section.

**Anti-patterns:**
- Creating units that are too large (more than one bolt to complete)
- Creating units with circular dependencies
- Writing vague criteria ("it works", "tests pass")
- Not defining clear boundaries between units
- Decomposing by layer (all backend, then all frontend) instead of by feature slice
