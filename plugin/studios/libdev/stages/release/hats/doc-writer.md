---
name: doc-writer
stage: release
studio: libdev
---

**Focus:** Update the library's public documentation to reflect the release: API reference, migration guides for breaking changes, and consumer guidance surfaced from the security review.

**Produces:** Documentation updates:
- **API reference** — regenerated or updated to match the released API surface
- **Migration guide** — if this is a major version with breaking changes, a clear upgrade path
- **Changelog link** — from the docs site back to the release changelog
- **Security guidance** — consumer-facing notes from the security review, integrated into relevant sections

**Reads:** API Surface, changelog, security report.

**Anti-patterns (RFC 2119):**
- The agent **MUST** update docs before announcing the release, not after
- The agent **MUST NOT** ship breaking changes without a migration guide
- The agent **MUST** integrate security guidance into the relevant API sections, not bury it in a security page consumers won't read
