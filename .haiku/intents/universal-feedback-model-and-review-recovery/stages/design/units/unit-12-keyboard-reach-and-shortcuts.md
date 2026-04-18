---
title: 'Keyboard reach, shortcut collisions, and screen-reader conflicts'
type: design
closes:
  - FB-14
  - FB-17
  - FB-28
  - FB-30
depends_on:
  - unit-07-keyboard-navigation-spec
inputs:
  - stages/design/artifacts/keyboard-shortcut-map.html
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/unit-04-design-review.md
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/revisit-modal-spec.html
  - >-
    stages/design/feedback/14-unresolved-keyboard-collision-a-key-bound-to-both-approve-un.md
  - >-
    stages/design/feedback/17-pin-markers-have-tabindex-1-making-keyboard-users-unable-to.md
  - >-
    stages/design/feedback/28-keyboard-shortcut-r-conflict-with-screen-reader-browse-mode.md
  - >-
    stages/design/feedback/30-missing-skip-to-main-content-link-in-sticky-header-layouts.md
outputs:
  - stages/design/artifacts/keyboard-shortcut-map.html
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/focus-order-spec.md
  - stages/design/artifacts/skip-link-spec.html
quality_gates:
  - >-
    Annotation-open shortcut changed from `a` to `c` (create) across
    annotation-gesture-spec.html (gesture matrix in §2, text-annotation section,
    shortcut table in §7 — at minimum lines 126, 245, 366, 372, 378) AND
    reflected in keyboard-shortcut-map.html; `a` remains bound to Approve only;
    grep `-rEn '<kbd>[Aa]</kbd>' stages/design/artifacts/annotation-*.html`
    returns only the non-conflicting references
  - >-
    Pin markers use `tabindex="0"` (not `-1`) and have an `aria-label` naming
    the feedback ID and normalized coordinates ("Feedback FB-XX at 42% 60% —
    press Enter to view details"); grep `-rEn 'tabindex="-1"'
    stages/design/artifacts/feedback-inline-desktop.html
    stages/design/artifacts/annotation-gesture-spec.html` returns 0 matches on
    pin buttons
  - >-
    Focus order documented in focus-order-spec.md: page → header →
    stage-progress-nav → main content (pins interleaved in reading order) →
    sidebar (feedback cards); ties to unit-07's focus-order section which is
    amended to match
  - >-
    Pin Enter/click reciprocally expands the linked sidebar feedback card and
    scrolls it into view; reciprocal sidebar-Enter → pin cross-flash already
    specified — both directions now documented in keyboard-shortcut-map.html
  - >-
    Screen-reader conflict analysis added to keyboard-shortcut-map.html §3:
    NVDA, JAWS, VoiceOver named; `aria-keyshortcuts` attributes specified on
    every shortcut-bound element; a user setting `Require modifier key for
    shortcuts` (remaps `j` → `Alt+j`, etc., default off) documented in the help
    overlay spec
  - >-
    Every page that has a sticky header layout has a
    visually-hidden-until-focused `<a href="#feedback-list" class="sr-only
    focus:not-sr-only …">Skip to feedback list</a>` as the first focusable
    element, AND a `<a href="#main-content">Skip to main content</a>` link;
    `id="main-content"` and `id="feedback-list"` anchors exist in every affected
    artifact; unit-01's completion criteria amended to require skip links
  - >-
    skip-link-spec.html renders the skip link in default + focused states in
    both light and dark modes
status: active
bolt: 1
hat: design-reviewer
started_at: '2026-04-18T03:59:28Z'
hat_started_at: '2026-04-18T04:12:35Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:59:28Z'
    completed_at: '2026-04-18T04:12:34Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T04:12:35Z'
    completed_at: null
    result: null
---
# Keyboard reach, shortcut collisions, and screen-reader conflicts

## Scope

Four FB items all revolve around keyboard users being unable to reach or correctly trigger UI from the keyboard. This unit fixes the `a` collision from unit-04-design-review's unresolved blocker, restores pin reachability, adds skip links to every sticky-header layout, and documents the screen-reader browse-mode conflict that single-key shortcuts introduce.

**FB-to-fix mapping:**

- **FB-14** (`a` collision): unit-04-design-review flagged this as a blocker and recommended `c` (create). Change every `a`→popover binding in `annotation-gesture-spec.html` (lines 126, 245, 366, 372, 378) to `c`. Keep `a` bound to Approve in `keyboard-shortcut-map.html` (:171, :315, :418). Update unit-07's shortcut map summary row.
- **FB-17** (pin `tabindex=-1`): remove `tabindex="-1"` from pin markers in `feedback-inline-desktop.html:193` and `annotation-gesture-spec.html:193`. Set `tabindex="0"` + `aria-label="Feedback FB-XX at {x}% {y}% — press Enter to view details"`. Specify the bidirectional interaction: pin Enter → expand sidebar card + scroll; sidebar Enter → pin cross-flash (already speced). Add a `focus-order-spec.md` documenting Tab order explicitly.
- **FB-28** (`r` SR conflict): add screen-reader conflict analysis to `keyboard-shortcut-map.html §3` naming NVDA, JAWS, VoiceOver. Add `aria-keyshortcuts` attributes on every shortcut-bound element. Document a "Require modifier key for shortcuts" user setting (default off) that remaps `j` → `Alt+j`, etc. Amend help-overlay spec to show both the default and the modifier variant.
- **FB-30** (skip link): add a visually-hidden-until-focused skip link as the first focusable element on every sticky-header artifact (`feedback-inline-desktop.html`, `feedback-inline-mobile.html`, `comments-list-with-agent-toggle.html`, `assessor-summary-card.html`, `revisit-modal-spec.html`, and any other with `sticky top-0`). Add `id="main-content"` and `id="feedback-list"` anchors. Produce a `skip-link-spec.html` with default + focused-state renderings. Update unit-01's completion criteria to require skip links for sticky-header layouts.

## Approach

The designer hat will:

1. Patch `annotation-gesture-spec.html` and `keyboard-shortcut-map.html` to resolve the `a`↔`c` conflict and update the shortcut table + gesture matrix in one pass.
2. Patch pin markers in `feedback-inline-desktop.html` and `annotation-gesture-spec.html` to restore Tab reachability.
3. Write `focus-order-spec.md` enumerating the complete Tab order for the review page and each modal/overlay.
4. Amend `keyboard-shortcut-map.html §3` with screen-reader conflict analysis and the modifier-key setting.
5. Add the skip-link pattern to every sticky-header artifact; produce `skip-link-spec.html`.
6. Update unit-01 completion criteria and unit-07 focus-order section (without modifying their FSM-controlled fields — only the body text).

The design-reviewer hat will Tab through each artifact (mentally or via a screenshot pass) and verify the focus order matches the spec; will grep for remaining `tabindex="-1"` on interactive elements; will confirm both `a`↔Approve and `c`↔Create are documented.

The feedback-assessor hat (auto-injected) will independently verify: no `a`↔popover binding anywhere; no `tabindex="-1"` on pins; skip links present + functional; SR conflict analysis names NVDA/JAWS/VoiceOver + `aria-keyshortcuts` attributes present.

## Completion criteria

- [ ] Annotation-open shortcut is `c` everywhere; `a` is Approve-only
- [ ] `grep -rEn '<kbd>[Aa]</kbd>' stages/design/artifacts/annotation-gesture-spec.html` returns only non-conflicting references
- [ ] Pin markers: `tabindex="0"` + `aria-label` present; `grep -rEn 'tabindex="-1"' stages/design/artifacts/feedback-inline-desktop.html stages/design/artifacts/annotation-gesture-spec.html` returns 0 matches on pin buttons
- [ ] `focus-order-spec.md` documents the page Tab order (header → stage-progress-nav → main content with pins interleaved → sidebar); ties to unit-07's focus-order section
- [ ] Pin Enter/click expands the linked sidebar card and scrolls it into view; reciprocal sidebar Enter → pin cross-flash documented
- [ ] `keyboard-shortcut-map.html §3` names NVDA, JAWS, VoiceOver
- [ ] `aria-keyshortcuts` present on every shortcut-bound element in the affected artifacts
- [ ] "Require modifier key for shortcuts" user setting documented in `keyboard-shortcut-map.html` and the help overlay spec
- [ ] Every sticky-header artifact has a skip link as the first focusable element
- [ ] `id="main-content"` and `id="feedback-list"` anchors exist in every affected artifact
- [ ] `skip-link-spec.html` renders default + focused states in light + dark
- [ ] unit-01 completion criteria amended (in body text, not FSM fields) to require skip links
