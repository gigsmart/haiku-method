---
title: Website — Review page shell with hash fragment routing
type: frontend
status: active
depends_on: []
quality_gates:
  - /app/review/page.tsx exists and builds successfully with next build
  - ReviewShell.tsx is a use client component that reads window.location.hash
  - 'JWT decoded client-side (3-line decode, no library, base64url handling)'
  - Expired token shows error state with clear messaging
  - Malformed token shows error state
  - useSession hook accepts baseUrl parameter from decoded JWT
  - All fetch calls use absolute tunnel URLs
  - 'WebSocket connects via wss:// to tunnel host'
  - >-
    Auto-reconnect on WS drop with retry every 3s, amber banner while
    disconnected
  - 'After 5 failed reconnects, show persistent connection error'
  - bun run build in website/ succeeds with /review/index.html in output
bolt: 1
hat: reviewer
started_at: '2026-04-09T19:57:40Z'
hat_started_at: '2026-04-09T20:10:30Z'
---

# Website — Review Page Shell

## Implementation

1. Create `website/app/review/page.tsx`:
   ```tsx
   import { ReviewShell } from '../components/review/ReviewShell';
   export default function ReviewPage() { return <ReviewShell />; }
   ```

2. Create `website/app/components/review/ReviewShell.tsx` ("use client"):
   - Read `window.location.hash.slice(1)` on mount
   - Decode JWT: split('.')[1], base64url→base64, atob, JSON.parse
   - Check exp claim
   - Pass `{ tun, sid, typ }` to ReviewRouter

3. Create `website/app/components/review/hooks/useSession.ts`:
   - Accept `baseUrl` and `sessionId` params
   - Fetch: `GET ${baseUrl}/api/session/${sessionId}`
   - WebSocket: `wss://${new URL(baseUrl).host}/ws/session/${sessionId}`
   - Auto-reconnect: interval 3s, max 5 retries, expose `isConnected` state
   - Submit functions: same as current SPA but with absolute URLs

4. Error components: ExpiredError, MalformedError, ConnectionError

5. Create `website/app/components/review/ReviewSidebar.tsx` ("use client"):
   - Stepped navigation: list of sections derived from session content
   - Free navigation: click any step to jump, Back/Next for convenience
   - Track `seenSteps: Set<number>` — mark steps as seen when visited
   - Per-section comment textarea in sidebar
   - Comments stored locally as `Map<number, string>`, batched at decision
   - Final "Decision" step: summarize comments, auto-suggest action
   - Collapsible: expanded (280px, step list + comments) ↔ collapsed (64px, progress dots)
   - User toggle + auto-collapse on narrow viewports
   - Color-coded session type accent (review=teal, question=amber, direction=indigo)
   - Mobile: collapses to top status bar

6. `ReviewRouter.tsx` — routes to IntentReview, UnitReview, QuestionForm, or DirectionPicker based on `typ` from JWT
