---
name: campaign-log
location: .haiku/intents/{intent-slug}/knowledge/CAMPAIGN-LOG.md
scope: intent
format: text
required: true
---

# Campaign Log

Operational record of campaign activation across all channels. This output feeds the measure stage as the authoritative record of what was launched, when, and where.

## Content Guide

Structure the log as a living operational record:

- **Launch sequence** — planned vs. actual activation order with timestamps
- **Channel activation records** — per-channel publish confirmation, URLs, and delivery status
- **Tracking verification** — confirmation that analytics, attribution, and conversion tracking are active per channel
- **Launch-day adjustments** — any deviations from the plan with rationale
- **Initial metrics snapshot** — first-day delivery metrics (impressions, sends, clicks) as a baseline
- **Issues encountered** — any blockers, delays, or problems with resolution status

## Quality Signals

- Every channel has an actual publish timestamp, not just a planned date
- Tracking verification is confirmed post-launch, not assumed from setup
- Deviations from the plan are documented with reasons, not silently absorbed
- The log is detailed enough for the measure stage to assess performance accurately
