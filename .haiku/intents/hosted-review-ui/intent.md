---
title: Hosted Review UI
studio: software
mode: continuous
status: active
created: 2026-04-07
---

# Hosted Review UI

Replace the bundled React SPA review system with a hosted architecture where the website (`haikumethod.ai`) serves all UI and connects back to a local HTTPS server running alongside the MCP.

## Architecture

1. **MCP tool** creates a session with params, encodes `{port}-{session_id}` as URL-safe base64
2. **MCP tool** opens `https://haikumethod.ai/review/{encoded}` in the browser
3. **Website** decodes the token, connects to `https://local.haikumethod.ai:{port}/{session_id}` over HTTPS
4. **Local HTTPS server** serves session data via API, receives decisions/answers via POST/WebSocket
5. **Cert microservice** provisions Let's Encrypt certs for `local.haikumethod.ai` (domain DNS-resolves to 127.0.0.1 / ::1)

## What Changes

- **Drop**: Bundled React SPA (`review-app/`, `review-app-html.ts`, `build-review-app.mjs`, Vite build)
- **Drop**: Server-side HTML template rendering (`templates/`)
- **Keep**: Session management, WebSocket protocol, HTTP API routes, EventEmitter blocking pattern
- **Add**: HTTPS via cert provisioning (mirroring han's `certs.han.guru` pattern)
- **Add**: Website routes for review, question, and design-direction pages
- **Add**: CORS handling for cross-origin website → local server requests
- **Move**: All React UI components to `website/` as Next.js pages/components

## Benefits

- No React in the plugin binary — smaller, faster installs
- UI updates deploy with the website, no plugin release needed
- Consistent design system across docs site and review UI
- HTTPS enables modern browser features (WebSocket over TLS, etc.)
