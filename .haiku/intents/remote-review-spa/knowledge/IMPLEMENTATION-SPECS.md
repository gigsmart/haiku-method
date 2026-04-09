# Implementation Specs (for development stage)

## Architecture: Browse + Review Layer

The review experience reuses the website's existing browse components for content rendering.
Review = browse content + review sidebar (comments, stepped nav, decision) + tunnel connection.

```
ReviewShell (token decode, tunnel connection, WS, error states)
├── IntentReview (browse IntentDetailView + ReviewSidebar)
├── UnitReview (browse UnitDetailView + ReviewSidebar)
├── QuestionForm (standalone, restyled to match website)
└── DirectionPicker (standalone, thumbnail previews + radio + sliders)
```

**What we reuse from browse:**
- `IntentDetailView` — intent summary, stage pipeline, unit list
- `UnitDetailView` — unit spec, criteria checklist, field displays
- `BrowseMarkdown` — markdown rendering with asset resolution
- `AssetLightbox` — image lightbox for artifacts
- `Mermaid` — diagram rendering (bundled, dark mode aware)
- Status badges, card layouts, metadata grids

**What we build new:**
- `ReviewShell` — token decode, tunnel connection, WS, error/reconnect states
- `ReviewSidebar` — stepped nav, per-section comments, decision action
- `QuestionForm` — multi-question form (port from SPA, restyle)
- `DirectionPicker` — archetype thumbnails + radio + parameter sliders (port from SPA, restyle)
- `AnnotationCanvas` — image pin/freehand overlay modal (port from SPA)

**What we DON'T port from the SPA:**
- ReviewPage.tsx (replaced by browse IntentDetailView)
- ReviewSidebar.tsx (replaced by new ReviewSidebar with stepped flow)
- Tabs.tsx, Card.tsx, StatusBadge.tsx, MarkdownViewer.tsx, MermaidDiagram.tsx (all replaced by browse equivalents)
- ThemeToggle.tsx, main.tsx, App.tsx, vite-env.d.ts, index.css (eliminated)

## Unit Split (4 units, parallel where possible)

### Unit 1: MCP — Localtunnel + JWT
- Add `localtunnel` dependency, open tunnel on review session create
- Sign JWT: `{ tun, sid, typ, iat, exp }` with ephemeral per-server-lifetime secret
- 1-hour TTL
- Open browser at `haikumethod.ai/review/#jwt`
- Tunnel lifecycle: close on session complete, reopen on drop
- If tunnel dies mid-session: re-open tunnel, re-sign JWT, re-open browser
- Retry/timeout on tunnel open — clear error if relay is down
- Feature flag: `HAIKU_REMOTE_REVIEW=1` gates new behavior

**Verification:**
- `curl -s https://<tunnel>/api/session/<id> | jq .sid` returns valid session ID
- JWT decodes to correct payload
- Tunnel closes after session completes (no orphan processes)

### Unit 2: MCP — API Refactor
- CORS: wildcard when `HAIKU_REMOTE_REVIEW=1`, OPTIONS preflight
- Consolidate 4 file routes into `GET /files/:sessionId/*path` (intent dir + global knowledge, realpath guard)
- Question images: resolve absolute paths to relative at session creation
- Keep existing routes functional when flag is off

**Verification:**
- `OPTIONS` preflight returns correct CORS headers
- `GET /files/:sessionId/mockups/test.png` returns image
- `GET /files/:sessionId/../../etc/passwd` returns 403
- `bun run build` succeeds

### Unit 3: Website — Review Shell + Sidebar
- `/app/review/page.tsx` → static shell
- `ReviewShell.tsx` "use client" → read hash, decode JWT, check exp
- `useReviewSession` hook — accepts tunnel URL, fetches session, manages WS
- Auto-reconnect on WS drop (3s interval, 5 retries, amber banner)
- Error states: expired, malformed, unreachable, not found
- `ReviewSidebar` — stepped nav (free navigation, seen tracking), per-section comments, decision
- Comments batched and sent with decision (not real-time)
- Decision auto-suggested from comment state
- Sidebar collapsible (expanded 280px / collapsed 64px)
- Routes to IntentReview, UnitReview, QuestionForm, or DirectionPicker based on session type

**Verification:**
- `bun run build` succeeds; `/review/index.html` in output
- Valid token loads and fetches session data from tunnel
- Expired/malformed tokens show appropriate errors
- WS disconnect shows reconnecting banner

### Unit 4: Website — Review Content Views
Depends on Unit 3.

- **IntentReview**: Wraps browse `IntentDetailView` scoped to intent summary (problem, solution, criteria, DAG overview). NOT every unit expanded — just the intent-level sections as review steps.
- **UnitReview**: Wraps browse `UnitDetailView` for the specific unit being reviewed (spec, criteria, wireframes, risks).
- **QuestionForm**: Port from SPA `QuestionPage.tsx`, restyle to match website. Multi-question form with radio/checkbox, Other option, feedback textarea.
- **DirectionPicker**: Port from SPA `DesignPicker.tsx`, restyle to match website. Archetype cards with thumbnail HTML previews (rendered in iframes), radio selection, parameter sliders.
- **AnnotationCanvas**: Port from SPA, overlay modal on mockup image click. Pin placement + freehand drawing.
- All binary file URLs use absolute tunnel URLs via `/files/:sessionId/*path`

**Verification:**
- Intent review renders all sections from browse IntentDetailView
- Unit review renders unit detail from browse UnitDetailView
- Question form renders and submits answers
- Direction picker shows thumbnail previews with radio + sliders
- Annotation canvas pins and drawing work
- E2E: MCP → tunnel → JWT → website → fetch → WS → submit decision → MCP receives

### DAG
Units 1, 2, 3 parallel → Unit 4 depends on Unit 3

### Feature Flag
`HAIKU_REMOTE_REVIEW=1` env var. Local SPA stays as default until validated.

### Branch
Feature branch: haiku/remote-review-spa/main → PR to main
