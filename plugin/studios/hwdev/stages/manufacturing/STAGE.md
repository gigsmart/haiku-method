---
name: manufacturing
description: DFM, assembly process, QA sampling, and production ramp
hats: [manufacturing-engineer, qa-lead]
review: await
elaboration: autonomous
inputs:
  - stage: design
    output: schematic
  - stage: design
    output: bom
  - stage: firmware
    output: firmware-binary
  - stage: validation
    output: certification
---

# Manufacturing

Design for manufacturability (DFM) review, assembly process definition, QA
sampling plan, and production ramp. Manufacturing decisions lock in — once
tooling is cut and the assembly line is running, changes are expensive and
slow. First article inspection is the last chance to catch a problem before
it ships at volume.

## Completion Signal (RFC 2119)

DFM review **MUST** be complete with all findings addressed. Assembly process
**MUST** be documented and reproducible. QA sampling plan **MUST** be in
place with defect thresholds. First article inspection **MUST** pass before
volume ramp.
