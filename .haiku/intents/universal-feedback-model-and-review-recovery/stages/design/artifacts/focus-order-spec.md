# Focus Order Specification

**Unit:** unit-12-keyboard-reach-and-shortcuts
**Closes:** FB-17, FB-30 (focus-order portions)
**Companion:** `keyboard-shortcut-map.html §6`, `skip-link-spec.html`, `annotation-gesture-spec.html §7`

This document is the canonical Tab-order contract for every reviewer-facing surface. Developers wire 1:1 from this list. Any artifact that adds new interactive elements MUST extend this spec, not invent a parallel ordering.

## 1. Reviewer app — full review page (feedback-inline-desktop.html)

The desktop review page is the primary surface. Tab walks the DOM in reading order; no `tabindex > 0` anywhere. Focus lives on exactly one element at a time. Elements with `tabindex="-1"` are either intentionally skipped (roving-tabindex tablist inactive tabs) or **not** in this list (pins MUST be `tabindex="0"` per FB-17).

| Order | Element | Location | tabindex | `aria-label` / accessible name | Shortcut hook |
|-------|---------|----------|---------:|--------------------------------|---------------|
| 1 | Skip to main content | body (first child) | 0 | "Skip to main content" | — |
| 2 | Skip to feedback list | body (second child) | 0 | "Skip to feedback list" | — |
| 3 | Theme toggle | header | 0 | "Toggle color theme" | — |
| 4 | Stage strip button — inception | header nav | 0 | "Stage: inception (completed)" | `[` / `]` navigates between stage buttons |
| 5 | Stage strip button — design | header nav | 0 | "Stage: design (current)" | ^ |
| 6 | Stage strip button — product | header nav | 0 (if visited) / disabled | "Stage: product (upcoming, locked)" | ^ |
| 7 | Stage strip button — development | header nav | 0 / disabled | "Stage: development (upcoming, locked)" | ^ |
| 8 | Tab: Overview (active) | tablist | 0 | "Overview tab, selected" | `g` then `o` |
| 9 | Tab: Units (inactive) | tablist | -1 | "Units tab, 12 items" | `g` then `u` — arrow keys within tablist |
| 10 | Tab: Knowledge (inactive) | tablist | -1 | "Knowledge tab" | `g` then `k` |
| 11 | Tab: Outputs (inactive) | tablist | -1 | "Outputs tab, 3 items" | `g` then `p` |
| 12 | Expand-toggle / artifact link (reading order) | main | 0 | varies | `n` (next-unseen) |
| 13 | **Pin marker FB-NN** (interleaved in reading order) | main (overlay) | 0 | "Feedback FB-NN at X% Y% — press Enter to view details" | `Enter` |
| 14 | Next expand-toggle / artifact link | main | 0 | varies | — |
| … | … more content-interleaved elements, in DOM order … | | | | |
| N−7 | Feedback filter pills (Pending / Addressed / All) | aside `#feedback-list` | 0 | "Filter: Pending, 4 items" | — |
| N−6 | Feedback card 1 | aside | 0 | "Feedback FB-01, pending, adversarial-review" | `j` / `k`, `Enter`, `r`, `a` |
| N−5 | Feedback card 2 | aside | 0 | ^ | ^ |
| … | … more feedback cards … | | | | |
| N−3 | General-comment textarea | aside footer | 0 | "Add a general comment" | `/` |
| N−2 | Approve button | aside footer | 0 | "Approve stage" | `a` |
| N−1 | External Review button | aside footer | 0 | "Submit for external review" | — |
| N | Request Changes button | aside footer | 0 | "Request changes (opens revisit modal)" | `r` |

### Notes

- **Tablist pattern (rows 8–11).** One active tab is tab-focusable; inactive tabs are reachable via **Arrow Left/Right** within the tablist, not via Tab. This is the standard ARIA tablist roving-tabindex pattern and is NOT a violation of "every interactive element reachable" — the tablist itself is a single focus stop, and arrow keys move focus among tabs inside it.
- **Pin markers (row 13).** Per FB-17, pins now live in the natural reading order of the main content, not as a separate overlay tabstop. When an artifact has three pins at 25%/30%, 65%/55%, 40%/75%, the Tab order walks them in DOM order (which mirrors the visual overlay order from top to bottom in most cases; exceptions documented per artifact). Pin Enter expands the linked sidebar card and scrolls it into view (`crossFlash(fbId)` helper). Sidebar card Enter cross-flashes the pin (same helper, reverse direction).
- **Skip links (rows 1–2).** Rendered with `class="sr-only focus:not-sr-only …"` so they are visually hidden until focused, then appear in the top-left of the viewport. See `skip-link-spec.html` for exact styling.
- **Sidebar (rows N−7 … N).** When a user activates the "Skip to feedback list" link, focus jumps to `#feedback-list` which is the `<aside>` (or sidebar container). The first Tab inside the aside focuses the filter pills; subsequent Tabs walk the card list.

## 2. Reviewer app — mobile (feedback-inline-mobile.html)

Mobile drops the sidebar in favor of a FAB + bottom-sheet. The Tab order flattens to:

| Order | Element | tabindex | Notes |
|-------|---------|---------:|-------|
| 1 | Skip to main content | 0 | — |
| 2 | Skip to feedback list | 0 | Jumps to `#feedback-list` inside the bottom sheet (the sheet opens if closed). |
| 3 | Theme toggle | 0 | — |
| 4 | Tab strip (4 buttons, horizontal scroll) | 0 on active / -1 on others | Arrow keys within |
| 5… | Main content in reading order, including pin markers | 0 | Pin aria-label as desktop |
| N−1 | FAB (opens feedback sheet) | 0 | `?` brings up help |
| N | Bottom-sheet close / swipe handle | 0 | Only reachable once the sheet is open |

When the bottom sheet is open, a focus trap is established; Tab cycles through sheet content (filter → cards → general-comment → action buttons). `Esc` closes the sheet and returns focus to the FAB.

## 3. Annotation-gesture-spec — artifact demos

The annotation gesture artifact contains three demo surfaces (raster image, line-based text, iframe fallback). Each demo's Tab order:

### Raster / SVG demo

1. Skip to main content (body).
2. Theme toggle (header).
3. Wrapper div (spatial annotation canvas) — `tabindex="0"`, `aria-label="Spatial annotation canvas. Press C to create a feedback pin at the center."`.
4. **Existing pin button** (FB-12 at 42% 60%) — `tabindex="0"`, `aria-keyshortcuts="Enter"`.
5. "Open popover" demo button (below canvas).

### Line-based text demo

Each `.line-row` is `tabindex="0"` with `aria-label="Line N [with K annotations]"`. Tab walks rows 1 → 2 → 3 → 4 → 5. Inside a row, `C` opens the popover at that line. The inline annotation-count badge (small pill inside a line row) is `aria-hidden="true"` because the row itself is the focus target — the badge is decorative.

### Iframe fallback demo

Since iframe contents can't be annotated directly, the focus order is: preview iframe (non-interactive) → "Add feedback on this preview" form fields (page number → region input) → "Continue to popover" button.

## 4. Revisit modal (revisit-modal-spec.html)

Modal open fires `trap-focus` on `.modal-container`. Initial focus lands on the "Reason" textarea per the spec.

1. **Reason** textarea (initial focus).
2. Suggested-follow-up chips (each is a `tabindex="0"` button).
3. Pending-feedback list — each item is `tabindex="0"` and Enter-activates to expand inline.
4. **Cancel** button.
5. **Confirm revisit** button (primary, destructive).

Cycle trap: Tab from Confirm wraps back to Reason.

## 5. Help overlay (keyboard-shortcut-map.html §5 — `?`)

Help overlay open fires `trap-focus` on `[role="dialog"]`. Initial focus lands on the close (×) button.

1. **Close ×** (initial focus).
2. Each shortcut-chip region — non-focusable (information only).
3. **"Require Alt for single-key shortcuts"** checkbox (inside footer).

Cycle trap: Tab from the checkbox wraps to the close button.

## 6. Comments list with agent-feedback toggle (comments-list-with-agent-toggle.html)

The toggle surface sits atop the sidebar. Tab order:

1. Skip to main content / feedback list (body).
2. Header theme toggle.
3. **`aria-label="Show agent feedback"` toggle switch** (first inside sidebar). `Alt+A` toggles it (the bare `A` is Approve per the global map; we use `Alt+A` to avoid the collision AND the screen-reader browse-mode intercept).
4. Filter pills.
5. Comment cards in reading order.

## 7. Assessor summary card (assessor-summary-card.html)

The card surface sits in the sidebar footer. Tab order inside the card:

1. Roll-up header (non-interactive, `aria-expanded`-controlled via the collapse/expand button below).
2. Collapse / expand button.
3. "View details" link.
4. (When assessor status is blocking) — Re-run button.

## 8. Sync with unit-07

Unit-07's `keyboard-shortcut-map.html §6` is updated in unit-12 to reference this focus-order-spec explicitly ("See the full specification in `focus-order-spec.md`") and to interleave pins in main-content reading order (previously the pins were not enumerated). This file IS the canonical focus-order contract; the §6 list in keyboard-shortcut-map is a summary.

## 9. Implementation contract

- No manual `tabindex > 0` values. Where a non-default order is required (e.g. after an `<a href="#main-content">` link), use programmatic focus (`element.focus()`) + `scrollIntoView({ block: 'start' })`.
- Every element with a shortcut carries an `aria-keyshortcuts` attribute. See `keyboard-shortcut-map.html §3d` for the full list.
- Pins are `<button>`, not `<div>`. `role="button"` is insufficient — native `<button>` inherits default Tab + Enter + Space handling; `<div role="button">` would need manual key handlers and is a known a11y footgun.
- When the "Require Alt for single-key shortcuts" setting is on, the `aria-keyshortcuts` value on every shortcut-bound element is updated to the Alt-prefixed chord so screen readers announce the correct binding.

## 10. Test checklist (for the design-reviewer hat)

- [ ] Pressing Tab starts at "Skip to main content" (not at header theme toggle).
- [ ] "Skip to main content" sends focus to `<main id="main-content">`.
- [ ] "Skip to feedback list" sends focus to `<aside id="feedback-list">` (or the equivalent anchor in each artifact).
- [ ] Inside the main content, Tab reaches every pin marker in reading order.
- [ ] No pin marker has `tabindex="-1"`.
- [ ] Enter on a pin expands the linked sidebar card and scrolls it into view.
- [ ] Enter on a sidebar card cross-flashes the pin and scrolls it into view.
- [ ] Tab from the last sidebar element does NOT wrap back to the top — it should leave the sidebar and land on the browser chrome.
- [ ] Esc closes the help overlay / revisit modal and returns focus to the opener.
- [ ] The tablist honors arrow-key navigation; Tab skips past the tablist after the active tab.
- [ ] With a screen reader running in browse mode, the skip links are announced and the pin markers' `aria-label` + coordinates are read correctly.
