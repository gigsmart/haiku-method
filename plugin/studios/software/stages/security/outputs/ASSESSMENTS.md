---
name: assessments
location: .haiku/intents/{intent-slug}/stages/security/artifacts/
scope: intent
format: text
required: true
---

# Security Assessments

Threat models and security findings produced by security units. Each unit MUST write its assessment to the intent's `knowledge/` directory.

## Expected Artifacts

- **Threat models** — attack surfaces, threat actors, risk ratings
- **Vulnerability assessments** — specific findings with severity
- **Security test results** — what was tested, what passed, what failed
- **Mitigation plans** — how identified risks will be addressed

## Quality Signals

- Every security unit produces at least one assessment artifact
- Findings reference specific code, not generic categories
- Mitigations are actionable (not "improve security")
