---
name: bugfix
studio: software
description: Fix a reported bug with investigation, fix, and verification
parameters:
  - name: bug
    description: Description of the bug or link to the bug report
    required: true
  - name: severity
    description: "Bug severity: critical, high, medium, low"
    required: false
    default: medium
stages-override: [inception, development]
units:
  - name: "investigate"
    stage: inception
    criteria:
      - "Root cause identified with evidence (logs, reproduction steps)"
      - "Fix approach documented"
      - "Blast radius assessed (what else might be affected)"
  - name: "fix"
    stage: development
    criteria:
      - "Bug no longer reproducible"
      - "Regression test written that fails without the fix"
      - "No other tests broken"
---

Streamlined template for bugfixes — skips design and product stages.

## When to Use

- Reported bug with a clear reproduction path
- Bug that doesn't require design changes or new product specs
- Urgent fixes (set severity parameter to control priority)
