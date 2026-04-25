# Fix FB-35 — Tactical Plan (planner, bolt 1)

**Finding:** `AnnotationCanvas: unbounded full-canvas ImageData history → memory leak on pen strokes`.
**Feedback:** `.haiku/intents/universal-feedback-model-and-review-recovery/stages/development/feedback/35-annotationcanvas-unbounded-full-canvas-imagedata-history-mem.md`

## TL;DR

`packages/haiku-ui/src/components/AnnotationCanvas.tsx:107-115` pushes a
full-canvas `ImageData` snapshot onto `drawHistoryRef.current` on every
`mousedown` while the pen tool is active, with no cap and no eviction.
At a 4K canvas size (line 58-59 uses `img.naturalWidth`/`img.naturalHeight`
without a ceiling) each snapshot is ~33 MB; 20 strokes pushes the tab
past 500 MB and iOS Safari will kill the tab around 1 GB.

**Fix (builder bolt 2) — stack two mechanical caps:**

1. **Depth cap.** Introduce `const MAX_DRAW_HISTORY = 20` module-level
   constant. In `saveDrawState()` (line 107-115), after `push`, if
   `drawHistoryRef.current.length > MAX_DRAW_HISTORY` call `shift()` until
   length equals `MAX_DRAW_HISTORY`. This bounds worst-case memory to
   `20 × per-snapshot-cost` regardless of user behavior.
2. **Canvas dimension cap.** Introduce `const MAX_CANVAS_DIMENSION = 2048`.
   In `sizeCanvas()` (line 54-71), clamp `canvas.width` / `canvas.height`
   to `Math.min(img.naturalWidth || img.offsetWidth, MAX_CANVAS_DIMENSION)`
   per axis. Do NOT scale the CSS size (`canvas.style.width` /
   `canvas.style.height` still track `img.offsetWidth` /
   `img.offsetHeight`). The existing `getCanvasCoords` scaling at
   line 85-95 already converts CSS-space mouse coords into
   canvas-buffer-space using `canvas.width / rect.width`, so clamping
   `canvas.width` naturally propagates through — pen strokes map to the
   clamped buffer and `getImageData` snapshots are also clamped.

These two caps compose multiplicatively: at the clamped ceiling,
`per-snapshot-cost ≤ 2048 × 2048 × 4 = 16.0 MB`, so worst-case history
is bounded at `20 × 16 MB = 320 MB`. Typical case (1080p mockup,
5 strokes) is `5 × 8.3 MB = 41.5 MB`, well inside mobile budgets.

Stroke-command serialization (option 3 from the feedback) is the
"right" architectural fix but requires rewriting `handleMouseDown` /
`handleMouseMove` / `handleUndo` to operate on a command log instead
of raster snapshots, plus a `redraw()` that replays commands. That is
a larger change that conflicts directly with FB-11's ongoing
"strangler cutover" of this file and risks diverging from the
canonical unit-13 `pages/review/AnnotationCanvas.tsx` the cutover is
targeting. Depth + dimension caps buy the memory-safety guarantee
TODAY without materially changing the component's contract.

Diff-based (option 2) was considered and rejected — capturing a dirty
rectangle requires tracking per-stroke bounds (`min`/`max` x/y during
`handleMouseMove`) and changes the restore path in `handleUndo`. Same
cost as option 3 with less architectural payoff.

## Root cause

The component was authored as a quick visual annotation tool and never
load-tested at realistic screenshot dimensions. `ImageData` is raw RGBA
(4 bytes/pixel) and is never compressed in memory. The author's mental
model was "a few strokes on a reasonably-sized image" — which would
indeed be a few MB total — but nothing in the code enforces that mental
model. A reviewer annotating a 4K Figma export with twenty strokes
breaks every assumption.

Independently, the canvas sizing at lines 58-59 uses the raw image
intrinsic dimensions with no ceiling. This is a second, orthogonal
unbounded-resource risk: a malicious or oversized mockup blows memory
before the user has drawn a single stroke, because `sizeCanvas` also
runs on `img.load` and on window `resize` regardless of tool state.

## Confirmed scope (MUST change)

| File | Change |
|---|---|
| `packages/haiku-ui/src/components/AnnotationCanvas.tsx` | (a) Add `const MAX_DRAW_HISTORY = 20` and `const MAX_CANVAS_DIMENSION = 2048` as module-level constants (above `nextPinId`, line 23). (b) In `sizeCanvas()` (line 54-71), clamp both `canvas.width` and `canvas.height` via `Math.min(..., MAX_CANVAS_DIMENSION)`. (c) In `saveDrawState()` (line 107-115), after `push`, evict from the front via `while (drawHistoryRef.current.length > MAX_DRAW_HISTORY) drawHistoryRef.current.shift()`. |

Three edits, all local. No new imports, no new types, no new props. The
component's public API (`AnnotationCanvas` + `captureAnnotations` +
`AnnotationPin` + `AnnotationCaptureData`) is unchanged.

## Confirmed preserve surface (MUST NOT change)

- The component's props shape (`imageUrl`, `onCapture?`,
  `onPinsChange?`) stays identical. No consumer changes in
  `components/ReviewPage.tsx:654,1102` or anywhere else.
- The pin-placement behavior (line 157-185) is unrelated to this
  finding. Do NOT touch `handleCanvasClick`, `handleSavePin`,
  `handleCancelPin`.
- The freehand draw behavior (line 136-154) is the read path, not the
  write path. `handleMouseMove` / `handleMouseUp` stay untouched —
  only `saveDrawState` and `sizeCanvas` change.
- `handleUndo` (line 192-210) already guards on
  `drawHistoryRef.current.length > 0`, so it continues to work
  correctly when the cap forces a shift — the oldest frames are just
  no longer restorable, which is the intended contract.
- `handleClear` (line 212-222) already resets `drawHistoryRef.current`
  to `[]`. No change.
- The canonical `pages/review/AnnotationCanvas.tsx` (unit-13) is a
  separate component with a different contract; FB-11's cutover will
  eventually replace this legacy file. Do NOT preempt that cutover
  here — fix memory in place on the file reviewers are actually using.
- The `captureAnnotations` helper at line 454-499 reads
  `canvasEl.width` / `canvasEl.height` from the live canvas — once
  those are clamped by `MAX_CANVAS_DIMENSION`, captures use the
  clamped size. This is correct: the screenshot a reviewer sees in
  the UI matches the one that gets captured, because both are
  rendered at the same clamped resolution via the `style.width` /
  `style.height` CSS mapping.

## Files to modify (builder scope)

| File | Action |
|---|---|
| `packages/haiku-ui/src/components/AnnotationCanvas.tsx` | Edit in place — add two constants, clamp canvas dimensions in `sizeCanvas`, evict oldest history entry in `saveDrawState`. |

NO other files should change. In particular:

- Do NOT create a new test file in `packages/haiku-ui/src/components/__tests__/`.
  No `AnnotationCanvas.test.tsx` exists today (the directory has
  `AssessorSummaryCard`, `RevisitModal`, `StageProgressStrip`,
  `ThemeToggle`), and FB-11's cutover plan intends to delete this legacy
  file eventually. Adding tests here would create throwaway test-file
  entropy that must then be migrated or deleted with the cutover.
  The fix is a mechanical, reviewable three-line change — the feedback-
  assessor can verify correctness via `grep` + reading the diff.
- Do NOT touch the canonical `packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx`.
  Different file, different contract, owned by unit-13 / FB-11.
- Do NOT rewrite the component to use stroke-command serialization.
  That's the architectural endgame, not the memory-safety fix.
- Do NOT update DESIGN-TOKENS, DESIGN-BRIEF, CLAUDE.md, or the paper.
  No methodology change; this is a performance bug fix.

## Risk assessment

- **Does clamping `canvas.width` / `canvas.height` change the visual
  output?** No. `canvas.style.width` / `canvas.style.height` still
  track the image's layout dimensions (`img.offsetWidth` /
  `img.offsetHeight`), so the canvas overlay still covers exactly the
  image in CSS-space. The browser scales the clamped backbuffer to
  the CSS size using bilinear filtering. For a 4K image clamped to
  2048, the overlay resolution drops from 4K to 2K — imperceptible
  for hand-drawn annotations, which are 3px wide (`ctx.lineWidth = 3`,
  line 131) and designed for reviewer-legibility, not pixel-precise
  rendering.
- **Does `getCanvasCoords` still map mouse coords correctly after
  the clamp?** Yes. Line 89-94 computes `scaleX = canvas.width / rect.width`
  and `scaleY = canvas.height / rect.height` — both sides of the
  ratio update when `canvas.width` is clamped, because `rect.width`
  comes from the CSS-space size (unchanged). The coords get
  multiplied by the new, lower scale factor and land in the correct
  buffer location.
- **Does shifting the oldest history frame break `handleUndo`?** No.
  `handleUndo` pops from the tail (`drawHistoryRef.current.pop()`),
  never touches the head, and has an explicit empty-array guard at
  line 193. The contract "undo restores the previous stroke" becomes
  "undo restores up to the last 20 strokes, then falls back to
  popping pins" — an intentional graceful degradation. Most users
  never take 20 undo steps in a single session.
- **Does the `while` loop in `saveDrawState` ever iterate more than
  once?** In production, no — the loop runs at most once per
  `saveDrawState` call because we always evict after a single `push`.
  The `while` is defensive against a future refactor that might
  bulk-push frames; `if` would be equally correct today.
- **Concurrency / race conditions?** None. `drawHistoryRef` is a
  `useRef`, not reactive state. All mutations happen inside event
  handlers on the React main thread. No async gaps.
- **Does restoring from a shifted-past history cause visual artifacts
  on `sizeCanvas` (line 64-70)?** `sizeCanvas` restores from
  `drawHistoryRef.current[length - 1]` — the MOST RECENT snapshot.
  The shift() cap only removes from the FRONT (oldest frames), so the
  restore path is unaffected. Double-checked: line 66 indexes
  `[length - 1]`, which is always the newest entry.
- **Does the `ImageData` from a pre-resize canvas still `putImageData`
  correctly onto a post-resize canvas?** This is the `sizeCanvas`
  restore path. `putImageData` at line 65-69 writes at `(0, 0)` into
  the new canvas. If the new canvas is smaller than the `ImageData`
  was captured at, the excess pixels are clipped (Canvas API spec
  behavior — no error). If larger, the remainder is transparent black.
  This is a pre-existing behavior not introduced by the fix. With the
  `MAX_CANVAS_DIMENSION` clamp, the canvas dimensions stabilize after
  the first `sizeCanvas` call (clamp is idempotent for the same
  image), so subsequent resize events are no-ops for buffer content.
- **Parallel-chain clobber risk.** Feedback ledger inspection:
  - FB-11 (duplicate ReviewPage + AnnotationCanvas) — touches both
    `components/AnnotationCanvas.tsx` AND `pages/review/AnnotationCanvas.tsx`
    but per its current plan, the LEGACY `components/AnnotationCanvas.tsx`
    is kept as-is and the orphaned `pages/review/` copy gets deleted.
    So FB-11 should NOT be modifying the file FB-35 touches. Still,
    builder MUST re-read the file immediately before editing.
  - FB-22 (1659-line monolith split) — owns `components/ReviewPage.tsx`,
    not `components/AnnotationCanvas.tsx`. No overlap.
  - FB-24 (already committed per log) and FB-45 (annotation canvas
    duplicates textarea body) — FB-45 is on
    `pages/review/AnnotationCanvas.tsx`, not our file. No overlap.
  - FB-58 (annotation pin markers contrast) — CSS/color concern,
    lives in `index.css` — no code overlap.
  Net: no parallel chain is expected to touch
  `components/AnnotationCanvas.tsx`. Builder MUST still re-read
  immediately before editing — if a parallel chain HAS touched it,
  apply fixes additively.

## Verification commands (builder must run)

```bash
# (a) Confirm the two cap constants exist at module scope.
rg 'MAX_DRAW_HISTORY|MAX_CANVAS_DIMENSION' packages/haiku-ui/src/components/AnnotationCanvas.tsx
#   expected: at least four matches — two definitions + two usages

# (b) Confirm saveDrawState evicts oldest entries.
rg -A 3 'function saveDrawState' packages/haiku-ui/src/components/AnnotationCanvas.tsx
#   expected: function body includes either `shift()` or `splice(0, ...)`

# (c) Confirm sizeCanvas clamps both dimensions.
rg -A 10 'const sizeCanvas' packages/haiku-ui/src/components/AnnotationCanvas.tsx
#   expected: canvas.width assignment wraps Math.min(..., MAX_CANVAS_DIMENSION)
#             canvas.height assignment wraps Math.min(..., MAX_CANVAS_DIMENSION)

# (d) Confirm the drawHistoryRef push at line 112-114 did not get deleted.
rg 'drawHistoryRef.current.push' packages/haiku-ui/src/components/AnnotationCanvas.tsx
#   expected: exactly one match, in saveDrawState

# (e) Type-check the UI package.
npx tsc -p packages/haiku-ui --noEmit
#   expected: exit 0

# (f) Full UI-package test sweep — nothing should regress.
npx vitest run --dir packages/haiku-ui
#   expected: all tests green. No test for this component exists; the
#             run must still pass for the package overall (consumers
#             of the canvas in ReviewPage etc. have indirect coverage).

# (g) Build still passes.
npm run build -w haiku-ui
#   expected: exit 0
```

## Handoff to the builder

Builder bolt (bolt 2) should:

1. Re-read `packages/haiku-ui/src/components/AnnotationCanvas.tsx`
   and confirm the line landmarks roughly match FB-35's body:
   - `drawHistoryRef` declaration around line 50.
   - `sizeCanvas` spans ~line 54-71, with `canvas.width` on line 58
     and `canvas.height` on line 59.
   - `saveDrawState` spans ~line 107-115.
   - `handleMouseDown` spans ~line 118-134 and calls `saveDrawState()`
     on line 122.
   If the file has drifted (another chain partially fixed it), apply
   only the missing sub-fixes additively.
2. At module scope, just above `function nextPinId()` (~line 23), add:
   ```ts
   const MAX_DRAW_HISTORY = 20
   const MAX_CANVAS_DIMENSION = 2048
   ```
3. In `sizeCanvas`, replace lines 58-59:
   ```ts
   canvas.width = img.naturalWidth || img.offsetWidth
   canvas.height = img.naturalHeight || img.offsetHeight
   ```
   with:
   ```ts
   canvas.width = Math.min(
     img.naturalWidth || img.offsetWidth,
     MAX_CANVAS_DIMENSION,
   )
   canvas.height = Math.min(
     img.naturalHeight || img.offsetHeight,
     MAX_CANVAS_DIMENSION,
   )
   ```
4. In `saveDrawState`, after the existing `drawHistoryRef.current.push(...)`
   call at line 112-114, append:
   ```ts
   while (drawHistoryRef.current.length > MAX_DRAW_HISTORY) {
     drawHistoryRef.current.shift()
   }
   ```
5. Run verification commands (a) through (g) in order.
6. Commit with `haiku: fix FB-35 bolt 2 (builder)`. Do NOT push.
7. If any verification step fails, stop and capture the output in
   the commit body rather than forcing through. Feedback-assessor
   (bolt 3) will re-open the finding and the FSM will retry.

## Out of scope

- **Stroke-command serialization** (option 3 in the feedback).
  Architecturally correct but materially larger — changes the
  fundamental data model from raster snapshots to a command log, and
  conflicts with FB-11's planned cutover to the canonical
  `pages/review/AnnotationCanvas.tsx`. Depth + dimension caps
  dominate this decision: they deliver the memory-safety guarantee in
  three edits today without prejudicing the future cutover.
- **Dirty-rectangle snapshots** (option 2 in the feedback). Same
  reasoning — larger change, smaller payoff, risk of breaking the
  existing `handleUndo` restore path.
- **Authoring `AnnotationCanvas.test.tsx` under `components/__tests__/`.**
  FB-11's cutover plan either deletes this file or reduces it to a
  thin shim; adding test scaffolding here is throwaway work.
  Feedback-assessor (bolt 3) can verify this fix by reading the diff
  and confirming the grep-based assertions above.
- **Migrating consumers off `components/AnnotationCanvas.tsx`.** Owned
  by FB-11. Our fix must NOT preempt that cutover.
- **Paper / website / CLAUDE.md updates.** No methodology change; this
  is a component-level performance bug fix. Sync discipline does not
  apply.

## Done when

- `rg 'MAX_DRAW_HISTORY' packages/haiku-ui/src/components/AnnotationCanvas.tsx`
  returns at least two matches (definition + usage in `saveDrawState`).
- `rg 'MAX_CANVAS_DIMENSION' packages/haiku-ui/src/components/AnnotationCanvas.tsx`
  returns at least three matches (definition + two usages in
  `sizeCanvas` for width and height).
- `rg 'drawHistoryRef.current.shift' packages/haiku-ui/src/components/AnnotationCanvas.tsx`
  returns exactly one match, inside `saveDrawState`.
- `npx tsc -p packages/haiku-ui --noEmit` exits 0.
- `npx vitest run --dir packages/haiku-ui` exits 0 with all existing
  tests green.
- `npm run build -w haiku-ui` exits 0.
- `haiku: fix FB-35 bolt 2 (builder)` commit exists on the branch.
- Feedback-assessor (bolt 3) confirms: (1) history array is bounded
  at `MAX_DRAW_HISTORY = 20` via front-eviction in `saveDrawState`,
  (2) canvas buffer dimensions are clamped at `MAX_CANVAS_DIMENSION = 2048`
  per axis in `sizeCanvas`, (3) public API is unchanged, (4) no test
  file was added under `components/__tests__/`.
