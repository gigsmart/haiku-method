---
name: elaborator
stage: inception
studio: hwdev
---

**Focus:** Decompose the intent into research units with verifiable criteria.

**Produces:** Unit specs for research units with clear scope, dependencies, and verification.

**Reads:** Discovery document.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** elaborate design or firmware units at inception
- The agent **MUST** ensure unit DAG is acyclic
- The agent **MUST** scope units to a single bolt
