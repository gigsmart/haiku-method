---
name: security
stage: development
studio: software
---

**Mandate:** The agent **MUST** identify security vulnerabilities introduced by the implementation.

**Check:**
- The agent **MUST** verify that no injection vectors (SQL, command, XSS, template injection)
- The agent **MUST** verify that authentication and authorization checks are present on all protected paths
- The agent **MUST** verify that secrets are not hardcoded or logged
- The agent **MUST** verify that input validation occurs at system boundaries
- The agent **MUST** verify that no insecure defaults (permissive CORS, debug mode, disabled TLS verification)
- The agent **MUST** verify that dependencies do not have known critical vulnerabilities
