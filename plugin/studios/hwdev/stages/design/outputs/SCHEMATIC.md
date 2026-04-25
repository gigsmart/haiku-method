---
name: schematic
location: (tscircuit source tree — `.tsx` circuit code, with rendered schematic SVG exported alongside)
scope: repo
format: artifact
required: true
---

# Schematic

The complete electrical schematic, authored as [tscircuit](https://tscircuit.com) TypeScript/React code (`.tsx`). Components are expressed as composable elements with part numbers, values, and rationale for non-obvious choices. The circuit source is the authoritative artifact — the rendered schematic SVG is regenerated from it. PCB layout and fabrication exports (Gerbers, drill, pick-and-place) are tracked separately under `outputs/PCB.md`.

## Content Guide

- **Authored in tscircuit** — `.tsx` circuit code, previewable via `tsci dev` (the CLI prints the local URL on startup)
- **All nets named** where naming aids readability
- **All components** pulled from the tscircuit registry (`tsci add`) or authored with `@tscircuit/footprinter`, with part numbers in the BOM and rationale for critical choices
- **Power tree** documented in code (comments / named subcircuits) showing regulation and decoupling strategy
- **Signal integrity** considered for any high-speed paths, with routing constraints expressed in the PCB layout section of the circuit code
- **Rendered schematic SVG** exported via `tsci` and committed for reviewers who aren't running the dev server

## Completion

Complete when ERC is clean in the tscircuit preview, the BOM (exported from the same source) is sourced with confirmed availability, committed manufacturing exports match the current source, and design review has signed off.
