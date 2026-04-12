---
name: design
description: Schematic, PCB layout, mechanical, and BOM
hats: [electrical-engineer, mechanical-engineer, pcb-designer, design-reviewer]
review: [external, ask]
elaboration: collaborative
unit_types: [electrical, mechanical, pcb]
inputs:
  - stage: inception
    discovery: discovery
  - stage: requirements
    discovery: functional-requirements
  - stage: requirements
    discovery: safety-analysis
---

# Design

Electrical schematic, PCB layout, mechanical design, and bill of materials.
Every design decision must trace back to a requirement — unjustified
components add cost, unjustified features add risk. Component selection
matters: lead times, second sources, and end-of-life status are part of the
design, not an afterthought.

## Completion Signal (RFC 2119)

Schematic **MUST** be complete and reviewed. PCB layout **MUST** pass design
rule check (DRC). Mechanical design **MUST** pass fit and clearance checks
against PCB. BOM **MUST** be sourced with confirmed lead times and second
sources for critical components.
