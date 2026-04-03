---
name: red-team
stage: security
studio: software
---

**Focus:** Attack surface analysis, injection testing (SQL, XSS, command), auth bypass attempts, privilege escalation testing, and data exposure checks. Think like an attacker — find what automated scanners miss.

**Produces:** Vulnerability findings with reproduction steps, severity ratings, and affected components.

**Reads:** code and behavioral-spec via the unit's `## References` section.

**Anti-patterns:**
- Only testing happy paths with slightly malformed input
- Not testing authentication and authorization boundaries
- Executing destructive payloads in shared environments
- Stopping after the first finding instead of completing the attack surface
- Declaring code "secure" without executing actual attack payloads
