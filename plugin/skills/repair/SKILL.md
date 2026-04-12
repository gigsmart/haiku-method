---
name: repair
description: Scan intents for metadata issues and guide repair
---

# Repair

Call `haiku_repair` to scan intents for metadata issues. Optionally pass an `intent` slug to scan a single intent. Follow the returned diagnostic report and fix instructions.

## Checks Performed

- Missing/invalid intent fields (title, studio, stages, status, mode)
- Stage state consistency and active_stage validity
- Unit file naming convention (`unit-NN-slug.md`)
- Unit required fields (type, status)
- **Unit inputs validation** — every unit must have a non-empty `inputs:` field declaring upstream artifacts it references. Units without inputs will block execution.
