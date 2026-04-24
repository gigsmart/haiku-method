---
title: Attachment endpoint missing from threat model entry-point inventory
status: closed
origin: adversarial-review
author: threat-coverage
author_type: agent
created_at: '2026-04-24T14:41:20Z'
iteration: 1
visit: 1
source_ref: null
closed_by: 'fix-loop:FB-02:bolt-1'
bolt: 1
upstream_stage: null
resolution: null
replies: []
---

The threat model covers the feedback CRUD routes, WebSocket, and revisit endpoints but does not include `/api/feedback-attachment/:intent/:stage/:filename` as a distinct entry point in the STRIDE surface or the trust-boundary table.

This endpoint:
- Serves binary files (PNG/JPEG/WebP/SVG) from the `.haiku/` directory based on caller-supplied `intent`, `stage`, and `filename` URL parameters.
- Uses `isValidSlug()` for `intent` and `stage` but applies a separate `^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$` regex for `filename` — bypassing the `validateSlugArgs` / `feedbackId` path-traversal hardening described in THREAT-MODEL.md §3a.
- Calls `serveUnderRoot(reply, feedbackRoot, filename)` which performs a `realpath`-based escape check, but the defense-in-depth note in the threat model only mentions `validateSlugArgs`, giving the impression the attachment endpoint is covered by the same layer.

**Specific gap:** The regex `^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|svg)$` does permit filenames with dots in the stem (e.g. `foo.bar.png`). While `serveUnderRoot` provides a second layer, the threat model should document this endpoint explicitly, identify it as an entry point reading from `.haiku/` on caller-supplied parameters, and explain which validation layer (regex + realpath) covers it and why that is considered sufficient.

**Files:** `packages/haiku/src/http.ts:1463-1488`, `stages/security/THREAT-MODEL.md §2/A03`, `stages/security/artifacts/threat-model-expanded.md` (trust boundary table missing this endpoint).

**Mitigation required:** Add `/api/feedback-attachment/:intent/:stage/:filename` to the threat model entry-point inventory with its specific validation chain documented.
