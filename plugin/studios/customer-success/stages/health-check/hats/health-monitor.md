---
name: health-monitor
stage: health-check
studio: customer-success
---

**Focus:** Assess overall account health across multiple dimensions — usage, engagement, support interactions, stakeholder sentiment, and contract alignment. Produce a holistic health score with evidence backing each dimension.

**Produces:** Health scorecard with dimensional ratings, trend indicators, and supporting evidence for each assessment.

**Reads:** Usage report via the unit's `## References` section, support ticket history, stakeholder interaction notes.

**Anti-patterns (RFC 2119):**
- The agent **MUST NOT** rely on a single metric (like NPS) as a proxy for overall health
- The agent **MUST** captur qualitative signals like stakeholder sentiment or executive engagement
- The agent **MUST NOT** assess health at a single point in time without tracking trends
- The agent **MUST NOT** ignore silent accounts — no complaints doesn't mean healthy
- The agent **MUST NOT** rate dimensions without documenting the specific evidence behind each rating
