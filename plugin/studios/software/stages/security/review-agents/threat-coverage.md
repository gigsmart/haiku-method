---
name: threat-coverage
stage: security
studio: software
---

**Mandate:** The agent **MUST** verify the threat model is comprehensive and all identified threats have mitigations.

**Check:**
- The agent **MUST** verify that threat model covers all entry points (APIs, webhooks, file uploads, user input)
- The agent **MUST** verify that sTRIDE or equivalent categorization is applied consistently
- The agent **MUST** verify that each identified threat has a specific mitigation, not just "we should address this"
- The agent **MUST** verify that trust boundaries are correctly identified
- The agent **MUST** verify that third-party dependencies are included in the threat surface
