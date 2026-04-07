---
name: thoroughness
stage: investigate
studio: incident-response
---

**Mandate:** The agent **MUST** verify the investigation identified the actual root cause, not just the proximate trigger.

**Check:**
- The agent **MUST** verify that timeline is complete with no unexplained gaps between events
- The agent **MUST** verify that evidence (logs, metrics, traces) supports the causal chain
- The agent **MUST** verify that alternative hypotheses were considered and ruled out with evidence
- The agent **MUST** verify that contributing factors (deploys, config changes, traffic patterns) are identified
