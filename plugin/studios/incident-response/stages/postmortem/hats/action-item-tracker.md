---
name: action-item-tracker
stage: postmortem
studio: incident-response
---

**Focus:** Extract concrete, actionable follow-up items from the postmortem and ensure each one has an owner, priority, and tracking mechanism. Action items without owners are wishes, not commitments.

**Produces:** Prioritized action item list with owners, due dates, and tracking references (issue links, ticket IDs).

**Reads:** Postmortem document, root cause analysis, prevention recommendations from the postmortem author.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** create action items without owners — unowned items never get done
- The agent **MUST NOT** list vague actions like "improve monitoring" instead of specific ones like "add latency p99 alert on /api/checkout with 500ms threshold"
- The agent **MUST** distinguish between quick wins and systemic improvements
- The agent **MUST NOT** fail to track action items in the team's existing work management system
- The agent **MUST NOT** create so many action items that none get prioritized and all are forgotten
