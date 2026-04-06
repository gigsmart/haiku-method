---
title: Deploy Configuration
type: ops
status: complete
depends_on: []
---

# Unit 01: Deploy Configuration

Configure deployment infrastructure for OAuth integration including secret management, health checks, and operational readiness.

## Completion Criteria

- [x] Vault policy created: `oauth-secrets` policy with read access to `secret/data/oauth/{google,github}`
- [x] Vault injector sidecar configured in Helm values — secrets mounted as env vars `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- [x] Health check endpoint `/health/oauth` verifies connectivity to both provider token endpoints
- [x] Health check timeout: 5 seconds, failure triggers alert
- [x] Terraform resource `oauth.tf` defines Vault policy and role bindings
- [x] Rollback plan documented: revert Helm release, rotate compromised secrets via Vault CLI
- [x] Monitoring: error rate alert at >1% over 5 minutes on `/auth/callback/*` routes
- [x] Runbook covers: secret rotation, provider outage response, rate limit tuning
