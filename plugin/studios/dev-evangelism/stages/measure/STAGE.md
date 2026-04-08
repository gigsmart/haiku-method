---
name: measure
description: Track engagement, gather feedback, identify follow-up opportunities
hats: [analyst, feedback-synthesizer]
review: auto
elaboration: autonomous
unit_types: [measurement]
inputs:
  - stage: publish
    discovery: distribution-log
---

# Measure

## Criteria Guidance

Good criteria examples:
- "Impact report compares actual engagement metrics against targets with variance analysis per channel"
- "Feedback synthesis categorizes developer responses into actionable themes with sentiment analysis"
- "Follow-up recommendations are prioritized by potential impact and effort"

Bad criteria examples:
- "Metrics are tracked"
- "Feedback is gathered"
- "Report is written"

## Completion Signal (RFC 2119)

Impact report **MUST** exist with engagement metrics vs. targets, channel-level breakdown, and audience segment analysis. Analyst **MUST** have identified top-performing content with specific drivers of success. Feedback synthesizer **MUST** have categorized community feedback into themes and produced prioritized follow-up recommendations with projected reach.
