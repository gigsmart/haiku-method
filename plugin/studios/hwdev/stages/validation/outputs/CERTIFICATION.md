---
name: certification
location: .haiku/intents/{intent-slug}/knowledge/CERTIFICATION.md
scope: intent
format: text
required: true
---

# Certification

Record of all regulatory certifications obtained for the product and the underlying test evidence.

## Content Guide

### Certifications Obtained
Per regulatory framework:
- Framework name and target market
- Cert lab and cert document reference
- Date of certification
- Expiration (if applicable)
- Scope of cert (which product variants, which firmware versions)

### Functional Validation
- Test plan coverage against functional requirements
- Pass/fail per requirement
- Open findings and their status

### Environmental Validation
- Envelope tested vs. envelope specified
- Pass/fail per test type (temp, humidity, vibration, ESD, drop)
- Open findings and their status

### HIL Results
- Test rig configuration
- Test execution reports
- Regression trend

## Quality Signals

- Every functional requirement has a linked validation test and result
- Every regulatory framework from requirements has a cert document
- Environmental testing covered the full specified envelope
- No open high-severity findings at release time
