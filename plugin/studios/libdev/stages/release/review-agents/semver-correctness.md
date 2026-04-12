---
name: semver-correctness
stage: release
studio: libdev
---

**Mandate:** The agent **MUST** verify the release version number correctly reflects the semver impact of changes since the prior release.

**Check:**
- The agent **MUST** diff the current API surface against the prior released version
- The agent **MUST** verify a major bump is used when the diff contains any removed, renamed, or signature-changed public symbol
- The agent **MUST** verify a major bump is used when error types were removed or their meaning changed
- The agent **MUST** verify a minor bump is used for additions-only changes
- The agent **MUST** verify a patch bump is used only when no public API changed
- The agent **MUST** flag any behavior change to an existing API that would be observable and require a major bump even if signatures are unchanged
