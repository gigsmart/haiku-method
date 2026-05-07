---
name: design
description: Schematic, PCB layout, mechanical, and BOM
hats: [electrical-engineer, mechanical-engineer, pcb-designer, design-reviewer]
fix_hats: [classifier, electrical-engineer, pcb-designer, feedback-assessor]
review: [external, ask]
elaboration: collaborative
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

## EDA Platform: tscircuit

This studio uses [tscircuit](https://tscircuit.com) for electronics design.
Schematics and PCB layouts are authored as TypeScript/React (`.tsx`) circuit
code — components are composable elements, not canvas objects. Authoring
happens in the normal repo tree; live preview is served by `tsci dev`
(local browser URL printed by the CLI); packages are consumed via `tsci add`
from the
tscircuit registry; Gerbers, pick-and-place, and BOM are exported with the
`tsci` CLI. The source-of-truth design artifact is the circuit code itself,
not a proprietary EDA binary. Manufacturing exports (Gerbers, pick-and-place,
BOM CSV) are produced from the tscircuit source and committed alongside the
`.tsx` circuit code.
