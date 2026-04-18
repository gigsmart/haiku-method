# State Coverage Grid (FB-25)

Closes **FB-25**. Enumerates every interactive surface in the design artifacts with explicit coverage of six states: **default**, **hover**, **focus**, **active**, **disabled**, **error**. An extra **empty** column is added where the surface has a meaningful "no content" state. `N/A` means the state is unreachable by design (rationale in footnotes).

Legend: `✓` = rendered; `—` = N/A (see note); `⚠` = gap (tracked for follow-up).

---

## Pins, markers, ghosts (annotation overlay layer)

Artifacts: `feedback-inline-desktop.html`, `annotation-gesture-spec.html`, `annotation-popover-states.html`.

| Surface | default | hover | focus | active | disabled | error | Notes |
|---|---|---|---|---|---|---|---|
| Pin marker (w-7 h-7, 44×44 hit) | ✓ | ✓ (brightness 1.08) | ✓ (teal 2px, 3px offset) | ✓ (brightness 0.92) | ✓ (opacity 0.45, cursor not-allowed) | ✓ (red-500 ring on cross-flash miss) | `.pin-hit::before` provides the 44×44 invisible hit zone. See `touch-target-audit.md` for dimensions. |
| Ghost pin (click-to-place) | ✓ | — [1] | — [1] | — [1] | — [1] | — | Ephemeral cursor-follower; not a focusable control. `pointer-events: none`. |
| Pin popover | ✓ | — | ✓ (outline via first-field focus) | — | ✓ (State 4b — Create button inert on empty body) | ✓ (State 4 — red banner, preserved draft) | Popover itself is a `role="dialog"`; its interior buttons carry all states. |

[1] Ghost pin has `pointer-events: none` and exists only between pointer-move and pointer-up. A11y-wise it's decorative.

---

## Feedback cards (sidebar list items)

Artifacts: `feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `feedback-card-states.html`, `comment-to-feedback-flow.html`.

| Surface | default | hover | focus | active | disabled | error | empty |
|---|---|---|---|---|---|---|---|
| Feedback card (compact) | ✓ | ✓ (teal border bump) | ✓ (focus-visible 2px teal) | ✓ (depress + brightness) | ✓ (opacity 0.6 when read-only/locked) | ✓ (§5b red-tinted card — `feedback-card-states.html`) | ✓ (list-level empty copy — `feedback-inline-*` §empty-state) |
| Feedback card (expanded) | ✓ | — [1] | ✓ | — | ✓ (busy state, `aria-busy="true"`) | ✓ (inline error row above footer) | — |
| Pending footer buttons (Reject / Close) | ✓ | ✓ | ✓ | ✓ | ✓ (`disabled` while saving) | ✓ (toast + red ring) | — |
| Addressed footer buttons (Verify & Close / Re-open) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Closed / Rejected footer buttons (Re-open) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Status badge (pending / addressed / closed / rejected) | ✓ | — [2] | — [2] | — [2] | — [2] | ✓ (contrast-preserved inside red-tinted card) | — |

[1] Expanded card is the hover + click terminal state; no nested hover.
[2] Status badge is a label, not a control; it inherits focus from the card.

---

## FAB + bottom sheet (mobile)

Artifact: `feedback-inline-mobile.html`.

| Surface | default | hover | focus | active | disabled | error | empty | pulse |
|---|---|---|---|---|---|---|---|---|
| FAB | ✓ | ✓ (teal-700 fill) | ✓ (2px offset + teal-500 ring) | ✓ (teal-800 fill + scale 0.97) | ✓ (opacity 0.5, grayscale 0.4) | — [1] | ✓ (hidden when no pending items) | ✓ (2s × 3 iter, reduced-motion → static badge) |
| Sheet close ✕ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Sheet sheet-enter anim | ✓ | — | — | — | — | — | — | reduced-motion → appears in-place |
| Segmented control (Feedback / Mine) | ✓ | ✓ | ✓ | ✓ | — | — | — (tabs always visible) | — |
| Filter pills (All / Pending / Addressed / Closed) | ✓ | ✓ | ✓ | ✓ (pressed) | — | — | — | — |
| Sheet footer textarea | ✓ | — | ✓ (teal ring) | — | ✓ (during submit) | ✓ (red border on validation fail) | ✓ (placeholder) | — |
| Add button | ✓ | ✓ | ✓ | ✓ | ✓ (until textarea has content) | ✓ | ✓ | — |
| Approve / Request Changes | ✓ | ✓ | ✓ | ✓ | ✓ (during submit + until condition met) | ✓ (toast + button returns to idle) | — | — |

[1] FAB disabled state used when the user is on a non-review page; normal flow keeps it enabled.

---

## Revisit modal

Artifacts: `revisit-modal-spec.html`, `revisit-modal-states.html`.

| Element | default | hover | focus | active | disabled | loading | error | empty |
|---|---|---|---|---|---|---|---|---|
| Confirm & Revisit button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (spinner → label "Saving…") | ✓ (label → "Retry" + red ring) | — |
| Cancel button | ✓ | ✓ | ✓ (initial focus on modal open) | ✓ | ✓ (during loading) | ✓ (disabled) | ✓ | — |
| Mobile ✕ close | ✓ | ✓ | ✓ | ✓ | ✓ (during loading) | ✓ | ✓ | — |
| Target chip | ✓ | — [1] | — [1] | — [1] | — [1] | ✓ (dim 75%) | ✓ (preserved) | ✓ ("currently viewed — no earlier unaddressed") |
| Downstream chip | ✓ | — | — | — | — | ✓ (dim 75%) | ✓ | ✓ (shows all non-upcoming stages) |
| Typed-feedback preview | ✓ (when typed) | — | — | — | — | ✓ (dim 75%) | ✓ (preserved) | ✓ (suppressed when empty) |
| Open-feedback list | ✓ | — | — | — | — | ✓ (dim 75%) | ✓ (preserved) | ✓ (suppressed when count=0) |
| Backdrop | ✓ | — | aria-hidden | click = cancel | — | click suppressed | ✓ | ✓ |
| **Rollback toast (NEW)** | ✓ | ✓ (buttons only) | ✓ (focus trap on Retry) | ✓ | — | — | ✓ (this *is* the error state) | — |
| Rollback toast Retry button | ✓ | ✓ | ✓ (initial focus on toast mount) | ✓ | — | — | ✓ | — |
| Rollback toast Open repair button | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Rollback toast ✕ dismiss | ✓ | ✓ | ✓ | ✓ | — | — | — | — |

[1] Chips aren't focusable in the base modal.

---

## Stage progress strip

Artifact: `stage-progress-strip.html`.

| Stage condition | default | hover | focus | active | disabled | error | tabindex |
|---|---|---|---|---|---|---|---|
| Completed (prior stage) | ✓ | ✓ (teal border + tooltip) | ✓ (2px teal 4px offset) | ✓ (Enter opens read-only view) | — [1] | — [1] | `0` |
| Current (in-progress) | ✓ (diamond badge) | ✓ (badge lifts, tooltip) | ✓ (teal outline on diamond) | ✓ (Enter scrolls to stage's active unit) | — | — | `0` |
| Previously visited (now "future") | ✓ (filled border) | ✓ (border darkens, tooltip) | ✓ (teal 2px ring) | ✓ (Enter opens read-only prior visit) | — | — | `0` |
| Future, never visited | ✓ (empty circle + upcoming label) | ✓ (tooltip shows "Upcoming") | — (not in tab order) | — | ✓ (`aria-disabled="true"`) | — | `-1` |

[1] Stage progress strip nodes don't carry per-stage disabled/error; error is communicated by the underlying stage state elsewhere.

---

## Revisit unit list

Artifact: `revisit-unit-list.html`.

| Surface | default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|---|
| New-unit card | ✓ (blue-400 border) | ✓ (shadow lifts) | ✓ (teal 2px ring) | ✓ | — | — |
| Locked / completed unit card | ✓ (opacity 0.6) | ✓ (opacity 0.8) | ✓ (opacity 0.95 + teal ring) | — (read-only) | ✓ (`aria-disabled="true"`, content uneditable) | — |
| Closes-feedback chip | ✓ | — [1] | — [1] | — | — | — |
| Stage progress strip (inside) | ✓ | ✓ | ✓ | ✓ | ✓ (future stages) | — |

[1] Chips are labels, not controls.

---

## Feedback annotation popover (creation)

Artifact: `annotation-popover-states.html`.

| Element | default (State 1) | line-anchored (State 2) | iframe 2-step (State 3) | error (State 4) | disabled-body (State 4b **NEW**) | mobile bottom-sheet (State 5) | dark (State 6) |
|---|---|---|---|---|---|---|---|
| Title input | ✓ | ✓ | ✓ | ✓ (preserved) | ✓ (placeholder) | ✓ | ✓ |
| Body textarea | ✓ | ✓ | ✓ | ✓ (preserved) | ✓ (empty, describedby hint) | ✓ | ✓ |
| Cancel button | ✓ | ✓ | ✓ | — (hidden when banner is present in v1) | ✓ | ✓ (44×44) | ✓ |
| Discard button | — | — | — | ✓ | — | — | — |
| Create button | ✓ | ✓ | ✓ (active on step B) | — (replaced by Retry) | ✓ (disabled + aria-disabled) | ✓ (44×44) | ✓ |
| Retry button | — | — | — | ✓ | — | — | — |
| Close ✕ | ✓ | ✓ | ✓ | ✓ | ✓ (focusable) | ✓ (44×44) | ✓ |
| Error banner | — | — | — | ✓ | — | — | — |
| Help text (aria-describedby) | — | — | — | — | ✓ ("Body is required.") | — | — |

---

## Focus order policy (summary)

Baked into each artifact's stylesheet and HTML:

1. **Focusable-and-actionable** (most surfaces): `tabindex="0"` (or native), full hover/focus/active coverage, Enter activates.
2. **Focusable-but-no-action** (read-only locked units, visited-but-greyed-back stages): `tabindex="0"`, focus ring still visible so keyboard user knows where they are, but activation is a no-op or opens a read-only panel.
3. **Not-in-tab-order** (future never-visited stages, disabled footer buttons): `tabindex="-1"` OR `disabled` + `aria-disabled="true"`. Pointer-hover may still show a tooltip for context but the element is skipped by Tab.

This matches the contract in `focus-ring-spec.html §2` ("The ring is persistent on any focusable-for-inspection surface").

---

## Open gaps / follow-ups

None in scope for unit-15. Every row above is rendered explicitly or marked N/A with rationale.

## Companion: `DESIGN-BRIEF.md §2` amendment

A one-line policy amendment has been added to `DESIGN-BRIEF.md §2 Component Inventory` instructing that **all new components in this intent and downstream must include a six-state grid** (default / hover / focus / active / disabled / error) alongside their component spec. This file is the template for those grids.
