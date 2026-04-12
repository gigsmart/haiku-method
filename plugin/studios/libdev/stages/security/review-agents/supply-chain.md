---
name: supply-chain
stage: security
studio: libdev
---

**Mandate:** The agent **MUST** verify the library's dependency tree is audited and free of known-vulnerable dependencies before release.

**Check:**
- The agent **MUST** verify the dependency audit tool (npm audit, pip-audit, cargo audit, etc.) has been run and findings addressed
- The agent **MUST** verify no direct dependency has a known high/critical CVE without documented mitigation
- The agent **MUST** verify transitive dependency risks are assessed, not just direct ones
- The agent **MUST** verify dependency licenses are compatible with the library's license
- The agent **MUST** flag any dependency with no maintenance activity in 12+ months as a supply-chain risk
