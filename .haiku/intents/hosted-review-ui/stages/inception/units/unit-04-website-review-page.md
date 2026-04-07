---
title: "Website Review Page"
type: frontend
depends_on: [unit-03-url-encoding-browser]
status: pending
---

# Website Review Page

## Description

Create the `/review/[encoded]/` route in the website (Next.js 15 static export) that replaces the bundled React review app. This page decodes the URL parameter, fetches session data from the local HTTPS server, and renders the appropriate UI for the session type.

### Route Structure

New files:
- `website/app/review/[encoded]/page.tsx` — client-side rendered page
- `website/app/review/[encoded]/layout.tsx` — optional, minimal layout (no global nav needed for review pages)

The page must be fully client-side rendered because:
1. The `encoded` param contains runtime data (port + session ID) that cannot be known at build time
2. `output: "export"` (static export) cannot SSR unknown dynamic routes
3. `generateStaticParams()` returns `[]` so Next.js exports a fallback shell

### Page Logic

1. **Decode URL param**: Extract `port` and `sessionId` from base64url-encoded param
2. **Fetch session data**: `GET https://local.haikumethod.ai:{port}/api/session/{sessionId}`
3. **Connect WebSocket**: `wss://local.haikumethod.ai:{port}/ws/session/{sessionId}`
4. **Route by session type**: Render `ReviewPage`, `QuestionPage`, or `DesignPicker` based on `session_type` field
5. **Submit decisions**: POST to `https://local.haikumethod.ai:{port}/{type}/{sessionId}/{action}` or send via WebSocket

### Component Migration

Port the 15 components from `packages/haiku/review-app/src/components/` to `website/app/review/components/` (or `website/app/components/review/`):

- **ReviewPage** — main review UI with intent/unit display, DAG visualization, mockups
- **QuestionPage** — multi-question form with image display
- **DesignPicker** — archetype selection with parameter sliders
- **AnnotationCanvas** — screenshot annotation with pins
- **CommentTray** — inline comment management
- **InlineComments** — text selection comments
- **DecisionForm** — approve/request changes with feedback
- **CriteriaChecklist** — completion criteria display
- **MermaidDiagram** — unit DAG visualization (website already has `mermaid` dependency)
- **MarkdownViewer** — markdown rendering (website already has `react-markdown` + `remark-gfm`)
- **Card, StatusBadge, SubmitSuccess, Tabs, ThemeToggle** — UI primitives

The website already has all required dependencies: React 19, react-markdown, remark-gfm, mermaid, Tailwind 4. ThemeToggle can use the website's existing `next-themes` setup.

### Asset Proxying

Mockup images and wireframes are served by the local HTTPS server. The review components must construct full URLs like `https://local.haikumethod.ai:{port}/mockups/{sessionId}/{path}` instead of relative paths like `/mockups/{sessionId}/{path}`.

### Error States

- Connection refused (MCP not running) — show "Cannot connect to local server" with instructions
- Session not found (expired/invalid) — show "Session expired or not found"
- TLS error (cert issues) — show "Certificate error" with troubleshooting link

## Completion Criteria

- [ ] `website/app/review/[encoded]/page.tsx` exists with `"use client"` directive — verified by `head -1 website/app/review/[encoded]/page.tsx`
- [ ] `next build` succeeds with the new route — verified by `cd website && npm run build`
- [ ] Page decodes `MTIzNDUtYWJjLWRlZi0xMjM` (base64url of `12345-abc-def-123`) and attempts fetch to `https://local.haikumethod.ai:12345/api/session/abc-def-123` — verified by browser devtools network tab
- [ ] All three session types render correctly (review, question, design_direction) — verified by creating test sessions via MCP tools and confirming visual output matches the old review app
- [ ] WebSocket connection establishes and receives real-time updates — verified by submitting a decision and confirming the MCP tool unblocks
