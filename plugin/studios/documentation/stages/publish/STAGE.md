---
name: publish
description: Format, validate links, and publish the documentation
hats: [publisher]
review: auto
elaboration: autonomous
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

Format, validate links, and publish the documentation.
