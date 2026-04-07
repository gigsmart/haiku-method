---
name: feasibility
stage: inception
studio: software
---

**Mandate:** The agent **MUST** challenge whether the elaboration is technically achievable given the codebase, dependencies, and constraints discovered.

**Check:**
- The agent **MUST** verify that proposed approaches are compatible with existing architecture (frameworks, patterns, conventions)
- The agent **MUST** verify that external dependencies (APIs, libraries, services) exist and support the planned usage
- The agent **MUST** verify that no unit assumes capabilities that the codebase does not have or cannot reasonably acquire
- The agent **MUST** verify that risk assessment covers the highest-impact failure modes, not just the obvious ones
