---
name: release
description: Storefront submission, platform certification, and patch pipeline
hats: [release-engineer, platform-cert-specialist]
review: await
elaboration: autonomous
unit_types: [release]
inputs:
  - stage: polish
    output: game-build
---

# Release

Submit to storefronts (Steam, console platforms, mobile stores), pass platform
certification, and stand up the post-launch patch pipeline. Platform-specific
requirements vary wildly — console cert is a hard gate that can fail for
reasons unrelated to the game's quality, mobile stores have their own review
cycles, and Steam has its own submission cadence.

The patch pipeline matters as much as the initial submission. Games ship
with bugs; the ability to ship a hotfix within days is what separates a
launch disaster from a launch hiccup.

## Completion Signal (RFC 2119)

Build **MUST** pass platform certification for every target platform.
Storefront assets (screenshots, trailers, descriptions) **MUST** be complete.
Patch pipeline **MUST** be operational and tested before launch day.
