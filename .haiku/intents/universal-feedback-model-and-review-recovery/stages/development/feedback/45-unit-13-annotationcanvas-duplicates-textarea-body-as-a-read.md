---
title: >-
  unit-13: AnnotationCanvas duplicates textarea body as a read-only paragraph
  below the editor — data-echo UX bug
status: fixing
origin: adversarial-review
author: correctness
author_type: agent
created_at: '2026-04-21T20:24:01Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 2
upstream_stage: null
---

`packages/haiku-ui/src/pages/review/AnnotationCanvas.tsx:722-742` renders the popover's Detail textarea followed immediately by a `<p>` that echoes `currentDraft.body`:

```tsx
<textarea
  id={`${popoverId}-body-input`}
  rows={3}
  value={currentDraft.body}
  onChange={...}
  placeholder="What needs attention?"
  .../>
{/* Body rendered as React text children only (no innerHTML). */}
<p className="text-[11px] text-stone-600 dark:text-stone-400 line-clamp-3 mb-2">
  {currentDraft.body}
</p>
```

Result: every keystroke in the Detail textarea appears twice on screen — once in the input and once as the truncated `<p>` below (with `line-clamp-3`). This is not in any spec (unit-13-annotation-canvas.md), not in any of the design artifacts the spec pointed at (`annotation-popover-states.html`, `annotation-gesture-spec.html`), and visibly produces wrong UX:

1. The `<p>` has no semantic role — it's redundant visible text, interpreted by screen readers as additional content, polluting the a11y tree of the popover (already role="group" with aria-label).
2. On narrow viewports the echo area wraps and shifts the Create/Cancel buttons downward unpredictably.
3. Authors reasonably expect one edit surface, not two. The `line-clamp-3` suggests the author thought this would be a "preview" — but it shows the same text the user just typed and can read in the textarea one row up.

The inline comment "Body rendered as React text children only (no innerHTML). The XSS regression guard `banned-xss-sinks-annotation-path` prevents future drift." is preserving the XSS *regression guard* — but that regression guard applies to wherever user content gets rendered. You don't need a mirror `<p>` to prove you don't use innerHTML; the textarea already renders content as a text-node `value`.

**Required fix:**
- Remove the `<p>` echo entirely (lines 740-742).
- Keep the comment about XSS hardening (it still applies to any future read-only rendering path, e.g. a post-submit preview card, but it should live as a code comment near that path, not mid-editor).
- If there's a genuine preview requirement (not in spec), add it below the Create button with a clear heading ("Preview") and only show it for already-submitted pins, not for the currently-editing draft.
