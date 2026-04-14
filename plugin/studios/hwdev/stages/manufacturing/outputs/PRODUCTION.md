---
name: production
location: (factory floor + QA systems)
scope: external
format: artifact
required: true
---

# Production

The state of the manufacturing line producing shippable units at target volume with acceptable yield and quality. This is not a document in the intent directory; it is the state of the outside world after manufacturing ramp.

## Content Guide

Production is ramped when:
- **DFM review** is complete with all findings addressed
- **Tooling and fixtures** are built and validated
- **First article inspection** has passed
- **Assembly process** is documented and reproducible
- **QA plan** is operational with functional test at end-of-line
- **Yield** is at or above target after ramp period

## Quality Signals

- First article inspection passed without reopening design
- Defect rates are within acceptance thresholds
- Assembly process can be reproduced at a second factory if needed
- Functional test at end-of-line catches the defect modes seen during validation
