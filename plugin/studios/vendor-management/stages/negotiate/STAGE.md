---
name: negotiate
description: Negotiate terms and review contract provisions
hats: [negotiator, legal-reviewer]
review: external
elaboration: collaborative
inputs:
  - stage: evaluate
    discovery: vendor-scorecard
  - stage: requirements
    discovery: rfp-document
---

# Negotiate

## Criteria Guidance

Good criteria examples:
- "Negotiation terms document captures agreed pricing with comparison to initial quote and market benchmarks"
- "Contract review identifies all risk clauses with recommended modifications and fallback positions"
- "SLA terms are specific with measurable thresholds, measurement methods, and remedies for non-compliance"

Bad criteria examples:
- "Terms are negotiated"
- "Contract is reviewed"
- "Price is agreed"

## Completion Signal (RFC 2119)

Negotiation terms exist with agreed pricing, contract provisions reviewed, and SLA terms defined. Negotiator **MUST** have confirmed terms meet budget and business requirements. Legal-reviewer **MUST** have identified and addressed all material risk provisions with acceptable terms or documented risk acceptance.
