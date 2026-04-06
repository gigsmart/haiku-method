---
name: evidence-package
location: .haiku/intents/{intent-slug}/knowledge/EVIDENCE-PACKAGE.md
scope: intent
format: text
required: true
---

# Evidence Package

Complete evidence collection mapped to controls for external audit. This output drives the certify stage's audit preparation.

## Content Guide

Organize evidence for auditor consumption:

- **Evidence index** — master list of all artifacts with control mappings
- **Per-control evidence** — each control with:
  - Control description and requirement
  - Evidence artifact(s) with provenance (source, date, collector)
  - How the evidence demonstrates compliance
- **Audit trail** — end-to-end traceability from scope through remediation
- **Control narratives** — plain-language descriptions of how each control is implemented
- **Supporting documentation** — policies, procedures, architecture diagrams, and configuration records

## Quality Signals

- Every in-scope control has at least one evidence artifact
- All evidence has provenance metadata (source, date, collector)
- The audit trail connects scope, assessment, remediation, and verification without gaps
- Documentation is organized to match the framework's structure for efficient auditor navigation
