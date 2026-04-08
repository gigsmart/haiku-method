---
name: remediation-log
location: .haiku/intents/{intent-slug}/stages/remediate/artifacts/
scope: intent
format: text
required: true
---

# Remediation Log

Record of all remediation actions taken to address compliance gaps.

## Expected Artifacts

- **Control implementations** -- each remediated control with verification evidence
- **Policy documents** -- drafted policies mapped to controlling requirements
- **Configuration changes** -- committed changes with traceability to specific gaps
- **Remediation tracker** -- each gap from identification through resolution with completion evidence

## Quality Signals

- Every critical and high-risk gap has remediation implemented
- Each remediation includes verification evidence confirming the control is now met
- Policy documents follow the framework's required structure
- Configuration changes reference the specific gaps they address
