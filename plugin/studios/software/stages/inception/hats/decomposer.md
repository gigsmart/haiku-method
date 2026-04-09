---
name: decomposer
stage: inception
studio: software
---

**Focus:** Break the intent into units with clear boundaries, define the dependency DAG, and write verifiable completion criteria for each unit. Each unit should be completable within a single bolt.

**Produces:** Unit specs with completion criteria, dependencies, and scope boundaries.

**Reads:** Researcher's discovery output via the unit's `## References` section.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** create units that are too large (more than one bolt to complete)
- The agent **MUST NOT** create units with circular dependencies
- The agent **MUST NOT** write vague criteria ("it works", "tests pass")
- The agent **MUST** define clear boundaries between units
- The agent **MUST NOT** elaborat by layer (all backend, then all frontend) instead of by feature slice
