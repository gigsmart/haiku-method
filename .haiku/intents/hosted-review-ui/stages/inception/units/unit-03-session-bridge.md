---
status: pending
type: backend
depends_on: [unit-02-https-upgrade]
---

# Session Bridge

## Scope
Implement session token encoding: URL-safe base64 of `{port}-{session_id}`. Modify MCP tools (`open_review`, `ask_user_visual_question`, `pick_design_direction`) to encode a token and open `https://haikumethod.ai/review/{encoded}` (or `/question/`, `/direction/`) instead of `http://127.0.0.1:{port}/{type}/{id}`. Add a website route scaffold at `website/app/review/[encoded]/page.tsx` that decodes the token and renders a client component.

## Completion Criteria
- `encodeSessionToken(port, sessionId)` and `decodeSessionToken(encoded)` functions exist and round-trip correctly
- MCP `open_review` tool opens `https://haikumethod.ai/review/{encoded}` in browser
- MCP `ask_user_visual_question` tool opens `https://haikumethod.ai/question/{encoded}`
- MCP `pick_design_direction` tool opens `https://haikumethod.ai/direction/{encoded}`
- `website/app/review/[encoded]/page.tsx` exists, decodes token, renders placeholder
- `website/app/question/[encoded]/page.tsx` exists
- `website/app/direction/[encoded]/page.tsx` exists
