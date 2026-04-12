---
name: coverage
stage: validation
studio: hwdev
---

**Mandate:** The agent **MUST** verify validation covers every functional requirement and every hazard from the safety analysis.

**Check:**
- The agent **MUST** verify every functional requirement has a passing test
- The agent **MUST** verify every hazard mitigation has a test exercising the fail-safe
- The agent **MUST** verify environmental testing covered the full specified envelope
- The agent **MUST** flag any requirement or hazard without test coverage
