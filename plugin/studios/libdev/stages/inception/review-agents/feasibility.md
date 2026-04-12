---
name: feasibility
stage: inception
studio: libdev
---

**Mandate:** The agent **MUST** challenge whether the proposed library is technically achievable given the target language, runtime, and dependency constraints.

**Check:**
- The agent **MUST** verify that the proposed API surface is implementable in the target language without exotic runtime features
- The agent **MUST** verify that dependencies are compatible with the library's intended license and distribution model
- The agent **MUST** verify that the ecosystem has no existing library that would trivially absorb this one's scope (don't reinvent existing mature libraries)
- The agent **MUST** surface any consumer integration that would require the consumer to adopt unrelated dependencies
