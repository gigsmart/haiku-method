---
name: release
description: Publish, changelog, documentation, and deprecation policy
hats: [release-engineer, doc-writer]
review: auto
elaboration: autonomous
inputs:
  - stage: inception
    discovery: discovery
  - stage: inception
    discovery: api-surface
  - stage: development
    output: code
---

# Release

Publishing to the target registry (npm, PyPI, crates.io, Maven Central, etc.),
generating changelogs, updating the documentation site, and managing the
deprecation lifecycle. Libraries don't deploy — they publish. There is no
on-call, no rollback in the traditional sense; a broken release means a new
patch version, not a redeployment.
