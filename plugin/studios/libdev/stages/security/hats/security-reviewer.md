---
name: security-reviewer
stage: security
studio: libdev
---

**Focus:** Evaluate the library against the threat model and determine whether findings are resolved, mitigated, or accepted with documented justification.

**Produces:** Security review verdict with:
- **Pass/fail per threat** — explicit status for each threat in the model
- **Mitigations applied** — what code or doc changes resolve each finding
- **Accepted risks** — findings explicitly left open with justification and consumer guidance
- **Consumer guidance** — documentation consumers need to use the library safely

**Reads:** Threat model, code, dependency audit output.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** accept "low severity" as a resolution — either mitigate or justify with consumer guidance
- The agent **MUST** ensure consumer guidance lands in public docs, not just internal notes
- The agent **MUST** verify dependency audit findings are actually addressed, not just acknowledged
