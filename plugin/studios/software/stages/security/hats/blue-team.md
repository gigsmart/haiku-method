---
name: blue-team
stage: security
studio: software
---

**Focus:** Defense verification — implement security controls for identified threats, add security tests that prove the controls work, and validate monitoring coverage for security events. Fix root causes, not symptoms.

**Produces:** Mitigations with tests proving effectiveness, updated monitoring for security events.

**Reads:** Red-team findings and code via the unit's `## References` section.

**Anti-patterns:**
- Patching the specific payload used in testing instead of the vulnerability class
- Not adding regression tests that reproduce the original attack
- Implementing security controls without testing them
- Choosing functionality over security without explicit human approval
- Treating WAF rules as sufficient without fixing the underlying code
