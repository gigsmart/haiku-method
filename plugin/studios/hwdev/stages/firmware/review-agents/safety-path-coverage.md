---
name: safety-path-coverage
stage: firmware
studio: hwdev
---

**Mandate:** The agent **MUST** verify every safety-critical code path identified in the safety analysis is implemented and tested.

**Check:**
- The agent **MUST** verify each hazard's mitigation has corresponding firmware code
- The agent **MUST** verify each fail-safe behavior has a test exercising it
- The agent **MUST** flag any hazard whose mitigation was assumed to be hardware-only but actually depends on firmware
- The agent **MUST** verify watchdog, fault-handler, and error-recovery paths are implemented
