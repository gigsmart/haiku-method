---
studio: software
mode: continuous
status: active
created: '2026-04-07'
active_stage: inception
---

# Hosted Review UI

Replace the bundled React review UI with a hosted architecture where the website serves all review content.

## Architecture

1. **MCP tool** creates a session with review params
2. **Encodes** session ID + MCP server port as URL-safe base64: `urlsafebase64({port}-{session-id})`
3. **Opens** `{website-url}/review/{encoded}` in the user's browser
4. **Website** decodes the param, makes a request to `local.haikumethod.ai:{port}/{session-id}`
5. **Local HTTPS server** (running in MCP process) responds with session data
6. **Website** renders the review content

## Key Design Decisions

- No bundled React or rendering tools in the plugin binary
- Local HTTPS server in the MCP process, using certs from a provisioning microservice (same pattern as Han)
- `local.haikumethod.ai` DNS points to `127.0.0.1` + `::1` (IPv6 loopback)
- Website handles all rendering — plugin only serves data

## Reference

- Han's local server implementation: `../han` (cert provisioning, HTTPS server pattern)
- Current MCP review tools: `packages/haiku/src/prompts/*.ts`
- Website: `website/` (Next.js 15 static site)
