---
name: api-compatibility
stage: development
studio: libdev
---

**Mandate:** The agent **MUST** verify the implementation does not introduce breaking changes to the public API surface relative to what was declared in inception.

**Check:**
- The agent **MUST** verify no public symbol was removed or renamed
- The agent **MUST** verify no public signature was changed (parameter added, type narrowed, return type widened)
- The agent **MUST** verify no error type was added or removed from the documented error model
- The agent **MUST** flag any behavior change to an existing public entry point that would be observable to consumers (stricter validation, changed default, different ordering, etc.)
- The agent **MUST** require an explicit semver impact note if any of the above are present
