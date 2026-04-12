---
name: requirements
description: Functional, safety, and regulatory requirements
hats: [systems-engineer, compliance-officer, elaborator]
review: [external, ask]
elaboration: collaborative
unit_types: [requirements]
inputs:
  - stage: inception
    discovery: discovery
---

# Requirements

Capture functional specifications (what the product does), safety requirements
(hazard analysis, failure modes, fail-safes), and regulatory compliance
obligations (FCC, CE, UL, FDA, RoHS, REACH depending on product class and
target markets). These constrain every downstream decision — treat them as
hard gates, not suggestions.

Regulatory frameworks cannot be retrofitted. A product that wasn't designed
for FCC compliance will fail cert, and fixing it means redesigning the PCB.
Get the framework right here.

## Completion Signal (RFC 2119)

Functional requirements **MUST** be specified and traceable. Safety analysis
**MUST** be documented with identified hazards and mitigations. Applicable
regulatory frameworks **MUST** be identified with certification paths and
estimated cost.
