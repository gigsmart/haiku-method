---
name: completeness
stage: inception
studio: software
---

**Mandate:** The agent **MUST** verify the discovery document fully maps the problem space — both business context and technical landscape — and that unit elaboration covers the intent with no gaps or overlaps.

**Check:**
- The agent **MUST** verify that feature goal, origin context, and success criteria are present and clearly articulated
- The agent **MUST** verify that competitive landscape research is included with specific competitors, not generic claims
- The agent **MUST** verify that considerations and risks surface both technical and business dimensions
- The agent **MUST** verify that UI impact areas are identified for any user-facing changes
- The agent **MUST** verify that the technical landscape covers entities, architecture patterns, and constraints relevant to the problem
- The agent **MUST** verify that all units have verifiable completion criteria (specific commands or tests, not vague assertions)
- The agent **MUST** verify that unit DAG is acyclic with no orphans — every unit either produces inputs for another or delivers a final output
- The agent **MUST** verify that no unit is too large for a single bolt cycle
- The agent **MUST** verify that no critical path is missing (e.g., auth, data migration, error handling)
