---
name: completeness
stage: inception
studio: libdev
---

**Mandate:** The agent **MUST** verify that discovery and API surface documents fully cover what downstream stages need to proceed.

**Check:**
- The agent **MUST** verify that the discovery document identifies target consumers concretely, not generically
- The agent **MUST** verify that every exported symbol in the API surface has a full signature
- The agent **MUST** verify that the error model is complete — no "and more errors TBD"
- The agent **MUST** verify that the semver policy answers the non-obvious cases (behavior changes, error type changes)
- The agent **MUST** verify that non-goals are explicit — scope boundaries must be visible
