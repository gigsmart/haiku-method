---
name: cert-readiness
stage: release
studio: gamedev
---

**Mandate:** The agent **MUST** verify the build meets every platform certification requirement before submission. Failed cert wastes days or weeks of the launch window.

**Check:**
- The agent **MUST** verify every line item on each platform's TRC/XR/lotcheck checklist
- The agent **MUST** verify required metadata (age ratings, content descriptors, accessibility) is complete
- The agent **MUST** verify required icons, loading screens, and platform-specific UI are present
- The agent **MUST** flag any platform-specific feature that was skipped (e.g., achievements on Xbox, trophies on PlayStation)
