---
name: manufacturability
stage: design
studio: hwdev
---

**Mandate:** The agent **MUST** verify the design can be manufactured at target volume without custom tooling or exotic processes.

**Check:**
- The agent **MUST** verify the PCB stack-up and trace widths declared in the [tscircuit](https://tscircuit.com) board config are within fab capability
- The agent **MUST** verify DRC is clean in the tscircuit preview, and **MUST** also run a Gerber-level DRC against the committed exports (catches stale exports that no longer match source as well as fab-house-specific rules tscircuit doesn't model)
- The agent **MUST** verify the committed Gerbers, drill, and pick-and-place files regenerate identically from the current tscircuit source
- The agent **MUST** verify the enclosure design supports the assembly process (draft angles, wall thickness, fastener access)
- The agent **MUST** verify BOM components (as exported from tscircuit) are available at target volume
- The agent **MUST** flag any design choice that requires hand-assembly when automated assembly was assumed
