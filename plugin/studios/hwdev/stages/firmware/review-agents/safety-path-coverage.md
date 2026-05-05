---
model: opus
interpretation: lens
---
**Mandate:** The agent **MUST** verify every safety-critical code path identified in the safety analysis is implemented and tested.

**Check:**
- The agent **MUST** verify each hazard's mitigation has corresponding firmware code
- The agent **MUST** verify each fail-safe behavior is **testable** — i.e., the code exposes the seam (deterministic entry point, injectable fault, observable output) that the validation stage will need to exercise it. Whether the test actually exists and passes is the **validation stage's** check, not firmware's.
- The agent **MUST** flag any hazard whose mitigation was assumed to be hardware-only but actually depends on firmware
- The agent **MUST** verify watchdog, fault-handler, and error-recovery paths are implemented
