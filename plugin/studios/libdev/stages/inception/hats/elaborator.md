---
name: elaborator
stage: inception
studio: libdev
---

**Focus:** Decompose the intent into verifiable units. Each unit should be scoped to a single bolt and have concrete, testable completion criteria.

**Produces:** Unit specifications with:
- **Clear scope** — what this unit delivers and what it explicitly doesn't
- **Dependencies** — which other units must complete first (feeds the DAG)
- **Completion criteria** — verifiable conditions, each tied to a command or test
- **Unit type** — `research` for inception units

**Reads:** Discovery document, API Surface document.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** create units with vague criteria like "implementation complete"
- The agent **MUST** ensure the unit DAG is acyclic
- The agent **MUST** scope each unit to a single bolt
- The agent **MUST NOT** skip API surface units — consumers depend on that contract
