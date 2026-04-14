---
name: functional-requirements
location: .haiku/intents/{intent-slug}/knowledge/FUNCTIONAL-REQUIREMENTS.md
scope: intent
format: text
required: true
---

# Functional Requirements

Complete, testable, traceable specification of what the product does.

## Content Guide

### Functional Requirements
Every requirement tagged with a unique identifier (e.g., FR-001, FR-002). Each requirement is:
- **Testable** — can be verified by a specific test
- **Unambiguous** — no subjective language
- **Traceable** — linked back to discovery and forward to validation

### Non-Functional Envelope
- **Power** — peak, average, sleep
- **Thermal** — operating range, max junction temp
- **Mechanical** — dimensions, weight, mounting
- **Environmental** — operating temp, humidity, ingress (IP rating), shock/vibration

### External Interfaces
- Every port, wire, wireless protocol with version and pinout if applicable

### Lifetime and Reliability
- Expected operating hours
- Duty cycle
- MTBF target if relevant
- Field lifetime

## Quality Signals

- Every requirement has a unique ID
- Every requirement is testable
- Non-functional envelope is quantified, not qualitative
- No requirement says "adequate" or "reasonable"
