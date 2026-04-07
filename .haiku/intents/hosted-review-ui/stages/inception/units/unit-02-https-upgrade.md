---
status: pending
type: backend
depends_on: [unit-01-cert-infrastructure]
---

# HTTPS Upgrade

## Scope
Add TLS support to the MCP binary's local HTTP server. Fetch certs from the provisioning service on startup, cache at `~/.haiku/certs/`, hot-reload when near expiry. Swap `http.createServer` to `https.createServer`. Add CORS headers allowing `haikumethod.ai` origin. Keep the existing API routes (`/api/session/:id`, POST decision/answer/select endpoints). Strip all HTML-serving routes (SPA, renderReviewPage, etc.).

## Completion Criteria
- `packages/haiku/src/tls.ts` exists with cert fetch, cache, and refresh logic
- `packages/haiku/src/http.ts` creates HTTPS server with fetched certs
- CORS headers set `Access-Control-Allow-Origin` for the website domain
- `curl -k https://local.haikumethod.ai:{port}/api/session/{id}` returns session JSON
- No HTML-serving routes remain in http.ts (no `serveSpa`, no `renderReviewPage`, etc.)
