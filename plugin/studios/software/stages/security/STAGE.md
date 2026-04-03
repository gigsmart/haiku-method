---
name: security
description: Threat modeling, security review, and vulnerability assessment
hats: [threat-modeler, red-team, blue-team, security-reviewer]
review: [external, ask]
unit_types: [security, backend]
inputs:
  - stage: product
    output: behavioral-spec
  - stage: development
    output: code
---

# Security

## threat-modeler

**Focus:** STRIDE threat modeling for all data flows and trust boundaries. Identify the attack surface, categorize threats by severity, and map what needs defending before anyone starts testing.

**Produces:** Threat model with identified threats, risk ratings, attack vectors, and required mitigations per trust boundary.

**Reads:** behavioral-spec and code via the unit's `## References` section.

**Anti-patterns:**
- Only modeling external threats — insider threats and supply chain attacks matter too
- Not mapping trust boundaries (where does trusted data become untrusted?)
- Treating threat modeling as a checklist rather than analytical thinking
- Ignoring data flows between internal services
- Rating everything as "medium" to avoid making hard calls

## red-team

**Focus:** Attack surface analysis, injection testing (SQL, XSS, command), auth bypass attempts, privilege escalation testing, and data exposure checks. Think like an attacker — find what automated scanners miss.

**Produces:** Vulnerability findings with reproduction steps, severity ratings, and affected components.

**Reads:** code and behavioral-spec via the unit's `## References` section.

**Anti-patterns:**
- Only testing happy paths with slightly malformed input
- Not testing authentication and authorization boundaries
- Executing destructive payloads in shared environments
- Stopping after the first finding instead of completing the attack surface
- Declaring code "secure" without executing actual attack payloads

## blue-team

**Focus:** Defense verification — implement security controls for identified threats, add security tests that prove the controls work, and validate monitoring coverage for security events. Fix root causes, not symptoms.

**Produces:** Mitigations with tests proving effectiveness, updated monitoring for security events.

**Reads:** Red-team findings and code via the unit's `## References` section.

**Anti-patterns:**
- Patching the specific payload used in testing instead of the vulnerability class
- Not adding regression tests that reproduce the original attack
- Implementing security controls without testing them
- Choosing functionality over security without explicit human approval
- Treating WAF rules as sufficient without fixing the underlying code

## security-reviewer

**Focus:** Verify all identified threats have documented mitigations, check OWASP Top 10 coverage, validate security test coverage, and ensure no critical or high findings remain unaddressed. The final gate before security sign-off.

**Produces:** Security review verdict — approve or request changes — with coverage assessment.

**Reads:** Threat model, vulnerability findings, mitigations, and security tests.

**Anti-patterns:**
- Approving with unaddressed high-severity findings
- Not cross-referencing OWASP Top 10 categories
- Trusting mitigation claims without verifying that tests exist and pass
- Treating the security review as a formality rather than a genuine gate

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
