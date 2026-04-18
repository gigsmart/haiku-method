---
title: Keyboard navigation specification
type: design
closes:
  - FB-04
depends_on: []
inputs:
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/04-keyboard-navigation-for-power-users.md
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-ui-mockup.html
outputs:
  - stages/design/artifacts/keyboard-shortcut-map.html
  - stages/design/artifacts/focus-ring-spec.html
status: completed
bolt: 1
hat: design-reviewer
started_at: '2026-04-17T16:50:28Z'
hat_started_at: '2026-04-17T16:57:57Z'
completed_at: '2026-04-17T22:11:19Z'
---

# Keyboard navigation specification

## Goal

Lock the shortcut map, help overlay (`?`), and focus-ring visual contract the review UI depends on so the development stage can wire it 1:1 without reinventing behavior. The mockup has a working prototype; this unit produces the canonical specification developers implement against.

## Quality Gates

- Shortcut table finalized and documented:
  - `j` / `k` — next / previous feedback card in sidebar, with visible focus ring.
  - `[` / `]` — previous / next stage (skipping upcoming stages).
  - `g` then `o` / `u` / `k` / `p` — jump to Overview / Units / Knowledge / outPuts (two-key Gmail-style sequence with 1s timeout).
  - `Enter` — cross-flash the focused feedback's target artifact + scroll.
  - `n` — next unseen artifact in the active tab.
  - `a` — approve (only when approve button is visible / active). **(unit-12 amendment — FB-14):** `a` is Approve-only; annotation-create uses `c` (see unit-04 and `annotation-gesture-spec.html`). Both are documented in `keyboard-shortcut-map.html §1`.
  - `c` — **(unit-12 amendment — FB-14):** create annotation at focused artifact / line / iframe wrapper. Renamed from `a` to resolve the Approve collision.
  - `r` — **context-dependent:** if a closed/rejected feedback card is focused, re-open it to `pending`; otherwise open the Request Changes flow (revisit modal per unit-06). **(unit-12 amendment — FB-28):** conflicts with NVDA/JAWS browse-mode "next region" landmark navigation. Documented in `keyboard-shortcut-map.html §3b`. A user-toggleable "Require Alt for single-key shortcuts" setting (default off) remaps to `Alt+r` to bypass the conflict.
  - `/` — focus the feedback textarea in the sidebar.
  - `Esc` — close modal → popover → help overlay → blur active input, in that precedence order.
  - `?` — toggle help overlay.
- Help overlay (`?`) wireframed with a two-column grid of `<kbd>` chips + descriptions. Dismiss via `Esc`, `?`, or backdrop click. Light + dark variants.
- Visible focus ring spec: color token, offset (2px), thickness (2px), dark-mode variant. Applied to feedback cards (`j`/`k` focus), stepper buttons (`[`/`]`), and tab buttons (`g`-prefix jumps).
- Cross-flash animation for `Enter`-highlight specified: duration (1400ms), easing, color (teal-500 with 0.7 alpha fade), applied to both the feedback card and the target artifact row.
- Conflict analysis with browser / OS defaults documented. `/` conflicts with Chrome/Firefox find-in-page but is industry-standard for "focus search" and acceptable. `?` must not be captured when user is typing in an input.
- Input-capture rule explicit: all shortcuts except `Esc` are suppressed when focus is in `<input>`, `<textarea>`, or `contenteditable`. `Esc` blurs the input instead of closing modal/popover when an input is focused.
- **(unit-12 amendment — FB-17/28/30):** Focus order documented comprehensively in `stages/design/artifacts/focus-order-spec.md` including pin markers interleaved in main-content reading order, skip links as the first focusable elements, and pin ↔ sidebar card Enter reciprocity. `aria-keyshortcuts` attributes present on every shortcut-bound element. Screen-reader browse-mode conflict analysis for NVDA, JAWS, VoiceOver added to `keyboard-shortcut-map.html §3b`.
