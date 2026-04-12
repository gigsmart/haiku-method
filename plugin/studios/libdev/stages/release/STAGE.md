---
name: release
description: Publish, changelog, documentation, and deprecation policy
hats: [release-engineer, doc-writer]
review: auto
elaboration: autonomous
unit_types: [release]
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

## Completion Signal (RFC 2119)

Changelog **MUST** be updated with all user-visible changes. Version **MUST**
follow semver based on API surface changes. Documentation site **MUST**
reflect the released version. Deprecated APIs **MUST** have migration
guidance and a removal timeline.
