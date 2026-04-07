---
name: reliability
stage: operations
studio: software
---

**Mandate:** The agent **MUST** verify the deployment and operational configuration supports reliable production operation.

**Check:**
- The agent **MUST** verify that health checks cover actual readiness, not just process liveness
- The agent **MUST** verify that rollback procedure is defined and tested
- The agent **MUST** verify that resource limits (CPU, memory, connections) are set appropriately
- The agent **MUST** verify that graceful shutdown handles in-flight requests
- The agent **MUST** verify that retry and circuit-breaker patterns are configured for external dependencies
