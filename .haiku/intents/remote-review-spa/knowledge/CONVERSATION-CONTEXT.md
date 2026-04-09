# Conversation Context

STUDIO: software — this is a multi-component software feature spanning the MCP plugin and Next.js website.

Key decisions from prior research:
- Localtunnel npm package for tunnel (TCP-level proxy, supports WebSocket + binary)
- Hash fragment routing (haikumethod.ai/review/#jwt_token) — token never hits server
- JWT with ephemeral per-server-lifetime secret, decoded client-side (no verification)
- Full cutover: delete review-app/ entirely, remove from build pipeline
- CORS: wildcard in dev, haikumethod.ai in prod
- Consolidate 4 file-serving routes into single GET /files/:sessionId/*path
- All SPA dependencies already exist in the website stack (no new deps)
- Research brief and draft deliverable available in archived intent knowledge/
