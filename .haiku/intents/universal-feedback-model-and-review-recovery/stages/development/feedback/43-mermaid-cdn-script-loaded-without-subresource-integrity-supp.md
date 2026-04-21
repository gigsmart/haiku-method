---
title: >-
  Mermaid CDN script loaded without Subresource Integrity — supply-chain XSS
  vector
status: pending
origin: adversarial-review
author: security
author_type: agent
created_at: '2026-04-21T20:23:56Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

`packages/haiku-ui/src/components/MermaidDiagram.tsx:30-33` loads the Mermaid renderer from a third-party CDN with no integrity attribute and no version pin beyond the major:

```ts
const script = document.createElement("script")
script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
script.onload = () => { … ref.current.innerHTML = svg }
```

No `script.integrity`, no `script.crossOrigin = "anonymous"`, no CSP on the surrounding app. The resolved URL serves whatever `mermaid@11` is latest — a compromised npm publish, a CDN cache poisoning, or a DNS hijack at `cdn.jsdelivr.net` yields arbitrary JavaScript executed inside the review UI with access to session tokens in `sessionStorage` / URL fragments (e.g. the E2E key in the JWT fragment issued by `buildReviewUrl`). The subsequent `ref.current.innerHTML = svg` (line 58) is comment-justified as "mermaid returns pre-sanitized SVG" but the guarantee is only as good as the library you loaded — a tampered CDN script can skip sanitization entirely.

Additionally, Mermaid's `securityLevel` is not explicitly set in the `initialize({...})` call (line 42-53). Mermaid's default in v11 is `"strict"`, but relying on the default is fragile across upgrades.

**Fix:**
- Pin an exact version (e.g. `mermaid@11.4.1`) and add `script.integrity = "sha384-..."` + `script.crossOrigin = "anonymous"`. Document the rotation process for integrity updates.
- Explicitly pass `securityLevel: "strict"` into `mermaid.initialize`.
- Consider bundling Mermaid instead of loading it from a CDN — the comment claims "too large to bundle" but code-splitting + lazy chunk load would avoid the CDN trust dependency entirely.
