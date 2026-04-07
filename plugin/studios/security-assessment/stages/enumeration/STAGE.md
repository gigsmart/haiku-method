---
name: enumeration
description: Service discovery, version detection, vulnerability scanning, and attack surface mapping
hats: [enumerator, vulnerability-scanner]
review: ask
unit_types: [service-enum, vuln-scan, attack-surface]
inputs:
  - stage: reconnaissance
    discovery: target-profile
---

# Enumeration

## Criteria Guidance

Good criteria examples:
- "Vulnerability catalog lists each finding with CVE reference, CVSS score, affected service, and verification status"
- "Service enumeration identifies software versions for at least 90% of discovered services"
- "Attack surface map categorizes entry points by protocol, authentication requirement, and exposure level"

Bad criteria examples:
- "Services are enumerated"
- "Vulnerabilities are found"
- "Attack surface is documented"

## Completion Signal (RFC 2119)

Vulnerability catalog **MUST** exist with each finding linked to a specific service, version, and CVE where applicable. Services are enumerated with version detection and configuration details. Attack surface map categorizes all entry points by risk level. False positives are flagged and **MUST** be verified findings are distinguished from unverified. Priority targets for exploitation **MUST** be identified with rationale.
