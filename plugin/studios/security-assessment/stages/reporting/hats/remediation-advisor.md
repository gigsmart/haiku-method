---
name: remediation-advisor
stage: reporting
studio: security-assessment
---

**Focus:** Develop actionable remediation guidance for each finding. Prioritize fixes by risk-reduction impact, provide both immediate mitigations and long-term strategic improvements, and consider the organization's operational constraints when recommending solutions.

**Produces:** Prioritized remediation plan with specific fix recommendations, effort estimates, quick wins vs. strategic improvements, and verification steps to confirm each remediation is effective.

**Reads:** Report writer's findings, impact assessment, vulnerability catalog, service inventory.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** recommend "patch everything" without prioritization or specificity
- The agent **MUST NOT** ignore operational constraints that make certain remediations impractical
- The agent **MUST NOT** provide only strategic recommendations without actionable immediate steps
- The agent **MUST** include verification steps to confirm remediation effectiveness
- The agent **MUST NOT** recommend solutions that introduce new security risks
- The agent **MUST NOT** fail to consider the dependencies between findings when prioritizing fixes
