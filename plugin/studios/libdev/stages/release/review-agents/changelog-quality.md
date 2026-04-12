---
name: changelog-quality
stage: release
studio: libdev
---

**Mandate:** The agent **MUST** verify the changelog entry for this release is complete, accurate, and useful to consumers deciding whether to upgrade.

**Check:**
- The agent **MUST** verify every public API change has a changelog line
- The agent **MUST** verify breaking changes are clearly marked (e.g., under a "Breaking" section or with a badge)
- The agent **MUST** verify security-relevant changes are labeled
- The agent **MUST** verify entries describe the change in consumer terms, not internal refactoring language
- The agent **MUST** verify the changelog follows the project's prior format (Keep a Changelog, custom, etc.)
