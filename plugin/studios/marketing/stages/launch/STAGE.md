---
name: launch
description: Coordinate multi-channel launch, schedule distribution, and activate campaigns
hats: [campaign-manager, channel-coordinator]
review: ask
elaboration: autonomous
inputs:
  - stage: content
    discovery: assets
---

# Launch

## Criteria Guidance

Good criteria examples:
- "Launch plan specifies publish dates, times, and channels for every asset with owner assigned"
- "Distribution sequence accounts for channel dependencies (e.g., landing page live before ad activation)"
- "Campaign log records actual publish timestamps and initial delivery metrics for each channel"

Bad criteria examples:
- "Campaign is launched"
- "Assets are distributed"
- "Schedule is set"

## Completion Signal (RFC 2119)

Launch plan is executed across all channels. Campaign log records actual publish timestamps, initial delivery confirmations, and any launch-day adjustments. Channel coordinator **MUST** have **MUST** be verified all assets are live and tracking is active. Campaign is running and generating measurable activity.
