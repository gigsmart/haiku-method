---
name: negotiate
description: Negotiate terms and review contract provisions
hats: [negotiator, legal-reviewer]
review: external
unit_types: [negotiation, contract-review]
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

## Completion Signal

Negotiation terms exist with agreed pricing, contract provisions reviewed, and SLA terms defined. Negotiator has confirmed terms meet budget and business requirements. Legal-reviewer has identified and addressed all material risk provisions with acceptable terms or documented risk acceptance.
