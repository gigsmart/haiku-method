---
status: pending
type: backend
depends_on: []
---

# Cert Infrastructure

## Scope
Set up DNS record for `local.haikumethod.ai` pointing to `127.0.0.1`/`::1`. Build and deploy a cert provisioning microservice that issues Let's Encrypt certs for this domain. Mirror han's cert-server pattern: certbot with DNS validation, short-lived certs, JSON API endpoint.

## Completion Criteria
- DNS A record for `local.haikumethod.ai` resolves to `127.0.0.1` — verified by `dig local.haikumethod.ai`
- DNS AAAA record resolves to `::1` — verified by `dig AAAA local.haikumethod.ai`
- Cert provisioning endpoint returns JSON with `cert`, `key`, `expires`, `domain` fields
- Cert is valid for `local.haikumethod.ai` — verified by `openssl x509 -in cert.pem -text`
