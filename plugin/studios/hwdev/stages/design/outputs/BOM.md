---
name: bom
location: (exported from tscircuit source via `tsci` — committed CSV alongside `.tsx` circuit code)
scope: repo
format: artifact
required: true
---

# Bill of Materials

Complete sourced BOM, generated from the [tscircuit](https://tscircuit.com) circuit source. The BOM is derived, not authored — every line item traces back to a component in the `.tsx` circuit code. Sourcing metadata (cost, lead time, second sources, RoHS/REACH status) lives in a companion file and is joined onto the exported BOM at review and release time.

## Content Guide

Per line item in the tscircuit-exported `bom.csv`:
- Manufacturer part number (from tscircuit component)
- Manufacturer
- Description
- Quantity per assembly (auto-counted by tscircuit)

Per line item in the companion `bom-sourcing.csv` (authored, keyed by manufacturer part number):
- Manufacturer part number (join key)
- Unit cost at target volume
- Lead time
- Second source manufacturer + part number (where critical)
- RoHS / REACH compliance status
- EOL status / last-time-buy date (if known)

## Sourcing Workflow

1. **Regenerate** `bom.csv` from the tscircuit source via `tsci` on every circuit-code change.
2. **Join** `bom.csv` to `bom-sourcing.csv` on manufacturer part number (e.g. via a `tsci` post-export script or a project-local make target — the mechanism is project-local, but the file split is fixed).
3. **Flag new parts** that exist in `bom.csv` but have no row in `bom-sourcing.csv` — those parts must be sourced before the design stage gate passes.
4. **Flag orphaned sourcing rows** in `bom-sourcing.csv` for parts no longer in `bom.csv` — those rows are removed (with a commit message noting the part removal).
5. **Never edit `bom.csv` by hand** — sourcing metadata only goes in `bom-sourcing.csv` so that BOM regeneration never overwrites authored data.

## Quality Signals

- `bom.csv` regenerates identically from the current tscircuit source — drift between circuit code and committed BOM is a hard fail
- Every part in `bom.csv` has a corresponding row in `bom-sourcing.csv` — unsourced parts block the design gate
- Every critical component has a second source or documented justification for single-sourcing
- No component has EOL status within product lifetime
- Every part has a tscircuit footprint (registry or `@tscircuit/footprinter`) — no "schematic-only" parts
- Total BOM cost (joined view) is within the cost envelope from inception
