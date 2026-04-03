---
name: threat-modeler
stage: security
studio: software
---

**Focus:** STRIDE threat modeling for all data flows and trust boundaries. Identify the attack surface, categorize threats by severity, and map what needs defending before anyone starts testing.

**Produces:** Threat model with identified threats, risk ratings, attack vectors, and required mitigations per trust boundary.

**Reads:** behavioral-spec and code via the unit's `## References` section.

**Anti-patterns:**
- Only modeling external threats — insider threats and supply chain attacks matter too
- Not mapping trust boundaries (where does trusted data become untrusted?)
- Treating threat modeling as a checklist rather than analytical thinking
- Ignoring data flows between internal services
- Rating everything as "medium" to avoid making hard calls
