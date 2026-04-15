---
title: 'MCP — API refactor (CORS, consolidated file route, remove SPA)'
status: pending
depends_on: []
quality_gates:
  - >-
    CORS: wildcard (*) in dev, haikumethod.ai in prod, with OPTIONS preflight
    handling
  - >-
    Four file-serving routes consolidated into single GET
    /files/:sessionId/*path
  - Path traversal protection via realpath guard on consolidated route
  - >-
    SPA serving removed (serveSpa, REVIEW_APP_HTML import, HTML-serving GET
    routes)
  - review-app/ directory deleted entirely
  - review-app-html.ts generated file removed
  - build-review-app.mjs script removed
  - >-
    review-app removed from package.json prebuild scripts, tsconfig references,
    and CI steps
  - MCP builds as a single minified node executable without bundled SPA
---

# MCP — API Refactor

## What to Build

1. **CORS**: Add `Access-Control-Allow-Origin: *` in dev, `https://haikumethod.ai` in prod. Handle preflight OPTIONS requests.
2. **Consolidate file routes**: Replace `/mockups/:id/:path`, `/wireframe/:id/:path`, `/stage-artifacts/:id/:path`, `/question-image/:id/:index` with a single `GET /files/:sessionId/*path` that resolves relative to the intent directory with realpath traversal guard.
3. **Remove SPA serving**: Delete `serveSpa()`, remove `REVIEW_APP_HTML` import, remove `GET /review/:sessionId`, `GET /question/:sessionId`, `GET /direction/:sessionId` routes.
4. **Cleanup**: Delete `review-app/` directory entirely, remove `review-app-html.ts`, `scripts/build-review-app.mjs`, remove from prebuild scripts, tsconfig references, and CI steps. MCP becomes a single minified node executable.

## Key Files
- `packages/haiku/src/http.ts` — all route changes
- `packages/haiku/review-app/` — delete entire directory
- `packages/haiku/src/review-app-html.ts` — delete
- `packages/haiku/scripts/build-review-app.mjs` — delete
- `packages/haiku/package.json` — remove prebuild references
- `packages/haiku/tsconfig.json` — remove review-app references
