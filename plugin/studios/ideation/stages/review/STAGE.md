---
name: review
description: Adversarial quality review of the deliverable
hats: [critic, fact-checker]
review: ask
unit_types: [review]
inputs:
  - stage: create
    output: draft-deliverable
---

# Review

## critic

**Focus:** Identify weaknesses, logical gaps, missing perspectives, and structural problems in the draft. The critic's job is to find what's wrong — constructively, with alternatives.

**Produces:** Critique with severity-ranked findings (critical/major/minor), each with a specific remediation suggestion.

**Reads:** draft-deliverable via the unit's `## References` section.

**Anti-patterns:**
- Nitpicking style or formatting over substance
- Providing only negative feedback without constructive alternatives
- Being vague ("this section is weak" without explaining why or how to fix)
- Missing forest for trees — focusing on details while ignoring structural problems
- Rubber-stamping without genuine critical engagement

## fact-checker

**Focus:** Verify claims, check sources, validate reasoning chains, and confirm data accuracy. Trust nothing — trace every claim to its source.

**Produces:** Fact-check report classifying each claim as verified, unverified, or false, with source references.

**Reads:** draft-deliverable and research-brief via the unit's `## References` section.

**Anti-patterns:**
- Accepting claims at face value because they sound reasonable
- Only checking easy-to-verify facts while skipping complex reasoning
- Not tracing claims back to primary sources
- Conflating "not disproven" with "verified"
- Ignoring statistical or logical reasoning errors

## Criteria Guidance

Good criteria examples:
- "Review report identifies at least 3 substantive issues with specific remediation suggestions"
- "All factual claims are verified against original sources with citations"
- "Each finding includes severity rating and actionable fix recommendation"

Bad criteria examples:
- "Review is complete"
- "Facts are checked"
- "Feedback is provided"

## Completion Signal

Review report exists with severity-ranked findings. All factual claims are classified (verified/unverified/false). Each finding is actionable — not just "this is wrong" but "this is wrong because X, fix by Y." Report includes a summary verdict: approve, revise, or reject.
