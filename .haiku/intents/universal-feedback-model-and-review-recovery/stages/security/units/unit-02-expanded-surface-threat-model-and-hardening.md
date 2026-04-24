---
title: Expanded surface threat model and hardening
type: security
depends_on:
  - unit-01-threat-model-and-hardening
quality_gates:
  - typecheck
  - test
inputs:
  - knowledge/DISCOVERY.md
  - knowledge/DATA-CONTRACTS.md
  - knowledge/ARCHITECTURE.md
  - stages/security/THREAT-MODEL.md
status: completed
bolt: 1
hat: threat-modeler
started_at: '2026-04-24T00:00:00Z'
outputs:
  - stages/security/artifacts/threat-model-expanded.md
  - stages/security/artifacts/assessments.md
completed_at: '2026-04-24T14:23:53Z'
---

# Expanded Surface Threat Model and Hardening

Extend the unit-01 threat model to cover the surfaces that became real during development stage implementation: the review SPA security model, tunnel JWT authentication (FB-20, FB-30, FB-36), additive elaborate mode with `closes: [FB-NN]` validation, `haiku_revisit` with reasons as an injection surface, insider threats, and supply chain risks. Update the assessments artifact with findings from this expanded analysis.

## Completion Criteria

### Expanded Threat Model
- THREAT-MODEL-EXPANDED.md exists at `stages/security/THREAT-MODEL-EXPANDED.md`
- Covers trust boundaries not in unit-01: SPA ↔ HTTP server, tunnel proxy ↔ HTTP server, subagent ↔ MCP server
- STRIDE analysis for: review SPA XSS/CSRF surface, tunnel JWT (FB-30), session header guard (FB-20), origin-checked CORS (FB-36), additive elaborate mode validation, revisit-reasons injection
- Insider threat analysis: developer with direct filesystem access
- Supply chain analysis: gray-matter, zod, MCP SDK
- Each threat: description, likelihood, impact, mitigation, verification evidence

### Assessments Updated
- `stages/security/artifacts/assessments.md` updated with new findings from this unit
- All findings from expanded analysis have either mitigation status or open risk rating
- Test coverage listed for each new surface

### No new unmitigated HIGH-severity threats
- Any HIGH findings are either mitigated with test evidence or surfaced as explicit open risks for the team
