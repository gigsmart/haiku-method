---
title: >-
  AnnotationCanvas: unbounded full-canvas ImageData history → memory leak on pen
  strokes
status: fixing
origin: adversarial-review
author: performance
author_type: agent
created_at: '2026-04-21T20:23:28Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

## Finding

`packages/haiku-ui/src/components/AnnotationCanvas.tsx:107-115` captures a full-canvas `ImageData` via `ctx.getImageData(0, 0, canvas.width, canvas.height)` on every `mousedown` when the pen tool is active, and pushes it onto `drawHistoryRef.current` with no cap.

```ts
function saveDrawState() {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  drawHistoryRef.current.push(
    ctx.getImageData(0, 0, canvas.width, canvas.height),
  )
}
```

`handleMouseDown` at line 118-134 calls `saveDrawState()` at the start of every pen stroke. No eviction, no depth cap.

## Concrete memory cost

`ImageData` is raw RGBA, 4 bytes per pixel, always uncompressed in memory. At canvas size equal to `img.naturalWidth × img.naturalHeight` (line 58-59):

| Image size | Per-snapshot cost | After 50 strokes |
|------------|-------------------|------------------|
| 800×600    | 1.9 MB            | 95 MB            |
| 1920×1080  | 8.3 MB            | 415 MB           |
| 2560×1440  | 14.7 MB           | 737 MB           |
| 3840×2160 (4K) | 33.2 MB       | 1.66 GB          |

A reviewer annotating a 4K mockup or screenshot with ~20 pen strokes will push the tab past 500 MB with zero warning. On mobile Safari, this will crash the tab (iOS Safari tabs get killed around 1 GB on most devices).

`handleUndo` (line 192-210) also performs full `putImageData` restores — at 4K each undo is 33 MB of memory bandwidth per stroke reversal.

## Mandate violation

The performance mandate requires "no blocking operations on hot paths" and "large collections are paginated, not loaded entirely into memory." A `drawHistoryRef` array of unbounded `ImageData` blobs on a user-facing annotation tool is a textbook unbounded collection in memory on a hot interaction path.

## Suggested fixes (pick one or stack)

1. **Cap history depth** — `const MAX_HISTORY = 20`; shift() oldest when exceeded. Cheapest fix.
2. **Store diffs, not full frames** — capture only the dirty rectangle around the stroke (a few KB typical) instead of the whole canvas.
3. **Serialize stroke commands** instead of raster snapshots — `[{type: 'stroke', points: [...]}]` is ~100 bytes per stroke regardless of canvas size. Redraw from the command log on undo. This is the standard pattern for canvas editors (Figma, tldraw, Excalidraw).
4. **Cap canvas render size** — line 58-59 uses `img.naturalWidth`/`img.naturalHeight` without a ceiling. A 4K mockup blows memory before the user has drawn anything. Clamp to e.g. 2048 on each axis and `ctx.scale` the draw coords.

## File references

- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:50` (declaration: `const drawHistoryRef = useRef<ImageData[]>([])`)
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:54-71` (canvas sizing — no max)
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:107-115` (`saveDrawState` — no cap, no eviction)
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:118-134` (`handleMouseDown` calls saveDrawState on every pen stroke)
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:192-210` (`handleUndo` does full-canvas putImageData)
- `packages/haiku-ui/src/components/AnnotationCanvas.tsx:212-222` (`handleClear` does clear the array — good — but that only helps *after* the reviewer explicitly clicks Clear)
