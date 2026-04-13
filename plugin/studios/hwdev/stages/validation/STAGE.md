---
name: validation
description: HIL testing, environmental, and regulatory certification
hats: [test-engineer, compliance-officer, validation-lead]
review: await
elaboration: collaborative
inputs:
  - stage: requirements
    discovery: functional-requirements
  - stage: requirements
    discovery: safety-analysis
  - stage: design
    output: schematic
  - stage: firmware
    output: firmware-binary
---

# Validation

Hardware-in-the-loop testing, environmental testing (temperature, humidity,
vibration, ESD, drop), and regulatory certification. Validation failures mean
going back to design or firmware — this is where hardware projects find out
whether their assumptions held, and the cost of being wrong grows with every
downstream stage that already happened.

Certification is often gated by an external lab with its own schedule. Plan
for cert slots early; "we'll just submit when we're ready" is how launches
slip by months.

## Completion Signal (RFC 2119)

HIL tests **MUST** pass for all functional requirements. Environmental
testing **MUST** meet the specified operating envelope. Regulatory
certification **MUST** be obtained for every target market before
manufacturing ramp.
