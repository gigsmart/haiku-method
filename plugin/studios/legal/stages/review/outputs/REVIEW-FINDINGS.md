---
name: review-findings
location: .haiku/intents/{intent-slug}/stages/review/artifacts/
scope: intent
format: text
required: true
---

# Review Findings

Legal review results with categorized issues, compliance mapping, and risk opinion.

## Expected Artifacts

- **Categorized findings** -- each issue rated as critical (must fix), important (should fix), or advisory (consider)
- **Compliance mapping** -- each regulatory requirement mapped to the draft provision that satisfies it
- **Gap analysis** -- regulatory requirements not adequately addressed in the draft
- **Risk opinion** -- residual risk quantified for each exposure with acceptance or mitigation recommendation

## Quality Signals

- Findings are categorized by severity with specific remediation guidance
- Compliance check maps every regulatory requirement to a draft provision
- Gap analysis identifies unaddressed requirements
- Risk opinion quantifies residual risk with clear recommendations
