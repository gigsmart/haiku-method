---
name: vuln-report
location: .haiku/intents/{intent-slug}/knowledge/VULN-REPORT.md
scope: intent
format: text
required: false
---

# Vulnerability Report

Vulnerability findings from red-team testing. This output drives blue-team remediation and security reviewer sign-off.

## Content Guide

For each vulnerability:

- **Title** — concise description of the vulnerability
- **Severity** — critical, high, medium, low, or informational
- **OWASP category** — which OWASP Top 10 category it falls under (if applicable)
- **Description** — what the vulnerability is and why it matters
- **Reproduction steps** — exact steps to reproduce, specific enough for another tester to follow
- **Affected component** — file, endpoint, or module where the vulnerability exists
- **Evidence** — request/response captures, code snippets, screenshots
- **Recommended fix** — how to remediate the root cause (not just the specific payload)
- **Mitigation status** — open, mitigated, or accepted risk

End with summary statistics (count by severity) and trend analysis if this is a repeat assessment.

## Quality Signals

- Reproduction steps are specific enough to execute without guessing
- Recommended fixes address the vulnerability class, not just the test payload
- Evidence is concrete (actual requests/responses, not hypothetical scenarios)
- Accepted risks are documented with justification and compensating controls
