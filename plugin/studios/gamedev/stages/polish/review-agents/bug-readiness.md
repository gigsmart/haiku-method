---
name: bug-readiness
stage: polish
studio: gamedev
---

**Mandate:** The agent **MUST** verify the build is free of bugs that would block certification or severely degrade the player experience before release.

**Check:**
- The agent **MUST** verify no P0 bugs remain open
- The agent **MUST** verify P1 bugs are either resolved or explicitly accepted as known issues with justification
- The agent **MUST** verify bug fixes were verified on the actual release build, not a dev branch
- The agent **MUST** flag any regression introduced during polish
