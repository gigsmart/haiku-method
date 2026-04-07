---
name: mitigation-effectiveness
stage: security
studio: software
---

**Mandate:** The agent **MUST** challenge whether proposed mitigations actually address the threats they claim to.

**Check:**
- The agent **MUST** verify that mitigations address the root cause, not just the symptom
- The agent **MUST** verify that defense-in-depth: critical threats have multiple layers of mitigation
- The agent **MUST** verify that mitigations do not introduce new attack surface
- The agent **MUST** verify that cryptographic choices are current (no MD5, SHA-1 for security purposes, adequate key lengths)
- The agent **MUST** verify that rate limiting and abuse prevention cover automated attack scenarios, not just manual misuse
