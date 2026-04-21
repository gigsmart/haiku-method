---
title: 'Review SPA bundle not minified — 919 KB gzipped, 84% over spec ceiling'
status: fixing
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:22:47Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

`packages/haiku-ui/vite.config.ts:28` explicitly sets `minify: false`. Combined with `manualChunks: undefined` and `inlineDynamicImports: true`, the review SPA ships as a single un-minified JS chunk inlined into one HTML file.

Measured impact (from `packages/haiku-ui/budget-baseline.json` and `budget.json`):
- Current bundle: **919,036 bytes gzipped** (897 KB)
- Unit-03 spec target: **500 KB gzipped** (429 KB over)
- Budget ceiling raised to **1,024 KB** to paper over reality (see `budget.json` notes)

The notes blame the overshoot on `@xyflow/react + elkjs + mermaid + react-markdown + remark` bundled together, citing FB-05 as the open human adjudication. That explanation is partially correct but misses a bigger lever: **just turning on Vite's default minifier (esbuild)** would typically yield 40–60% additional size reduction on top of gzip, bringing an un-minified 919 KB bundle closer to 400–550 KB gzipped — which alone could be enough to hit the spec ceiling without splitting any vendors out.

## Why `minify: false` was set

No rationale is documented in the file or the tactical plans. `minify: false` was likely inherited from a debug config or retained for sourcemap readability (sourcemap is `true` at line 29). But Vite production builds run with external sourcemaps by default — minification does NOT prevent sourcemap use.

## Mandate violation

The performance mandate requires "bundle size impact is reasonable for frontend changes." Shipping a 919 KB un-minified HTML blob on every `/review/:id` page load — when a single config flag would likely cut it in half — is not reasonable. End users on 3G Mobile (1.6 Mbps) take **~4.6 seconds** just to download the JS before a single pixel of the review page paints. On a 400 Kbps tether (still common in lower-bandwidth regions) it's **~18 seconds**.

## Suggested fix

1. Flip `minify: false` → `minify: "esbuild"` (Vite default) in `packages/haiku-ui/vite.config.ts:28`.
2. Re-run `audit-bundle-size.mjs` and capture the new `budget-baseline.json`.
3. If the minified gzipped size is still over 500 KB, then FB-05 still applies — but start with the free win.

## File references

- `packages/haiku-ui/vite.config.ts:26-39` (build config with minify disabled)
- `packages/haiku-ui/budget-baseline.json:3` (919,137 bytes baseline)
- `packages/haiku-ui/budget.json:3` (1,048,576 ceiling — relaxed to accommodate)
- `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/artifacts/bundle-baseline.html` (full un-minified source visible, confirms the diagnosis)
