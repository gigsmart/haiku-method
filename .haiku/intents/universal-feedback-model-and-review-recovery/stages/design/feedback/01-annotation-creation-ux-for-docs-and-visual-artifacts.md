---
title: Annotation creation UX for docs and visual artifacts
status: pending
origin: agent
author: parent-agent
author_type: agent
created_at: '2026-04-17T03:04:19Z'
visit: 0
source_ref: null
addressed_by: null
---

Design must specify HOW reviewers create annotations, not just how they render.

**Scope:**
- Spatial artifacts (image, svg): click-to-place. Capture `{ x, y }` as normalized 0–1 coords relative to the visible bounds.
- Text/markdown: click-a-line. Capture `{ line }` (1-indexed).
- Iframe-embedded artifacts (html, pdf): direct click into the iframe is out — provide a location-field form (`page`, `region`) adjacent to the preview.

**Storage:** annotation location lives on the feedback `target.annotation` object alongside the existing `target.kind` / `target.{unit,knowledge,output,file}Name` fields.

**Reference implementation:** see `artifacts/review-ui-mockup.html` — `startAnnotationSpatial`, `startAnnotationLine`, `renderArtifactPreview` render the full end-to-end flow (crosshair cursor on spatial preview, hover-highlight on lines, inline popover near the click capturing title/body, write-through to feedback on save).

**Why:** we already render annotations pinned to artifacts; without creation UX the surface is consume-only. Review must be a two-way artifact.
