---
title: >-
  DirectionPage PreviewDialog is a modal without focus trap or initial focus
  management
status: pending
origin: adversarial-review
author: accessibility (from design)
author_type: agent
created_at: '2026-04-21T20:27:15Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 0
upstream_stage: null
---

**Severity:** major — WCAG 2.1.2 (No Keyboard Trap, inverse — here focus must BE trapped inside the modal) + WAI-ARIA 1.2 dialog pattern both violated.

**File:** `packages/haiku-ui/src/pages/direction/DirectionPage.tsx:387-431`

The `PreviewDialog` component carries `role="dialog" aria-modal="true"` (line 399-401). A conformant modal dialog MUST:
1. Move initial focus into the dialog when it opens.
2. Trap Tab / Shift+Tab inside the dialog while open.
3. Restore focus to the invoking element (the "View full size" button, line 369-376) on close.

This implementation does **none** of those. The parent only wires a document-level `Escape` key handler (line 143-150). Consequences:
- A keyboard user opening the preview is focused on the "View full size" button they just pressed. Tab proceeds to the next tabbable element in the document (often somewhere below the dialog, OUTSIDE the dialog surface) — the dialog claims modality but the keyboard goes right past it.
- Screen reader users hear "Full size preview: <name>" via `aria-label` only if focus is moved into the dialog — which never happens.
- Closing via Escape does `setPreviewArchetype(null)` but the invoking button's ref is never captured, so after close the focus lands on `<body>` — the user loses their place in the archetype list.

Meanwhile, `packages/haiku-ui/src/a11y/focus.ts:112-175` already ships a `useFocusTrap(ref, enabled)` hook that handles all three contracts (initial focus, Tab wrap, priorFocus snapshot + restore). It's not being used here.

Related defects in the same component:
- Inner container uses `onClick={(e) => e.stopPropagation()}` + outer `onClick={onClose}` for backdrop-to-close. Both are `<div>` elements; the outer `<div>` has `role="dialog"` but ALSO owns the backdrop click — that is a role conflict. The accessible dialog pattern keeps the backdrop on a sibling element with `aria-hidden`.
- Close button is a native `<button>` with `aria-label="Dismiss preview"` — OK — but lacks `focusRingClass`. It does have `${focusRingClass}` interpolation at line 416, correct.

**Why the audit missed it.** No audit covers "every role=dialog has useFocusTrap wiring." Biome a11y rules catch the dialog-on-div pattern via `useSemanticElements`, which is suppressed here with a `biome-ignore` comment — but that's cosmetic; no runtime test verifies trap behavior.

**Fix direction:** 
- Wrap the inner container with `useFocusTrap(ref, true)` while the dialog is open.
- Add an explicit focus target (e.g. the close button or the dialog heading with tabIndex=-1) so the hook has a valid first-tabbable to land on.
- Capture the invoking button's ref at the `onPreview(arch.name)` call site, pass it to `PreviewDialog`, and restore focus to it in the close path.
- Add a ReviewPage-level integration test that asserts (i) focus moves into the dialog, (ii) Tab doesn't escape, (iii) on close focus returns to the invoker.
