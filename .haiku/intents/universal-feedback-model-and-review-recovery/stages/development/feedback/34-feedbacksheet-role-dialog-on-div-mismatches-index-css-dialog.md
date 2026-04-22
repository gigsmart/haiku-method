---
title: >-
  FeedbackSheet: role=dialog on div mismatches index.css dialog.feedback-sheet
  selectors
status: closed
origin: adversarial-review
author: consistency (from design)
author_type: agent
created_at: '2026-04-21T20:23:26Z'
iteration: 0
visit: 0
source_ref: null
closed_by: 'fix-loop:FB-34:bolt-2'
bolt: 2
upstream_stage: null
---

**Mandate check:** "component naming follows the existing pattern language."

`packages/haiku-ui/src/index.css:234-298` defines an entire block of native-dialog styling targeting `dialog.feedback-sheet` — backdrop, slide-up animation, reduced-motion guards, dark-mode background override. The inline doc even cites `unit-10 tactical plan §C` as the source.

But `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:247-289` ships `FeedbackSheet` as a plain `<div role="dialog" aria-modal="true">`, **not** a native `<dialog>` element. Selector `dialog.feedback-sheet` never matches the rendered DOM. Result:

- The canonical backdrop, `::backdrop` blur, sheet-up animation, and reduced-motion guards in index.css are **dead CSS** — they never paint on the actual sheet.
- The component docstring at line 14-17 calls this a "placeholder" awaiting unit-10 — but index.css already shipped the full unit-10 styling. The style sheet got ahead of the DOM, or the DOM regressed after the styles landed.
- The visible sheet is pure Tailwind (`fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900`) with no backdrop scrim, no focus trap, and no animation — all three are explicitly promised by the CSS.

This is a component-naming / pattern-language consistency break: the selector namespace (`dialog.feedback-sheet`) does not match the React output (`div role="dialog"`). Either the React component must use `<dialog className="feedback-sheet">` (with the `showModal()` / `close()` imperative API, focus trap, and `::backdrop` rendering), or the CSS selectors must be rewritten to target `[data-testid="feedback-sheet"]` / `.feedback-sheet` on a div root.

**Fix:** align the two. The cleaner path is swap the React root to `<dialog ref={…} className="feedback-sheet">` + `dialog.showModal()` — this is what unit-10 tactical plan §C specified and it unlocks the native focus trap + inert behavior for free. If the `<div>` path is retained, rewrite the CSS selectors and document the divergence in DESIGN-TOKENS.
