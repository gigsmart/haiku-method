---
title: db-outage-2026-03
studio: incident-response
stages: [triage, investigate, mitigate, resolve, postmortem]
status: complete
---

# Primary DB Outage · 2026-03

Primary Postgres unreachable; writes failing fleet-wide. Replica healthy, replication lag sub-second, failover not yet triggered. Likely linked to a schema migration merged ~40 minutes ago.

## Goals

- Restore writes as fast as safely possible
- Preserve transaction integrity (no silent data loss)
- Capture the failure mode for the postmortem
- Produce a regression test or guardrail so this class of migration can't repeat the outage
