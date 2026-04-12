---
name: release-artifacts
location: (registry + git tag)
scope: repo
format: artifact
required: true
---

# Release Artifacts

The published outputs of a library release: the version tag, the registry publication, the changelog entry, and the updated documentation. This is not a document in the intent directory; it is the state of the outside world after release.

## Content Guide

A release is complete when:
- **Registry publication** is live and installable by consumers (`npm install foo@X.Y.Z`, `pip install foo==X.Y.Z`, etc.)
- **Git tag** exists matching the published version and points at the commit that was built
- **Changelog** in the repo reflects the release with all user-visible changes
- **Documentation site** reflects the released version (if the project has one)
- **Migration guide** exists for any breaking change

## Quality Signals

- The published artifact matches the commit at the git tag
- The version in the registry matches the version in the changelog
- Consumers can install and run a hello-world example of the new version without further steps
- The release announcement (if any) links to changelog and migration guide
