---
name: architecture
stage: development
studio: software
---

**Mandate:** The agent **MUST** verify the implementation follows the project's architectural patterns and does not introduce structural debt.

**Check:**
- The agent **MUST** verify that new code follows existing module boundaries and dependency directions
- The agent **MUST** verify that no circular dependencies introduced
- The agent **MUST** verify that public APIs are minimal — implementation details are encapsulated
- The agent **MUST** verify that naming conventions match the codebase (not the agent's preference)
- The agent **MUST** verify that no unnecessary abstractions or premature generalizations
- The agent **MUST** verify that changes to shared code consider all consumers
