---
name: resource-budget
stage: firmware
studio: hwdev
---

**Mandate:** The agent **MUST** verify the firmware fits within memory, flash, and power budgets with headroom for future updates.

**Check:**
- The agent **MUST** verify flash usage is under target (with documented headroom)
- The agent **MUST** verify RAM usage is under target for peak load
- The agent **MUST** verify power consumption matches the functional requirements envelope
- The agent **MUST** flag any build that leaves insufficient headroom for OTA updates
