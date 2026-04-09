---
title: Remote Review SPA
studio: software
mode: continuous
status: completed
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
active_stage: security
created_at: '2026-04-09'
completed_at: '2026-04-09T20:58:15Z'
---

# Remote Review SPA

Move the review SPA from the local MCP server to the website at haikumethod.ai. When a review is triggered, the MCP opens a localtunnel to expose itself, generates a JWT (signed with an ephemeral per-session secret) containing the tunnel URL, and opens the browser at haikumethod.ai/review/#token. The website decodes the token, extracts the tunnel URL, and establishes a WebSocket connection back to the local MCP through the tunnel to conduct the review in real time. Full cutover — remove local SPA entirely. CORS wildcard in dev, restricted in prod. Consolidated file route. MCP becomes a single minified node executable.

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
