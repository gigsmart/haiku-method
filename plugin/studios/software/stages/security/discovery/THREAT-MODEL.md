---
name: threat-model
location: .haiku/knowledge/THREAT-MODEL.md
scope: project
format: text
required: true
---

# Threat Model

STRIDE-based threat model organized by trust boundary. This output drives red-team testing priorities and blue-team mitigation work.

## Content Guide

For each trust boundary (e.g., client-server, service-service, service-database):

- **Data flows crossing the boundary** — what data moves, in which direction, via what protocol
- **STRIDE analysis** — for each data flow, assess:
  - **S**poofing — can an attacker impersonate a legitimate actor?
  - **T**ampering — can data be modified in transit or at rest?
  - **R**epudiation — can actions be denied after the fact?
  - **I**nformation Disclosure — can sensitive data leak?
  - **D**enial of Service — can the service be made unavailable?
  - **E**levation of Privilege — can an attacker gain unauthorized access?
- **Identified threats** — each with severity rating (critical/high/medium/low)
- **Attack vectors** — how each threat could be exploited
- **Impact assessment** — what happens if the threat is realized
- **Required mitigations** — what controls are needed

End with a summary table mapping threats to mitigations and their implementation status (pending/implemented/verified).

## Quality Signals

- Trust boundaries are explicitly drawn, not assumed
- Every data flow has a STRIDE assessment, even if most categories are N/A
- Severity ratings reflect actual impact, not just likelihood
- Mitigations are specific controls, not vague recommendations
