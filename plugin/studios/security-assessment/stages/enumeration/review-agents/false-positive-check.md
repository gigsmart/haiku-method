---
name: false-positive-check
stage: enumeration
studio: security-assessment
---

**Mandate:** The agent **MUST** verify vulnerability findings are real, not scanner noise.

**Check:**
- The agent **MUST** verify that each finding has been manually verified or has strong confidence indicators
- The agent **MUST** verify that version-based detections are confirmed against actual behavior, not just banners
- The agent **MUST** verify that scanner findings are correlated across tools to reduce false positives
- The agent **MUST** verify that severity ratings reflect exploitability in this specific environment
