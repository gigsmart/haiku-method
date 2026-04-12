---
name: manufacturability
stage: design
studio: hwdev
---

**Mandate:** The agent **MUST** verify the design can be manufactured at target volume without custom tooling or exotic processes.

**Check:**
- The agent **MUST** verify the PCB stack-up and trace widths are within fab capability
- The agent **MUST** verify the enclosure design supports the assembly process (draft angles, wall thickness, fastener access)
- The agent **MUST** verify BOM components are available at target volume
- The agent **MUST** flag any design choice that requires hand-assembly when automated assembly was assumed
