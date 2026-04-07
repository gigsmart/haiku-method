---
studio: software
mode: continuous
status: active
created: 2026-04-07
---

# Hosted Review UI

Replace the bundled React review app with a hosted architecture where the website serves the review UI and the MCP binary provides only a local HTTPS API.

## Current State

- React SPA in `packages/haiku/review-app/` is built by Vite, inlined as a 237KB string in `review-app-html.ts`, and bundled into the `plugin/bin/haiku` binary
- Local HTTP server on `127.0.0.1:PORT` serves the SPA and session APIs
- Three session types: review, question, design_direction
- Browser opens `http://127.0.0.1:PORT/{type}/{UUID}`

## Target Architecture

Adopt the pattern from the han project's local coordinator:

1. **DNS**: `local.haikumethod.ai` A record → `127.0.0.1` + AAAA → `::1`
2. **TLS Certificates**: Cert provisioning microservice (similar to han's `certs.han.guru`) issues short-lived Let's Encrypt certs for `local.haikumethod.ai`. MCP binary fetches and caches certs locally.
3. **Local HTTPS API**: The MCP binary runs a local HTTPS server (instead of HTTP) that exposes only session data APIs — no HTML serving.
4. **Session Encoding**: MCP tool creates session, encodes `{port}-{session_id}` as URL-safe base64.
5. **Website Routes**: `haikumethod.ai/review/{encoded}` — the Next.js website decodes the token, connects to `https://local.haikumethod.ai:{port}`, fetches session data, and renders the review UI.
6. **Drop Bundled React**: Remove `packages/haiku/review-app/`, `review-app-html.ts`, and the Vite build step. The binary shrinks significantly.

## Key Decisions

- Reuse or mirror han's cert-server pattern (Let's Encrypt + Google Cloud DNS validation)
- Website handles all rendering — MCP binary is API-only
- Same session types (review, question, design_direction) but served by website routes
- WebSocket support moves to the website connecting to the local HTTPS server

## What Gets Removed

- `packages/haiku/review-app/` (entire React SPA)
- `packages/haiku/src/review-app-html.ts` (237KB embedded string)
- `packages/haiku/scripts/build-review-app.mjs` (Vite build script)
- `packages/haiku/scripts/build-css.mjs` (CSS build for review app)
- HTML rendering functions in `http.ts` (renderReviewPage, renderQuestionPage, etc.)
- SPA serving routes in `http.ts`

## What Gets Added

- Cert fetching + caching in MCP binary (`~/.haiku/certs/` or similar)
- HTTPS server upgrade (swap http.createServer → https.createServer with fetched certs)
- Session token encoding (URL-safe base64 of `{port}-{session_id}`)
- Website routes: `/review/[encoded]`, `/question/[encoded]`, `/direction/[encoded]`
- Website components that replicate the review SPA functionality
- CORS headers on local API for `haikumethod.ai` origin
- Cert provisioning microservice (deploy target TBD)

## What Gets Modified

- `packages/haiku/src/http.ts` — Strip HTML serving, add HTTPS/TLS, add CORS
- `packages/haiku/src/server.ts` — MCP tools open website URLs instead of local server URLs
- `packages/haiku/src/sessions.ts` — Unchanged (session store stays in-memory)
- Build pipeline — Remove review-app prebuild step, binary shrinks
