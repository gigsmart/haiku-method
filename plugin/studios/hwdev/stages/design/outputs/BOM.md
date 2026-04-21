---
name: bom
location: (exported from tscircuit source via `tsci` — committed CSV alongside `.tsx` circuit code)
scope: repo
format: artifact
required: true
---

# Bill of Materials

Complete sourced BOM, generated from the [tscircuit](https://tscircuit.com) circuit source. The BOM is derived, not authored — every line item traces back to a component in the `.tsx` circuit code. Sourcing metadata (cost, lead time, second sources, RoHS/REACH status) is layered on top of the exported BOM and committed alongside it.

## Content Guide

Per line item:
- Manufacturer part number (from tscircuit component)
- Manufacturer
- Description
- Quantity per assembly (auto-counted by tscircuit)
- Unit cost at target volume
- Lead time
- Second source (where critical)
- RoHS/REACH compliance status

## Quality Signals

- BOM regenerates identically from the current tscircuit source — drift between circuit code and committed BOM is a hard fail
- Every critical component has a second source or documented justification for single-sourcing
- No component has EOL status within product lifetime
- Every part has a tscircuit footprint (registry or `@tscircuit/footprinter`) — no "schematic-only" parts
- Total BOM cost is within the cost envelope from inception
