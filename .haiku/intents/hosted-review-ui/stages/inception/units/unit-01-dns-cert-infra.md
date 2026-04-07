---
title: "DNS and Cert-Server Infrastructure"
type: infra
depends_on: []
status: pending
---

# DNS and Cert-Server Infrastructure

## Description

Set up the foundational infrastructure for the hosted review architecture: public DNS records that resolve `local.haikumethod.ai` to the loopback address, and a cert-server microservice that provisions TLS certificates for that domain.

### DNS Records
Add terraform resources to the existing GCP Cloud DNS zone (`haikumethod-ai`) for:
- `local.haikumethod.ai` A record pointing to `127.0.0.1`
- `local.haikumethod.ai` AAAA record pointing to `::1`

These records use the same "Plex pattern" as Han's `coordinator.local.han.guru` — public DNS resolving to localhost.

### Cert-Server Microservice
Create a standalone microservice (modeled after Han's `han/cert-server/server.ts`) that:
- Provisions Let's Encrypt certificates for `local.haikumethod.ai` using DNS-01 challenge via GCP Cloud DNS API
- Exposes `GET /cert/latest` endpoint returning `{cert, key, expiry, domain}` JSON
- Auto-renews certificates (short-lived certs, e.g., 6-day validity renewed every 12h)
- Deployed to Railway (or equivalent hosting)

### Location
- DNS terraform: `deploy/terraform/modules/dns/records_local.tf` (new file)
- Cert-server: `services/cert-server/` (new directory at repo root)

## Completion Criteria

- [ ] `dig local.haikumethod.ai A` returns `127.0.0.1` — verified by running `dig +short local.haikumethod.ai A`
- [ ] `dig local.haikumethod.ai AAAA` returns `::1` — verified by running `dig +short local.haikumethod.ai AAAA`
- [ ] Terraform plan shows only the new DNS records as additions (no destructive changes) — verified by `cd deploy/terraform && terraform plan`
- [ ] Cert-server `GET /cert/latest` returns valid JSON with `cert`, `key`, `expiry`, and `domain` fields — verified by `curl -s https://{cert-server-url}/cert/latest | jq 'keys'`
- [ ] Returned certificate is valid for `local.haikumethod.ai` — verified by `echo | openssl s_client -connect local.haikumethod.ai:443 -servername local.haikumethod.ai 2>/dev/null | openssl x509 -noout -subject` (after unit-02 uses it)
