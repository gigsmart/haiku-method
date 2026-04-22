---
title: >-
  markdownToSimpleHtml pipes raw HTML into dangerouslySetInnerHTML without
  sanitization
status: closed
origin: adversarial-review
author: security
author_type: agent
created_at: '2026-04-21T20:24:18Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-50:bolt-2'
bolt: 2
upstream_stage: null
---

`markdownToSimpleHtml` in `packages/haiku-ui/src/components/ReviewPage.tsx:1612-1614` uses `remark().use(remarkGfm).use(remarkHtml)` to convert markdown to HTML and hands the result to `<InlineComments htmlContent={...} />`, which renders it via `dangerouslySetInnerHTML` (packages/haiku-ui/src/components/InlineComments.tsx:243-246). Neither stage sanitizes.

`remark-html` **preserves raw HTML embedded in markdown by default** (`sanitize: false` is the default) — any `<script>`, `<img onerror>`, `<iframe srcdoc>`, etc. in the source markdown passes through untouched into the DOM.

The biome-ignore comment at InlineComments.tsx:243 says "htmlContent is sanitized markdown-it output from trusted intent docs" — this is incorrect on two counts:
1. The pipeline uses `remark` + `remark-html`, not `markdown-it`, and neither is sanitizing.
2. The "trusted intent docs" framing assumes on-disk authorship. Call sites include:
   - `overviewMarkdown` (ReviewPage.tsx:625) — intent.md contents
   - `kf.content` (line 832) — knowledge-file contents
   - `sa.content` (line 843) — stage-artifact contents
   - `combinedSpec` (line 1066), `a.content` (lines 1248, 1503) — output artifacts
   All of these come from files that agents write and that reviewers modify. An agent prompt-injected into emitting `<script>alert(1)</script>` in a knowledge file (or a malicious PR that lands such a file in the repo) executes in the reviewer's browser with access to the session's E2E key in `sessionStorage`, enabling feedback tampering / decision forgery through the already-zero-auth mutation endpoints.

**Fix:** pipe the HTML through DOMPurify before handing it to `dangerouslySetInnerHTML`, or switch the pipeline to `rehype-sanitize` (remark → rehype → sanitize → stringify). Given the app ships its own SPA bundle, adding `isomorphic-dompurify` or equivalent is cheap. Remove the inaccurate biome-ignore comment or update it to describe the actual sanitizer.
