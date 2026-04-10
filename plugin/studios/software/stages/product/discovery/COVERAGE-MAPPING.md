---
name: coverage-mapping
location: .haiku/intents/{intent-slug}/knowledge/COVERAGE-MAPPING.md
scope: intent
format: text
required: true
---

# Coverage Mapping

Traceability matrix produced by the validator hat mapping every unit success criterion to its corresponding acceptance criteria and specification items. A GAPS FOUND result blocks stage completion until the responsible hat addresses the gap.

## Content Guide

- **Coverage matrix** — each success criterion mapped to AC and spec items that cover it
- **Gap flags** — any criterion with no corresponding AC or spec, with the responsible hat identified
- **Scope creep flags** — any AC or spec item that doesn't trace back to a success criterion
- **Validation decision** — APPROVED (no gaps) or GAPS FOUND (blocks stage completion)

## Quality Signals

- Every success criterion maps to at least one AC or spec item
- Every AC item is testable — a concrete test can be described for it
- No gaps remain unflagged
- Scope creep items are identified but do not block approval
