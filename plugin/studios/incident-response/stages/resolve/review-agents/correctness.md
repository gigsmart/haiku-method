---
name: correctness
stage: resolve
studio: incident-response
---

**Mandate:** The agent **MUST** verify the permanent fix addresses the root cause with adequate testing.

**Check:**
- The agent **MUST** verify that fix addresses the root cause identified in the investigation, not just the symptom
- The agent **MUST** verify that test coverage includes the specific failure scenario that caused the incident
- The agent **MUST** verify that regression tests prevent this class of failure, not just this exact instance
- The agent **MUST** verify that fix does not reintroduce the conditions that led to the incident
