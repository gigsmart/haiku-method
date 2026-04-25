# State Coverage Grid (FB-25, extended by FB-56)

Closes **FB-25** (original grid) and **FB-56** (extension to every DESIGN-BRIEF §2 component). Enumerates every interactive surface with explicit coverage of six states: **default**, **hover**, **focus**, **active**, **disabled**, **error**. Additional **empty** / **loading** / **pulse** columns appear where the surface has those meaningful states. `N/A` or `—` means the state is unreachable by design (rationale in footnotes).

Legend: `✓` = rendered; `—` = N/A (see note); `⚠` = gap (tracked for follow-up).

---

## 0. DESIGN-BRIEF §2 component checklist (FB-56)

Every component inventoried in DESIGN-BRIEF §2 has a row below. Missing rows are a hard fail; N/A cells must carry a rationale.

| DESIGN-BRIEF §2 component | Grid section below |
|---|---|
| `FeedbackStatusBadge` | §7 DESIGN-BRIEF §2 components — new components |
| `FeedbackOriginIcon` | §7 |
| `FeedbackItem` (compact) | §2 Feedback cards (compact) + §7 |
| `FeedbackItem` (expanded) | §2 Feedback cards (expanded) + §7 |
| `FeedbackList` | §7 |
| `FeedbackSummaryBar` | §7 |
| `AgentFeedbackToggle` | §7 |
| `FeedbackSheet` (aka `MobileFeedbackPanel`) | §3 FAB + bottom sheet + §7 |
| `FeedbackFloatingButton` (aka FAB) | §3 + §7 |
| `AssessorSummaryCard` | §7 |
| `StageProgressStrip` | §5 Stage progress strip + §7 |
| `RevisitModal` | §4 Revisit modal + §7 |

If you add a new component to DESIGN-BRIEF §2, you MUST add a row in §7 of this file in the same change.

---

## 1. Pins, markers, ghosts (annotation overlay layer)

Artifacts: `feedback-inline-desktop.html`, `annotation-gesture-spec.html`, `annotation-popover-states.html`.

| Surface | default | hover | focus | active | disabled | error | Notes |
|---|---|---|---|---|---|---|---|
| Pin marker (w-7 h-7, 44×44 hit) | ✓ | ✓ (brightness 1.08) | ✓ (teal 2px, 3px offset) | ✓ (brightness 0.92) | ✓ (opacity 0.45, cursor not-allowed) | ✓ (red-500 ring on cross-flash miss) | `.pin-hit::before` provides the 44×44 invisible hit zone. See `touch-target-audit.md` for dimensions. |
| Ghost pin (click-to-place) | ✓ | — [1] | — [1] | — [1] | — [1] | — | Ephemeral cursor-follower; not a focusable control. `pointer-events: none`. |
| Pin popover | ✓ | — | ✓ (outline via first-field focus) | — | ✓ (State 4b — Create button inert on empty body) | ✓ (State 4 — red banner, preserved draft) | Popover itself is a `role="dialog"`; its interior buttons carry all states. |

[1] Ghost pin has `pointer-events: none` and exists only between pointer-move and pointer-up. A11y-wise it's decorative.

---

## 2. Feedback cards (sidebar list items)

Artifacts: `feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `feedback-card-states.html`, `comment-to-feedback-flow.html`.

| Surface | default | hover | focus | active | disabled | error | empty |
|---|---|---|---|---|---|---|---|
| Feedback card (compact) | ✓ | ✓ (teal border bump) | ✓ (focus-visible 2px teal) | ✓ (depress + brightness) | ✓ (opacity 0.6 when read-only/locked) | ✓ (§5b red-tinted card — `feedback-card-states.html`) | ✓ (list-level empty copy — `feedback-inline-*` §empty-state) |
| Feedback card (expanded) | ✓ | — [1] | ✓ | — | ✓ (busy state, `aria-busy="true"`) | ✓ (inline error row above footer) | — |
| Pending footer buttons (Dismiss / Verify & Close) | ✓ | ✓ | ✓ | ✓ | ✓ (`disabled` while saving) | ✓ (toast + red ring) | — |
| Addressed footer buttons (Verify & Close / Reopen) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Closed / Rejected footer buttons (Reopen) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Status badge (pending / addressed / closed / rejected) | ✓ | — [2] | — [2] | — [2] | — [2] | ✓ (contrast-preserved inside red-tinted card) | — |

[1] Expanded card is the hover + click terminal state; no nested hover.
[2] Status badge is a label, not a control; it inherits focus from the card.

---

## 3. FAB + bottom sheet (mobile)

Artifact: `feedback-inline-mobile.html`.

| Surface | default | hover | focus | active | disabled | error | empty | pulse |
|---|---|---|---|---|---|---|---|---|
| FAB (`FeedbackFloatingButton`) | ✓ | ✓ (teal-700 fill) | ✓ (2px offset + teal-500 ring) | ✓ (teal-800 fill + scale 0.97) | ✓ (opacity 0.5, grayscale 0.4) | — [1] | ✓ (hidden when no pending items) | ✓ (2s × 3 iter, reduced-motion → static badge) |
| Sheet close ✕ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Sheet sheet-enter anim | ✓ | — | — | — | — | — | — | reduced-motion → appears in-place |
| `AgentFeedbackToggle` (role=switch — FB-53) | ✓ | ✓ (track darkens) | ✓ (teal outline) | ✓ | ✓ (`aria-disabled="true"`, cursor-not-allowed, opacity-50) | — [2] | — | — |
| Filter pills (All / Pending / Addressed / Closed) | ✓ | ✓ | ✓ | ✓ (`aria-pressed="true"` → `bg-teal-600 text-white` primary fill per DESIGN-BRIEF §3 line 628 / DESIGN-TOKENS §2.5) [4] | — | — | — | — |
| Group header (Current Visit / Visit 1 / …) | ✓ | — [3] | — [3] | — | — | — | ✓ ("No visits yet" inline) | — |
| Sheet footer textarea | ✓ | — | ✓ (teal ring) | — | ✓ (during submit) | ✓ (red border on validation fail) | ✓ (placeholder) | — |
| Add button | ✓ | ✓ | ✓ | ✓ | ✓ (until textarea has content) | ✓ | ✓ | — |
| Approve / Request Changes | ✓ | ✓ | ✓ | ✓ | ✓ (during submit + until condition met) | ✓ (toast + button returns to idle) | — | — |
| Theme toggle (FB-66 — dynamic aria-label) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |

[1] FAB disabled state used when the user is on a non-review page; normal flow keeps it enabled.
[2] `AgentFeedbackToggle` has no native error state — errors on the toggle action are announced via `#feedback-live-assertive` per `aria-live-sequencing-spec.md §3`.
[3] Group headers are labels, not focusable controls.
[4] FB-06: The active filter pill uses the PRIMARY active treatment (`bg-teal-600 text-white` / `dark:bg-teal-500 dark:text-white`), not the muted teal-100 status-badge treatment. Before FB-06, DESIGN-TOKENS §2.5 specified `bg-teal-100 text-teal-700` for active filter pills, which conflicted with DESIGN-BRIEF §3 line 628 — fixed by lifting tokens to primary. Decorative status dots inside the pill (`bg-stone-500`, `bg-amber-500`, etc.) are `aria-hidden` and have no WCAG contrast requirement.

---

## 4. Revisit modal

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
| **Rollback toast** | ✓ | ✓ (buttons only) | ✓ (focus trap on Retry) | ✓ | — | — | ✓ (this *is* the error state) | — |
| Rollback toast Retry button | ✓ | ✓ | ✓ (initial focus on toast mount) | ✓ | — | — | ✓ | — |
| Rollback toast Open-repair button | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — |
| Rollback toast ✕ dismiss (FB-64 — 44×44 on mobile) | ✓ | ✓ | ✓ | ✓ | — | — | — | — |

[1] Chips aren't focusable in the base modal.

---

## 5. Stage progress strip

Artifact: `stage-progress-strip.html`.

| Stage condition | default | hover | focus | active | disabled | error | tabindex |
|---|---|---|---|---|---|---|---|
| Completed (prior stage) | ✓ | ✓ (teal border + tooltip) | ✓ (2px teal 4px offset) | ✓ (Enter opens read-only view) | — [1] | — [1] | `0` |
| Current (in-progress) | ✓ (diamond badge) | ✓ (badge lifts, tooltip) | ✓ (teal outline on diamond) | ✓ (Enter scrolls to stage's active unit) | — | — | `0` |
| Previously visited (now "future") | ✓ (filled border) | ✓ (border darkens, tooltip) | ✓ (teal 2px ring) | ✓ (Enter opens read-only prior visit) | — | — | `0` |
| Future, never visited | ✓ (empty circle + upcoming label) | ✓ (tooltip shows "Upcoming") | ✓ (teal 2px ring; reachable via arrow keys — FB-65) | — (Enter is no-op, aria-disabled) | ✓ (`aria-disabled="true"`) | — | `-1` (Tab) / reachable via ArrowLeft/ArrowRight (FB-65 roving) |

[1] Stage progress strip nodes don't carry per-stage disabled/error; error is communicated by the underlying stage state elsewhere.

---

## 6. Revisit unit list

Artifact: `revisit-unit-list.html`.

| Surface | default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|---|
| New-unit card | ✓ (blue-400 border) | ✓ (shadow lifts) | ✓ (teal 2px ring) | ✓ | — | — |
| Locked / completed unit card | ✓ (opacity 0.6) | ✓ (opacity 0.8) | ✓ (opacity 0.95 + teal ring) | — (read-only) | ✓ (`aria-disabled="true"`, content uneditable) | — |
| Closes-feedback chip | ✓ | — [1] | — [1] | — | — | — |
| Stage progress strip (inside) | ✓ | ✓ | ✓ | ✓ | ✓ (future stages) | — |

[1] Chips are labels, not controls.

---

## 7. DESIGN-BRIEF §2 components — state coverage (FB-56 extension)

Every component inventoried in DESIGN-BRIEF §2 gets its own row. Components shared with §1-§6 above are cross-referenced.

### 7.1 `FeedbackStatusBadge`

Pure label — not a focusable control. All cells except `default` and `error` are `N/A`; the badge color + text reflects the owning feedback item's status.

| default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|
| ✓ (four status variants: pending, addressed, closed, rejected — each rendered in `feedback-card-states.html` + `feedback-inline-*`) | N/A — labels are not interactive, inherit the card's hover | N/A — same rationale; inherits card focus | N/A | N/A — there is no "disabled badge" state; the owning card goes to opacity 0.6, the badge stays full-contrast | ✓ (inside a red-tinted card, the badge keeps its contrast-preserved palette — see `contrast-and-type-audit.md`) |

### 7.2 `FeedbackOriginIcon`

Pure label + emoji — not a focusable control.

| default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|
| ✓ (six variants: adversarial-review, external-pr, external-mr, user-visual, user-chat, agent — per `aria-landmark-spec.md §6` canonical mapping) | N/A — inherits card hover | N/A — inherits card focus | N/A | N/A — no disabled origin; the owning item may be disabled, icon stays full-contrast | N/A — origin does not change on error |

### 7.3 `FeedbackItem` (compact)

Covered in §2 (Feedback card — compact). Every state is ✓ or has a rationale in §2.

### 7.4 `FeedbackItem` (expanded)

Covered in §2 (Feedback card — expanded). Every state is ✓ or has a rationale in §2.

### 7.5 `FeedbackList`

The scrollable container surrounding `FeedbackItem`s.

| default | hover | focus | active | disabled | error | empty | loading |
|---|---|---|---|---|---|---|---|
| ✓ | N/A — list is a scrollable container; hover lives on its items | N/A — the container itself is not focusable (`role="list"`); items are | N/A | N/A — list is never disabled; individual items may be | ✓ (when the load API returns an error: empty list with retry button — `feedback-inline-desktop.html` §error-state) | ✓ (empty copy: "No feedback yet. Select text or drop pins to add annotations.") | ✓ (skeleton rows + spinner; `aria-busy="true"` on the list container) |

### 7.6 `FeedbackSummaryBar`

Compact strip with status counts (pending · addressed · closed). Click-to-filter.

| default | hover | focus | active | disabled | error |
|---|---|---|---|---|---|
| ✓ (when ≥ 1 item exists) | ✓ (per-count hover — subtle underline) | ✓ (each count is a button; teal ring) | ✓ (`aria-pressed="true"` on active filter count) | N/A — bar is hidden when no items exist | N/A — counts are derived; if the fetch fails, the bar falls back to hidden (same as empty) |

### 7.7 `AgentFeedbackToggle`

Canonical `role="switch" aria-checked` button per `agent-feedback-toggle-spec.html`. Full six-state render is in that spec.

| default (off) | hover | focus | active (on) | disabled | error |
|---|---|---|---|---|---|
| ✓ (thumb left, track gray-300) | ✓ (track darkens, soft teal halo) | ✓ (2px teal-500 outline, 2px offset) | ✓ (thumb right, track teal-600) | ✓ (`aria-disabled="true"`, opacity-50, cursor-not-allowed, track gray-200) | ✓ (toggle API failure surfaces via `#feedback-live-assertive`; toggle itself flips back to previous state) |

### 7.8 `FeedbackSheet` (aka `MobileFeedbackPanel`)

Covered in §3 (FAB + bottom sheet). Every state is ✓.

### 7.9 `FeedbackFloatingButton` (aka FAB)

Covered in §3. Full `default / hover / focus / active / disabled / empty / pulse` coverage.

### 7.10 `AssessorSummaryCard`

Card root is a live region (`role="status" aria-live="polite" aria-atomic="true"` — FB-62). Card body contains a "view details" / "view log" button as its only interactive element.

| default (clean) | hover | focus | active | disabled | loading | error | empty |
|---|---|---|---|---|---|---|---|
| ✓ (State 1 — assessor pass clean, user gate unlocked) | ✓ (per-item row hover reveals tooltip with addressed-by unit) | ✓ ("view details" button + per-item rows focusable when expanded) | ✓ (button pressed) | N/A — card is not disabled as a whole; individual actions may hide (e.g. no "view details" in empty error state) | ✓ (skeleton stat row + spinner on status dot; pill reads "running"; `aria-busy="true"` on card root) | ✓ (State 3 — error pill, red-tinted card, "rolling back to elaborate" footer) | ✓ (card hides entirely when 0 feedback items — stage is clean by definition) |

State 2 (pending — user gate blocked) is a distinct default variant within the default column, not a separate state column.

### 7.11 `StageProgressStrip`

Covered in §5. Future never-visited nodes are focusable via arrow-key roving (FB-65), reachable via hover, focus-visible, and aria-disabled — all cells covered.

### 7.12 `RevisitModal`

Covered in §4.

---

## 8. Feedback annotation popover (creation)

Artifact: `annotation-popover-states.html`.

| Element | default (State 1) | line-anchored (State 2) | iframe 2-step (State 3) | error (State 4) | disabled-body (State 4b) | mobile bottom-sheet (State 5) | dark (State 6) |
|---|---|---|---|---|---|---|---|
| Title input | ✓ | ✓ | ✓ | ✓ (preserved) | ✓ (placeholder) | ✓ | ✓ |
| Body textarea | ✓ | ✓ | ✓ | ✓ (preserved) | ✓ (empty, describedby hint) | ✓ | ✓ |
| Cancel button | ✓ | ✓ | ✓ | — (hidden when banner is present in v1) | ✓ | ✓ (44×44) | ✓ |
| Discard button | — | — | — | ✓ | — | — | — |
| Create button | ✓ | ✓ | ✓ (active on step B) | — (replaced by Retry) | ✓ (disabled + aria-disabled) | ✓ (44×44) | ✓ |
| Retry button | — | — | — | ✓ | — | — | — |
| Close ✕ (FB-64 — 44×44 via `.popover-close::before` on mobile) | ✓ | ✓ | ✓ | ✓ | ✓ (focusable) | ✓ (44×44) | ✓ |
| Error banner | — | — | — | ✓ | — | — | — |
| Help text (aria-describedby) | — | — | — | — | ✓ ("Body is required.") | — | — |

---

## 9. Focus order policy (summary)

Baked into each artifact's stylesheet and HTML:

1. **Focusable-and-actionable** (most surfaces): `tabindex="0"` (or native), full hover/focus/active coverage, Enter activates.
2. **Focusable-but-no-action** (read-only locked units, visited-but-greyed-back stages): `tabindex="0"`, focus ring still visible so keyboard user knows where they are, but activation is a no-op or opens a read-only panel.
3. **Not-in-tab-order** (future never-visited stages, disabled footer buttons): `tabindex="-1"` OR `disabled` + `aria-disabled="true"`. Pointer-hover may still show a tooltip for context; keyboard users reach these via **arrow-key roving tabindex** (FB-65) where the widget supports it (stage-progress strip does; disabled buttons do not).

This matches the contract in `focus-ring-spec.html §2` ("The ring is persistent on any focusable-for-inspection surface").

---

## 10. Open gaps / follow-ups

None in scope for unit-19. Every DESIGN-BRIEF §2 component has either an explicit grid row above or a cross-reference to the section that covers it. Every `N/A` cell carries a rationale.

## 11. Companion: `DESIGN-BRIEF.md §2` amendment

`DESIGN-BRIEF.md §2 Component Inventory` now requires every new component to ship with a six-state grid (default / hover / focus / active / disabled / error) in this file. The `FB-25 / FB-56` callout at the top of §2 is the policy anchor; this file is the template.

When a new component is added to DESIGN-BRIEF §2:

1. Add a row in §7 of this file (or a cross-reference if the component fits an existing section).
2. Cells marked N/A must carry a rationale in the same edit.
3. The design-reviewer hat walks the grid row-by-row before approving the stage.
