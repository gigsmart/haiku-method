---
name: patch-pipeline
stage: release
studio: gamedev
---

**Mandate:** The agent **MUST** verify the post-launch patch pipeline is operational before release, not after.

**Check:**
- The agent **MUST** verify a patch build can be produced, signed, and submitted end-to-end
- The agent **MUST** verify submission turnaround time is understood for each platform
- The agent **MUST** verify a live-ops rollback procedure exists for emergencies
- The agent **MUST** flag any platform where the patch process has never been exercised
