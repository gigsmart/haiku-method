---
name: feasibility
stage: product
studio: software
---

**Mandate:** The agent **MUST** challenge whether the specified behavior is implementable within the technical constraints.

**Check:**
- The agent **MUST** verify that specified response times and performance targets are realistic given the data model and infrastructure
- The agent **MUST** verify that data contracts are compatible with existing schemas (no breaking changes without migration plan)
- The agent **MUST** verify that edge cases have defined behavior, not just "handle gracefully"
- The agent **MUST** verify that no specification assumes capabilities that would require unreasonable effort to build
