---
name: root-cause
location: .haiku/intents/{intent-slug}/knowledge/ROOT-CAUSE.md
scope: intent
format: text
required: true
---

# Root Cause

Root cause analysis with timeline reconstruction and evidence. This output drives the mitigation stage by providing a clear target for immediate action.

## Content Guide

Structure the analysis to support both immediate mitigation and long-term resolution:

- **Reconstructed timeline** — every key event from first anomaly through detection and escalation, with timestamps from multiple sources
- **Root cause statement** — clear, specific description of what caused the incident
- **Supporting evidence** — log entries, metric correlations, code paths, and configuration states that confirm the root cause
- **Contributing factors** — conditions that enabled or amplified the root cause (not the cause itself)
- **Ruled-out hypotheses** — alternative explanations investigated and why they were eliminated
- **Affected code paths or systems** — specific files, services, or configurations involved

## Quality Signals

- Root cause is specific enough to target a fix (not "the database was slow" but "query X on table Y hit a full table scan due to missing index on column Z")
- Timeline entries cite specific data sources, not memory
- Contributing factors are distinguished from the root cause — they explain severity, not causation
- At least 2 alternative hypotheses are documented with elimination evidence
