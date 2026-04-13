---
name: review
description: Adversarial quality review of the deliverable
hats: [critic, fact-checker]
review: ask
elaboration: autonomous
inputs:
  - stage: create
    discovery: draft-deliverable
---

# Review

## Criteria Guidance

Good criteria examples:
- "Review report identifies at least 3 substantive issues with specific remediation suggestions"
- "All factual claims are verified against original sources with citations"
- "Each finding includes severity rating and actionable fix recommendation"

Bad criteria examples:
- "Review is complete"
- "Facts are checked"
- "Feedback is provided"

## Completion Signal (RFC 2119)

Review report **MUST** exist with severity-ranked findings. All factual claims are classified (**MUST** be verified/unverified/false). Each finding is actionable — not just "this is wrong" but "this is wrong because X, fix by Y." Report includes a summary verdict: approve, revise, or reject.
