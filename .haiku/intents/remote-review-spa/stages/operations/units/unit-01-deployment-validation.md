---
title: Deployment validation and operational readiness
status: completed
quality_gates:
  - Website build succeeds with /review/ page in static output
  - MCP build succeeds with localtunnel bundled
  - Feature flag HAIKU_REMOTE_REVIEW=1 correctly toggles local vs remote
  - Sentry captures errors from both components
  - No new CI steps or infrastructure required
---

# Deployment Validation

No new infrastructure. Existing CI handles both components. Feature flag gates the new flow.
