---
name: pcb-layout
location: (tscircuit PCB source — same `.tsx` circuit code as the schematic; Gerbers / drill / pick-and-place exports committed alongside)
scope: repo
format: artifact
required: true
---

# PCB Layout & Fabrication Files

The PCB layout is expressed in the same [tscircuit](https://tscircuit.com) `.tsx` circuit code as the schematic — placement, routing constraints, board outline, mounting holes, and stack-up live in code. The fabrication exports (Gerbers, drill, pick-and-place) are derived artifacts: regenerated from source via the `tsci` CLI on every layout change and committed alongside the `.tsx` source so reviewers and fab houses don't need to run the dev server.

## Content Guide

- **Authored in tscircuit** — placement, routing, board outline, layer stack-up, mounting holes, and copper pours expressed in `.tsx`
- **DRC-clean** in the tscircuit preview before exports are regenerated
- **Gerbers** (one set per layer per fab order), exported via `tsci`
- **Drill files** (plated and non-plated), exported via `tsci`
- **Pick-and-place** (centroid + rotation per reference designator), exported via `tsci`
- **Stack-up document** captured in the tscircuit board config, with fab-house capability cross-checked
- **Fabrication notes** for any non-default process (controlled impedance, blind/buried vias, surface finish requirements)

## Quality Signals

- DRC is clean in the tscircuit preview
- Committed Gerbers / drill / pick-and-place regenerate identically from the current tscircuit source — drift between source and exports is a hard fail
- Stack-up and trace widths are within the target fab house's published capability
- Mounting holes, connector positions, and board outline align with the mechanical 3D preview
