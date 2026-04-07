---
title: "URL Encoding and Browser Open"
type: backend
depends_on: [unit-02-https-local-server]
status: pending
---

# URL Encoding and Browser Open

## Description

Implement the URL encoding scheme and update all MCP tools to open the website URL instead of the local server URL.

### URL Encoding

Encode `{port}-{sessionId}` as URL-safe base64. The website decodes this to extract the port and session ID for API calls.

```typescript
function encodeReviewUrl(port: number, sessionId: string): string {
  const payload = `${port}-${sessionId}`
  return Buffer.from(payload).toString("base64url")
}

function decodeReviewUrl(encoded: string): { port: number; sessionId: string } {
  const decoded = Buffer.from(encoded, "base64url").toString()
  const dashIndex = decoded.indexOf("-")
  return {
    port: parseInt(decoded.substring(0, dashIndex), 10),
    sessionId: decoded.substring(dashIndex + 1),
  }
}
```

### MCP Tool Updates

Update browser-open URLs in `packages/haiku/src/server.ts` for all three tools:

1. **`open_review`** (line ~554): Change from `http://127.0.0.1:${port}/review/${session.session_id}` to `https://haikumethod.ai/review/${encodeReviewUrl(port, session.session_id)}/`

2. **`ask_user_visual_question`** (line ~754): Change from `http://127.0.0.1:${port}/question/${session.session_id}` to `https://haikumethod.ai/review/${encodeReviewUrl(port, session.session_id)}/`

3. **`pick_design_direction`** (line ~850): Change from `http://127.0.0.1:${port}/direction/${session.session_id}` to `https://haikumethod.ai/review/${encodeReviewUrl(port, session.session_id)}/`

All three session types use the same `/review/{encoded}/` website route. The website determines the session type from the API response.

### Trailing Slash

The website uses `trailingSlash: true` in next.config.ts, so URLs must end with `/` to avoid a redirect.

### Website URL Configuration

The website base URL should be configurable via environment variable `HAIKU_WEBSITE_URL` (default: `https://haikumethod.ai`) to support development/staging environments.

## Completion Criteria

- [ ] `encodeReviewUrl(12345, "abc-def-123")` round-trips correctly through `decodeReviewUrl` — verified by unit test in `packages/haiku/test/`
- [ ] `open_review` tool opens `https://haikumethod.ai/review/{encoded}/` — verified by reading the URL from server.ts source and confirming the `open` command argument
- [ ] `ask_user_visual_question` tool opens `https://haikumethod.ai/review/{encoded}/` — verified by reading the URL from server.ts source
- [ ] `pick_design_direction` tool opens `https://haikumethod.ai/review/{encoded}/` — verified by reading the URL from server.ts source
- [ ] No references to `http://127.0.0.1` remain in browser-open code paths — verified by `grep -r "127.0.0.1" packages/haiku/src/server.ts | grep -v "listen\|createServer\|console"` returns no matches
