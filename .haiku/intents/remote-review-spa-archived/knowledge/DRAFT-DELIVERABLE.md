# Draft Deliverable: Remote Review SPA

## Overview

Move the review SPA from the local MCP server to haikumethod.ai. The MCP exposes itself via localtunnel, signs a JWT with the tunnel URL, and opens the browser at the website. The website decodes the token and connects back through the tunnel.

## Implementation Plan

### Unit 1: MCP — Localtunnel + JWT

**Files to modify:**
- `packages/haiku/package.json` — add `localtunnel` dependency
- `packages/haiku/src/http.ts` — add tunnel lifecycle management
- `packages/haiku/src/server.ts` / `orchestrator.ts` — change browser launch URL

**Implementation:**

```ts
// Tunnel management (in http.ts or new tunnel.ts)
import localtunnel from 'localtunnel';
import { randomBytes, createHmac } from 'crypto';

const EPHEMERAL_SECRET = randomBytes(32).toString('hex'); // per server lifetime

let activeTunnel: localtunnel.Tunnel | null = null;

async function openTunnel(port: number): Promise<string> {
  if (activeTunnel) return activeTunnel.url;
  activeTunnel = await localtunnel({ port });
  activeTunnel.on('close', () => { activeTunnel = null; });
  return activeTunnel.url;
}

function signJWT(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const sig = createHmac('sha256', EPHEMERAL_SECRET)
    .update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
```

**Browser launch:**
```ts
const tunnelUrl = await openTunnel(httpPort);
const token = signJWT({
  tun: tunnelUrl,
  sid: sessionId,
  typ: sessionType, // "review" | "question" | "direction"
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});
open(`https://haikumethod.ai/review/#${token}`);
```

### Unit 2: MCP — API Refactor

**Files to modify:**
- `packages/haiku/src/http.ts` — CORS, consolidated route, remove SPA routes

**Files to delete:**
- `packages/haiku/review-app/` — entire directory
- `packages/haiku/src/review-app-html.ts`
- `packages/haiku/scripts/build-review-app.mjs`

**CORS middleware:**
```ts
function setCorsHeaders(res: ServerResponse) {
  const origin = process.env.NODE_ENV === 'production'
    ? 'https://haikumethod.ai'
    : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
```

**Consolidated file route:**
```ts
// GET /files/:sessionId/*path
// Resolves path relative to intent directory
// realpath() guard prevents traversal
async function handleFileGet(sessionId: string, filePath: string, res: ServerResponse) {
  const session = getSession(sessionId);
  if (!session) return send404(res);
  const baseDir = session.intentDir; // or .haiku dir
  const resolved = path.resolve(baseDir, filePath);
  const real = await fs.realpath(resolved);
  if (!real.startsWith(baseDir)) return send403(res);
  // serve file with appropriate content-type
}
```

### Unit 3: Website — Review Page Shell

**Files to create:**
- `website/app/review/page.tsx`
- `website/app/components/review/ReviewShell.tsx`
- `website/app/components/review/hooks/useSession.ts`

**Page (server component shell):**
```tsx
// website/app/review/page.tsx
import { ReviewShell } from '../components/review/ReviewShell';
export default function ReviewPage() {
  return <ReviewShell />;
}
```

**Client shell:**
```tsx
// website/app/components/review/ReviewShell.tsx
"use client";
import { useState, useEffect } from 'react';

function decodeJWT(token: string) {
  const payload = token.split('.')[1];
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64));
}

export function ReviewShell() {
  const [config, setConfig] = useState<{ tun: string; sid: string; typ: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) { setError('No review token found'); return; }
    try {
      const payload = decodeJWT(hash);
      if (payload.exp && payload.exp < Date.now() / 1000) {
        setError('This review link has expired');
        return;
      }
      setConfig(payload);
    } catch {
      setError('Invalid review token');
    }
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!config) return <Loading />;
  // Route to appropriate component based on config.typ
  return <ReviewRouter baseUrl={config.tun} sessionId={config.sid} type={config.typ} />;
}
```

**Adapted useSession hook:**
```ts
// Key change: accept baseUrl parameter
export function useSession(baseUrl: string, sessionId: string) {
  // Fetch: GET ${baseUrl}/api/session/${sessionId}
  // WebSocket: wss://${new URL(baseUrl).host}/ws/session/${sessionId}
  // Submit: POST ${baseUrl}/review/${sessionId}/decide
}
```

### Unit 4: Website — Component Migration

**Source → Target mapping:**
```
packages/haiku/review-app/src/components/ReviewPage.tsx     → website/app/components/review/ReviewPage.tsx
packages/haiku/review-app/src/components/ReviewSidebar.tsx  → website/app/components/review/ReviewSidebar.tsx
packages/haiku/review-app/src/components/QuestionPage.tsx   → website/app/components/review/QuestionPage.tsx
packages/haiku/review-app/src/components/DesignPicker.tsx   → website/app/components/review/DesignPicker.tsx
packages/haiku/review-app/src/components/AnnotationCanvas.tsx → website/app/components/review/AnnotationCanvas.tsx
packages/haiku/review-app/src/components/InlineComments.tsx → website/app/components/review/InlineComments.tsx
packages/haiku/review-app/src/components/Tabs.tsx           → website/app/components/review/Tabs.tsx
packages/haiku/review-app/src/components/Card.tsx           → website/app/components/review/Card.tsx
packages/haiku/review-app/src/components/StatusBadge.tsx    → website/app/components/review/StatusBadge.tsx
packages/haiku/review-app/src/components/CriteriaChecklist.tsx → website/app/components/review/CriteriaChecklist.tsx
packages/haiku/review-app/src/components/SubmitSuccess.tsx  → website/app/components/review/SubmitSuccess.tsx
packages/haiku/review-app/src/types.ts                     → website/app/components/review/types.ts
```

**Replacements:**
- `ThemeToggle.tsx` → website's `next-themes` (already exists)
- `MermaidDiagram.tsx` → website's `Mermaid.tsx` component (bundled, not CDN)
- `@sentry/react` → `@sentry/nextjs` (already configured)
- `MarkdownViewer.tsx` → inline or use website's existing markdown rendering

**Binary file URL adaptation:**
All `<img src>` and `<iframe src>` that reference `/mockups/`, `/wireframe/`, `/stage-artifacts/`, `/question-image/` will point to `${baseUrl}/files/${sessionId}/path/to/file` using the consolidated file route.
