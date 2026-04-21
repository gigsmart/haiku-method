---
name: schematic
location: (tscircuit source tree — `.tsx` circuit code, with exported SVG/Gerbers alongside)
scope: repo
format: artifact
required: true
---

# Schematic

The complete electrical schematic, authored as [tscircuit](https://tscircuit.com) TypeScript/React code (`.tsx`). Components are expressed as composable elements with part numbers, values, and rationale for non-obvious choices. The circuit source is the authoritative artifact — rendered SVG and manufacturing exports are regenerated from it.

## Content Guide

- **Authored in tscircuit** — `.tsx` circuit code, previewable via `tsci dev` on `http://localhost:3020`
- **All nets named** where naming aids readability
- **All components** pulled from the tscircuit registry (`tsci add`) or authored with `@tscircuit/footprinter`, with part numbers in the BOM and rationale for critical choices
- **Power tree** documented in code (comments / named subcircuits) showing regulation and decoupling strategy
- **Signal integrity** considered for any high-speed paths, with routing constraints expressed in the PCB layout section of the circuit code
- **Rendered schematic SVG** exported via `tsci` and committed for reviewers who aren't running the dev server

## Completion

Complete when ERC is clean in the tscircuit preview, the BOM (exported from the same source) is sourced with confirmed availability, committed manufacturing exports match the current source, and design review has signed off.
