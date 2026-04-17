---
name: firmware
description: Embedded software for the hardware platform
hats: [firmware-engineer, reviewer]
review: [external, ask]
elaboration: collaborative
inputs:
  - stage: requirements
    discovery: functional-requirements
  - stage: design
    output: schematic
---

# Firmware

Implement embedded software. Constraints differ from application development:
memory and flash are finite, real-time deadlines are often hard, power budgets
matter, and field updates may require physical access. Safety-critical code
paths must be traceable to requirements and provably correct — "it works on
the bench" is not validation for firmware that's going into a product.
