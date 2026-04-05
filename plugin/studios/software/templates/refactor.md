---
name: refactor
studio: software
description: Restructure code to improve quality without changing behavior
parameters:
  - name: target
    description: What to refactor (module, pattern, dependency)
    required: true
  - name: motivation
    description: Why this refactor is needed
    required: false
stages-override: [inception, development]
units:
  - name: "assess"
    stage: inception
    criteria:
      - "Current state documented (what exists, why it's problematic)"
      - "Target state documented (what it should look like)"
      - "Migration path identified (incremental steps, not big bang)"
  - name: "refactor"
    stage: development
    criteria:
      - "All existing tests pass without modification"
      - "No behavioral changes (same inputs → same outputs)"
      - "Code review confirms improved structure"
---

Restructure without behavior change — skips design and product.
