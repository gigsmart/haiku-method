---
name: publish
description: Format, validate links, and publish the documentation
hats: [publisher]
review: auto
elaboration: autonomous
unit_types: [delivery]
inputs:
  - stage: draft
    discovery: draft-documentation
  - stage: review
    discovery: review-report
review-agents-include:
  - stage: draft
    agents: [accuracy]
---

# Publish

## Criteria Guidance

Good criteria examples:
- "All internal and external links resolve to valid targets"
- "All critical and major review findings are addressed in the final version"
- "Documentation renders correctly in the target platform (site, wiki, PDF)"

Bad criteria examples:
- "Documentation is published"
- "Links work"
- "Formatting is done"

## Completion Signal (RFC 2119)

Final documentation **MUST** exist with all review findings addressed. Links **MUST** be validated. Formatting is correct for the target platform. Metadata (title, description, last-updated date) is populated. Documentation is published or staged for publication.
