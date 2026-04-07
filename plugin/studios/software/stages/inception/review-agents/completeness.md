---
name: completeness
stage: inception
studio: software
---

**Mandate:** The agent **MUST** verify the discovery document fully maps the problem space and that unit elaboration covers the intent with no gaps or overlaps.

**Check:**
- The agent **MUST** verify that every entity, relationship, and technical constraint from the intent is addressed in the discovery document
- The agent **MUST** verify that all units have verifiable completion criteria (specific commands or tests, not vague assertions)
- The agent **MUST** verify that unit DAG is acyclic with no orphans — every unit either produces inputs for another or delivers a final output
- The agent **MUST** verify that no unit is too large for a single bolt cycle
- The agent **MUST** verify that no critical path is missing (e.g., auth, data migration, error handling)
