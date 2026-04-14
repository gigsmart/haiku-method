---
name: security
description: Supply chain, dependency audit, and consumer-misuse threat model
hats: [threat-modeler, security-reviewer]
review: [external, ask]
elaboration: autonomous
inputs:
  - stage: inception
    discovery: discovery
  - stage: inception
    discovery: api-surface
  - stage: development
    output: code
---

# Security

Library security focuses on three surfaces: supply chain (transitive
dependencies, known CVEs, build reproducibility), public API attack surface
(what can a malicious consumer do with this library), and injection vectors
relevant to the library's domain (path traversal for filesystem libs,
prototype pollution for JS utilities, SSRF for HTTP clients).

Unlike application security, library security has to consider the library as
a potential *source* of vulnerabilities in downstream applications — the
threat model is "what if my consumer misuses this."

## Completion Signal (RFC 2119)

Dependency tree **MUST** be audited for known CVEs. Public API **MUST** be
threat-modeled for misuse by consumers. Security findings **MUST** be
resolved or documented with justification and consumer guidance.
