---
name: negotiation
description: Handle objections, negotiate terms, and align stakeholders
hats: [negotiator, legal-reviewer]
review: [ask, await]
unit_types: [negotiation, contract]
inputs:
  - stage: proposal
    discovery: proposal-doc
---

# Negotiation

## Criteria Guidance

Good criteria examples:
- "Objection handling document addresses each raised concern with evidence-based responses and fallback positions"
- "Contract redlines are categorized by risk level with recommended accept/reject/counter for each"
- "Stakeholder alignment matrix shows each decision-maker's current position and required actions to move them forward"

Bad criteria examples:
- "Objections are handled"
- "Terms are negotiated"
- "Stakeholders are aligned"

## Completion Signal (RFC 2119)

Negotiation terms document **MUST** exist with all objections addressed, contract terms agreed or escalated, and stakeholder positions documented. Legal reviewer **MUST** have flagged risk items and confirmed acceptable terms. Both parties have a shared understanding of terms ready for final approval.
