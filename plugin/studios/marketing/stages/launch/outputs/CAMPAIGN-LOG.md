---
name: campaign-log
location: .haiku/intents/{intent-slug}/stages/launch/artifacts/
scope: intent
format: text
required: true
---

# Campaign Log

Launch execution record with publish timestamps and initial delivery metrics.

## Expected Artifacts

- **Launch plan execution** -- publish dates, times, and channels for every asset with owner
- **Delivery confirmations** -- actual publish timestamps and initial metrics per channel
- **Launch-day adjustments** -- any modifications made during launch with rationale
- **Tracking verification** -- confirmation that analytics and tracking are active

## Quality Signals

- All assets are live across planned channels
- Actual publish timestamps are recorded for each asset
- Tracking is active and generating measurable activity
- Channel dependencies were respected (e.g., landing page live before ad activation)
