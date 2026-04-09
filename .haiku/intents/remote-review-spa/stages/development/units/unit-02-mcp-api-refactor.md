---
title: MCP — CORS + consolidated file route
type: backend
status: active
depends_on: []
quality_gates:
  - >-
    CORS headers on all responses: Access-Control-Allow-Origin * when
    HAIKU_REMOTE_REVIEW=1
  - OPTIONS preflight returns 204 with correct CORS headers
  - >-
    GET /files/:sessionId/*path serves files from intent dir and global
    knowledge
  - Path traversal guard via realpath — returns 403 on traversal attempt
  - Question image paths resolved to relative paths at session creation
  - Content-Type set from file extension
  - Old file routes still work when feature flag is off (backwards compat)
  - TypeScript compiles with no errors
bolt: 1
hat: builder
started_at: '2026-04-09T19:57:38Z'
hat_started_at: '2026-04-09T19:58:41Z'
---

# MCP — CORS + Consolidated File Route

## Implementation

Key file: `packages/haiku/src/http.ts`

1. **CORS middleware**: Add headers to all responses when `HAIKU_REMOTE_REVIEW=1`:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, POST, OPTIONS
   Access-Control-Allow-Headers: Content-Type
   ```
   Handle OPTIONS with 204.

2. **Consolidated file route** `GET /files/:sessionId/*path`:
   - Get session, resolve intent dir
   - Also allow paths under global `.haiku/knowledge/`
   - `realpath()` guard: resolved path must start with allowed base
   - Set Content-Type from extension (mime lookup)
   - Question images: at session creation, resolve absolute paths to relative paths

3. Keep existing routes functional when flag is off.
