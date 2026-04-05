---
name: quarterly-evidence-collection
studio: compliance
description: Quarterly evidence collection cycle for ongoing compliance
parameters:
  - name: framework
    description: "Compliance framework: SOC2, HIPAA, GDPR, ISO27001"
    required: true
  - name: quarter
    description: "Quarter: Q1, Q2, Q3, Q4"
    required: true
  - name: year
    description: Year
    required: true
stages-override: [assess, document]
units:
  - name: "control-review"
    stage: assess
    criteria:
      - "All {{ framework }} controls reviewed for {{ quarter }} {{ year }}"
      - "Gaps identified with severity ratings"
      - "No critical gaps from previous quarter remain unresolved"
  - name: "evidence-package"
    stage: document
    criteria:
      - "Evidence collected for all in-scope controls"
      - "Screenshots and logs are timestamped within the quarter"
      - "Evidence index updated and organized per auditor format"
---

Recurring quarterly compliance evidence collection. Does not require full scope/remediate cycle.
