---
name: performance
stage: development
studio: software
---

**Mandate:** The agent **MUST** identify performance regressions or inefficiencies in the implementation.

**Check:**
- The agent **MUST** verify that no N+1 query patterns or unbounded data fetches
- The agent **MUST** verify that database queries use appropriate indexes (check against schema)
- The agent **MUST** verify that large collections are paginated, not loaded entirely into memory
- The agent **MUST** verify that no blocking operations on hot paths
- The agent **MUST** verify that caching is used where specified, with correct invalidation
- The agent **MUST** verify that bundle size impact is reasonable for frontend changes
