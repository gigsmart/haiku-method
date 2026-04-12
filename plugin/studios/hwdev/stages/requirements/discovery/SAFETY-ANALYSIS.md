---
name: safety-analysis
location: .haiku/intents/{intent-slug}/knowledge/SAFETY-ANALYSIS.md
scope: intent
format: text
required: true
---

# Safety Analysis

Hazard identification, failure modes, and regulatory compliance map for the product.

## Content Guide

### Applicable Regulatory Frameworks
Enumerated per target market: FCC/CE/UL/FDA/IC/RoHS/REACH/WEEE/IEC and any industry-specific standards. For each: certification path, test lab candidates, rough cost, and timeline.

### Hazard Analysis
For each identified hazard:
- **Hazard description** — what can go wrong
- **Likelihood** — how often, under what conditions
- **Severity** — consequence if it occurs
- **Mitigation** — how design, firmware, or user interface prevents or handles it
- **Residual risk** — what remains after mitigation

### Failure Modes
- Electrical failure modes (shorts, opens, overcurrent, ESD)
- Mechanical failure modes (drop, vibration, ingress)
- Thermal failure modes (overheat, thermal runaway)
- Software failure modes (hang, crash, bad state)
- Per failure mode: fail-safe behavior

### Standards to Design Against
Specific standards the product must meet with section references where relevant.

## Quality Signals

- Every target market has its applicable frameworks identified
- Every hazard has severity, likelihood, and mitigation
- Fail-safes are specified, not hoped for
- Cert cost and timeline are estimated, not deferred
