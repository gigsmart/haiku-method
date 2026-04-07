# Discovery: Hosted Review UI

## Domain Model

### Entities
- **Session** — In-memory state object (review/question/design_direction) with 30min TTL
- **SessionToken** — URL-safe base64 encoding of `{port}-{session_id}`, bridges MCP and website
- **Certificate** — TLS cert/key pair for `local.haikumethod.ai`, short-lived (6-day), cached locally
- **ReviewPage** — Website route that decodes token, fetches session data from local API, renders UI

### Relationships
- MCP tool creates Session → encodes SessionToken → opens Website URL with token
- Website decodes SessionToken → extracts port + session_id → fetches from local HTTPS API
- Local HTTPS API requires Certificate → fetched from cert provisioning service

## Technical Landscape

### Files to Modify
- `packages/haiku/src/http.ts` — Strip HTML serving, add HTTPS/TLS, add CORS headers
- `packages/haiku/src/server.ts` — MCP tools open website URLs instead of local server URLs
- `packages/haiku/package.json` — Remove review-app prebuild step

### Files to Remove
- `packages/haiku/review-app/` — Entire React SPA directory
- `packages/haiku/src/review-app-html.ts` — 237KB embedded HTML string
- `packages/haiku/scripts/build-review-app.mjs` — Vite build script
- `packages/haiku/scripts/build-css.mjs` — CSS build script

### Files to Add
- `packages/haiku/src/tls.ts` — Cert fetching, caching, hot-reload (mirroring han pattern)
- `website/app/review/[encoded]/page.tsx` — Review route
- `website/app/question/[encoded]/page.tsx` — Question route
- `website/app/direction/[encoded]/page.tsx` — Design direction route
- `website/app/review/components/` — Ported review components
- Cert provisioning service (location TBD — could be `deploy/cert-server/` or separate repo)
- DNS configuration for `local.haikumethod.ai`

### Files Unchanged
- `packages/haiku/src/sessions.ts` — Session store stays in-memory, same API
- `packages/haiku/src/main.ts` — Entry point unchanged

## Constraints
- Website is statically exported (Next.js `output: 'export'`) — review routes must be client-side rendered since they fetch from a local server at runtime
- CORS must be configured on the local API to allow `haikumethod.ai` origin
- Mixed content: website is HTTPS, local server must also be HTTPS (hence the cert infrastructure)
- Session data never leaves the local machine — website fetches from localhost, not a remote server
- The cert provisioning service is a separate deployable — not part of the plugin binary

## Risks
- **Cert provisioning availability**: If the cert service is down, the local HTTPS server can't start. Mitigation: cache certs locally, only refresh when near expiry.
- **Browser security**: Some browsers may block requests to local addresses from HTTPS pages. Mitigation: using a real domain with a real cert avoids this.
- **Static export limitation**: Next.js static export means no server-side rendering for review pages. The review routes must use client components with useEffect for data fetching.
- **Port conflicts**: Random port assignment means the encoded token changes each session. Not a problem since tokens are single-use.

## Overlap Check
No active haiku branches detected working on overlapping files.
