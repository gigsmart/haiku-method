---
title: Website — Review page shell with hash fragment routing
type: content
status: pending
depends_on: []
quality_gates:
  - /app/review/page.tsx exists as a static page with "use client" component
  - Hash fragment parsed on mount to extract JWT token
  - JWT decoded client-side (no verification) to extract tunnel URL, session ID, type
  - useSession hook adapted to accept remote base URL from decoded JWT
  - Expired/malformed token shows user-friendly error state
  - WebSocket connection established to tunnel URL for real-time transport
---

# Website — Review Page Shell

## What to Build

1. Create `website/app/review/page.tsx` — static page shell
2. Create `website/app/components/review/ReviewShell.tsx` — `"use client"` component that:
   - Reads `window.location.hash` on mount
   - Decodes JWT payload (3-line decode, no library)
   - Checks `exp` claim for client-side expiry
   - Passes tunnel URL + session ID to the session hook
3. Adapt `useSession` hook from the current SPA:
   - Accept `baseUrl` parameter (tunnel URL) instead of using relative paths
   - All fetch calls use absolute URLs: `${baseUrl}/api/session/${sessionId}`
   - WebSocket URL: `wss://${tunnelHost}/ws/session/${sessionId}`
4. Error states: expired token, malformed token, tunnel unreachable, session not found

## Key Files
- `website/app/review/page.tsx` — new page
- `website/app/components/review/ReviewShell.tsx` — new client component
- `website/app/components/review/hooks/useSession.ts` — adapted from review-app
