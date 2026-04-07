---
name: review
description: Review documentation for accuracy, clarity, and completeness
hats: [editor, subject-matter-expert]
review: ask
unit_types: [review]
inputs:
  - stage: draft
    discovery: draft-documentation
---

# Review

## Criteria Guidance

Good criteria examples:
- "Every technical claim is verified against the running system or source code"
- "Review identifies ambiguous instructions and provides specific rewording suggestions"
- "Consistency check confirms terminology matches the project glossary throughout"

Bad criteria examples:
- "Review is done"
- "Content is accurate"
- "Feedback is given"

## Completion Signal (RFC 2119)

Review report **MUST** exist with findings categorized by type (accuracy, clarity, completeness, consistency). Each finding includes severity, the specific problem, and a concrete fix. The subject-matter-expert **MUST** have validated technical correctness. Report includes a verdict: approve, revise, or reject.
