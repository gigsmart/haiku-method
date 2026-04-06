---
name: security
description: Threat modeling, security review, and vulnerability assessment
hats: [threat-modeler, red-team, blue-team, security-reviewer]
review: [external, ask]
unit_types: [security, backend]
inputs:
  - stage: inception
    discovery: discovery
  - stage: product
    discovery: behavioral-spec
  - stage: product
    discovery: data-contracts
  - stage: development
    output: code
  - stage: development
    discovery: architecture
review-agents-include:
  - stage: development
    agents: [security, architecture]
  - stage: operations
    agents: [reliability]
gate-protocol:
  timeout: 72h
  timeout-action: escalate
  escalation: comms
  conditions:
    - "no HIGH findings from review agents"
---

# Security

## Criteria Guidance

Good criteria examples:
- "OWASP Top 10 coverage verified: each category has at least one test or documented N/A justification"
- "All SQL queries use parameterized statements — verified by grep for string concatenation in query construction"
- "Authentication tokens expire after 1 hour and refresh tokens after 30 days, verified by test"
- "All user input is validated at the API boundary before reaching business logic"

Bad criteria examples:
- "Security review done"
- "No SQL injection"
- "Auth is secure"

## Completion Signal

All identified threats have documented mitigations. Security tests cover the attack surface. No critical or high findings remain unaddressed. OWASP Top 10 coverage verified with evidence. Security reviewer has approved.
