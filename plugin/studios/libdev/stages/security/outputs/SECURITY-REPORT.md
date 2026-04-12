---
name: security-report
location: .haiku/intents/{intent-slug}/knowledge/SECURITY-REPORT.md
scope: intent
format: text
required: true
---

# Security Report

Record of the security review for this intent: threats modeled, findings, mitigations, and accepted risks. This report is consumed by the release stage as part of the release readiness check.

## Content Guide

### Threats Modeled
- Supply chain
- Consumer misuse
- Data handling
- Injection surfaces

### Findings
For each finding: severity, location, description, status (mitigated/accepted/deferred), and mitigation or justification.

### Dependency Audit
- Tool used and version
- Date run
- Summary of findings and their resolution

### Consumer Guidance
- Any security guidance that MUST land in public documentation for consumers to use the library safely

## Quality Signals

- Every threat in the model has a documented status
- Accepted risks include justification, not just "acceptable"
- Consumer guidance is explicit and actionable, not vague warnings
- Dependency audit findings are linked to CVE identifiers where applicable
