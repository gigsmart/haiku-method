---
title: Duplicate FeedbackSheet + FeedbackFloatingButton with incompatible APIs
status: fixing
origin: adversarial-review
author: architecture
author_type: agent
created_at: '2026-04-21T20:21:59Z'
iteration: 0
visit: 0
source_ref: null
closed_by: null
bolt: 1
upstream_stage: null
---

Two components with the same name exist in the tree, with **different prop signatures**, and both are exported from production code paths:

**FeedbackSheet**
- `packages/haiku-ui/src/components/feedback/FeedbackSheet.tsx:55-118` — native `<dialog>` based, controlled-only API: `{ open, onClose, triggerRef, ... }`. Uses `useFocusTrap`, reduced-motion hooks, backdrop-click close. 285 LOC. Exported from `components/feedback/index.ts:25-26`.
- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:217-291` — `role="dialog"` div, different API: `{ intent, stage, sessionId, isOpen, onClose }`. Prop name `isOpen`, not `open`. No focus trap — explicitly says "Full focus-trap + aria-hidden on main content is unit-10's scope" even though unit-10 already landed.

**FeedbackFloatingButton**
- `packages/haiku-ui/src/components/feedback/FeedbackFloatingButton.tsx:80-83` — `forwardRef`, API: `{ open, onToggle, count, ariaControlsId, className }`. Exported from `components/feedback/index.ts:8-9`.
- `packages/haiku-ui/src/pages/review/FeedbackSidebar.tsx:188-215` — plain function, API: `{ onClick, isOpen, pendingCount, className }`. Prop names diverged (`onClick`/`isOpen`/`pendingCount` vs `onToggle`/`open`/`count`).

The pages/review variants are what `pages/review/ReviewPage.tsx` renders (line 170, 174). The canonical variants in `components/feedback/*` are snapshot-tested and documented as the unit-10 deliverable but are not actually wired into the review page.

**Architecture impact:**
1. Naming collision — two `FeedbackSheet` exports with different contracts in the same package surface area
2. The review page renders the placeholder variant; the "canonical" a11y-complete variant is dead code in the runtime graph
3. The unit-10 DESIGN-BRIEF-referenced contract (`aria-haspopup="dialog"`, dynamic accessible name with pending count, `aria-controls="feedback-sheet"`, focus-trap, native `<dialog>`) is implemented in the unused component and absent from the one that actually renders

**Fix:** delete the inline variants in `pages/review/FeedbackSidebar.tsx` and import from `components/feedback`. The "canonical" ones already exist — use them. If the review page needs a FeedbackPanelBody wrapper, keep that; but remove the duplicate FAB + sheet.
