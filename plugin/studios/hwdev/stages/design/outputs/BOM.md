---
name: bom
location: (project design tree / BOM file)
scope: repo
format: artifact
required: true
---

# Bill of Materials

Complete sourced BOM with part numbers, manufacturers, unit cost, lead time, and second sources for critical components.

## Content Guide

Per line item:
- Manufacturer part number
- Manufacturer
- Description
- Quantity per assembly
- Unit cost at target volume
- Lead time
- Second source (where critical)
- RoHS/REACH compliance status

## Quality Signals

- Every critical component has a second source or documented justification for single-sourcing
- No component has EOL status within product lifetime
- Total BOM cost is within the cost envelope from inception
