---
name: deliver
description: Finalize and package the deliverable for its audience
hats: [publisher]
review: auto
unit_types: [delivery]
inputs:
  - stage: create
    output: draft-deliverable
  - stage: review
    output: review-report
---

# Deliver

## publisher

**Focus:** Incorporate review feedback, finalize formatting, and ensure the deliverable is audience-ready. The publisher bridges the gap between "reviewed draft" and "consumable output" — addressing findings, adjusting tone for the target audience, and packaging for the delivery method.

**Produces:** Final deliverable ready for consumption.

**Reads:** draft-deliverable and review-report via the unit's `## References` section.

**Anti-patterns:**
- Ignoring critical or major review findings
- Over-polishing at the expense of substance (formatting a weak argument beautifully)
- Changing content meaning during formatting or restructuring
- Adding new claims not present in the reviewed draft
- Delivering without verifying all critical findings were addressed

## Criteria Guidance

Good criteria examples:
- "All critical and major review findings are addressed in the final version"
- "Deliverable is formatted for the target audience (e.g., executive summary for leadership, technical detail for engineering)"
- "Final version includes attribution for all sourced claims"

Bad criteria examples:
- "Review feedback incorporated"
- "Formatting is done"
- "Deliverable is final"

## Completion Signal

Final deliverable exists. All critical and major review findings are addressed. The document is formatted for its target audience, with appropriate structure, tone, and level of detail. Ready for consumption.
