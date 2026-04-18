---
title: 'ARIA roles, semantic landmarks, and focus-ring consistency'
type: design
closes:
  - FB-22
  - FB-26
  - FB-32
  - FB-33
  - FB-35
  - FB-37
depends_on:
  - unit-05-feedback-lifecycle-ownership
inputs:
  - stages/design/DESIGN-BRIEF.md
  - stages/design/artifacts/feedback-inline-mobile.html
  - stages/design/artifacts/feedback-inline-desktop.html
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/annotation-popover-states.html
  - stages/design/artifacts/assessor-summary-card.html
  - stages/design/artifacts/revisit-modal-spec.html
  - stages/design/artifacts/focus-ring-spec.html
  - >-
    stages/design/feedback/22-mobile-bottom-sheet-missing-focus-trap-markup-in-wireframe.md
  - >-
    stages/design/feedback/26-screen-reader-announcements-undefined-for-optimistic-ui-stat.md
  - >-
    stages/design/feedback/32-agent-feedback-toggle-is-a-custom-switch-without-proper-aria.md
  - >-
    stages/design/feedback/33-emoji-icons-convey-critical-origin-info-but-screen-reader-la.md
  - >-
    stages/design/feedback/35-review-page-missing-landmark-structure-beyond-role-tablist.md
  - >-
    stages/design/feedback/37-focus-ring-specified-but-not-consistently-applied-across-all.md
outputs:
  - stages/design/artifacts/aria-landmark-spec.md
  - stages/design/artifacts/aria-live-sequencing-spec.md
  - stages/design/artifacts/agent-feedback-toggle-spec.html
  - stages/design/artifacts/focus-ring-spec.html
quality_gates:
  - >-
    Mobile bottom sheet has `role="dialog" aria-modal="true"
    aria-labelledby="sheet-title"` on container AND `id="sheet-title"` on the
    sheet heading; main page content receives `aria-hidden="true"` + `inert`
    while the sheet is open; close button returns focus to the FAB; focus-trap
    strategy named explicitly (library OR inert-attribute approach) in sheet
    artifact comments or DESIGN-BRIEF §6
  - >-
    Optimistic UI aria-live sequence specified in aria-live-sequencing-spec.md:
    on click → "FB-XX marking as closed…" (present progressive); on success →
    "FB-XX closed."; on failure → "FB-XX close failed; reverted to addressed."
    Every transition (close, verify, reopen, reject) has its own three-phase
    template. unit-05's quality gates amended (body text) to reference this
    spec.
  - >-
    Agent-feedback toggle replaced with an accessible control: `<button
    role="switch" aria-checked="false" aria-label="Show agent feedback">` (or
    `<input type="checkbox" class="sr-only peer">` + visible span driven by
    `peer-checked:` classes). Native keyboard (Space/Enter) toggles it;
    `focus-visible:ring-2 focus-visible:ring-teal-500` present; 44px touch hit
    area wrapping the 32×16 visual; agent-feedback-toggle-spec.html renders
    default + checked + focus + hover + disabled states.
  - >-
    Emoji ↔ origin mapping is SINGLE-SOURCE: DESIGN-BRIEF §2 and every artifact
    render the same emoji for each of the 6 origins; screen-reader-facing labels
    (`aria-label` or visible text) match exactly; an origin-legend component is
    placed in the sidebar header OR help overlay and documented in DESIGN-BRIEF
    §2; emoji rendering smoke-test note in artifact comments covering Apple
    Color Emoji, Segoe UI Emoji, Noto Emoji
  - >-
    Landmark structure mandated by unit-01 completion criteria amendment (body
    text) AND implemented in every artifact: `<header role="banner">`, `<nav
    aria-label="Stage progress">` around stage-progress-strip, `<main
    id="main-content">`, `<aside aria-label="Review sidebar">`, `role="dialog"
    aria-modal="true"` on every modal, `role="status" aria-live="polite"` on
    assessor-summary-card root; aria-landmark-spec.md enumerates the complete
    landmark map
  - >-
    Focus ring: canonical 2px teal-500 outline at 2px offset (1px on feedback
    cards) applied uniformly; `grep -rEn 'focus:ring-1'
    stages/design/artifacts/` returns 0 matches for interactive elements;
    revisit-modal Cancel button has `focus-visible:ring-2
    focus-visible:ring-teal-500`; revisit-modal Confirm button either uses
    teal-500 OR focus-ring-spec.html documents an explicit rule allowing
    color-matched focus rings per variant; every `<input>`, `<textarea>`,
    `<button>`, `[tabindex="0"]`, `<a>` declares `focus-visible:ring-2
    focus-visible:ring-teal-500` (or the variant rule)
status: active
bolt: 1
hat: designer
started_at: '2026-04-18T03:59:39Z'
hat_started_at: '2026-04-18T03:59:39Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T03:59:39Z'
    completed_at: null
    result: null
---
# ARIA roles, semantic landmarks, and focus-ring consistency

## Scope

Six FB items all cluster on "the artifacts produce the visual but not the semantics." Screen reader users, keyboard users, and AT software cannot correctly parse regions, modal dialogs, live updates, or toggle state from the current markup. This unit writes the missing semantic layer as a set of specs the development stage can implement verbatim.

**FB-to-fix mapping:**

- **FB-22** (mobile bottom-sheet focus trap): add `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` to `feedback-inline-mobile.html:116` sheet container; add `id="sheet-title"` to the Feedback h2; document focus-trap strategy (library name or inert-attribute approach) in sheet artifact comments AND DESIGN-BRIEF §6; close button returns focus to FAB; main content gets `aria-hidden="true"` + `inert` while sheet is open.
- **FB-26** (aria-live sequencing for optimistic UI): produce `aria-live-sequencing-spec.md` defining three-phase announcements for every transition (close, verify, reopen, reject). Spinner visible + `<span class="sr-only">Processing…</span>` inside in-flight cards. Amend unit-05's body text to reference this spec (do not modify unit-05 FSM fields).
- **FB-32** (agent-feedback toggle ARIA): replace the `<label>` + styled `<span>` at `comments-list-with-agent-toggle.html:65-76` with an accessible switch control. Produce `agent-feedback-toggle-spec.html` rendering default/checked/focus/hover/disabled states. Wrap in a 44px touch target.
- **FB-33** (emoji ↔ origin mapping): reconcile DESIGN-BRIEF §2 spec with artifact implementations. Pick one emoji set (recommend adopting unit-05's richer pill choices: 🛡 adversarial-review, 🔀 external-pr/mr, 👁 user-visual, 💬 user-chat, ✨ agent — OR revert to the brief's simpler set 🔍/🔗/✎/💬/🤖; either works but both docs must match). Add origin-legend spec. Include emoji-rendering cross-platform note.
- **FB-35** (landmarks): mandate landmark structure in unit-01 completion criteria amendment AND implement in every affected artifact (`feedback-inline-desktop.html:70` main, every sidebar → `<aside>`, stage-progress-strip → `<nav>`, revisit-modal-spec.html → `role="dialog"`, assessor-summary-card.html:47 → `role="status"`). Produce `aria-landmark-spec.md` enumerating the complete landmark map.
- **FB-37** (focus-ring consistency): eliminate `focus:ring-1` (`annotation-popover-states.html:247/249`, `feedback-inline-mobile.html:251`). Add focus styles to `revisit-modal-spec.html:167` Cancel button. Decide: either normalize Confirm button focus to teal-500 OR update `focus-ring-spec.html` to document a "variant-matched focus ring" rule. Enforce 2px minimum everywhere.

## Approach

The designer hat will:

1. Produce `aria-landmark-spec.md` listing every landmark for every page/modal/sheet across all artifacts.
2. Produce `aria-live-sequencing-spec.md` with a three-phase announcement template per transition.
3. Produce `agent-feedback-toggle-spec.html` with the accessible switch pattern and five interactive states.
4. Update `focus-ring-spec.html` with the final rule (teal-500 canonical; document variant rule if adopted) and add missing focus styles to the revisit modal Cancel button.
5. Sweep all artifacts to add `role="dialog" aria-modal="true"`, `role="status" aria-live="polite"`, `<header role="banner">`, `<nav aria-label="Stage progress">`, `<aside aria-label="Review sidebar">`, `id="sheet-title"` + `aria-labelledby`, etc.
6. Reconcile emoji ↔ origin mapping in DESIGN-BRIEF §2 and every artifact that renders origin icons.
7. Amend unit-01 and unit-05 body text (NOT FSM fields) to reference the new specs.

The design-reviewer hat will run through the expected landmark-navigation sequence in each artifact (VoiceOver rotor equivalent on paper) and verify every region is reachable and labeled; will verify aria-live templates cover every user action; will verify the switch control has all 5 states documented.

The feedback-assessor hat (auto-injected) will independently verify: focus-trap markup on mobile sheet; aria-live sequence spec exists + covers all transitions; switch control uses `role="switch"` + `aria-checked` + keyboard handlers + 44px hit area; emoji ↔ origin mapping is identical across brief and all artifacts; landmark structure present in every artifact; `focus:ring-1` grep returns 0.

## Completion criteria

- [ ] Mobile bottom sheet has `role="dialog" aria-modal="true" aria-labelledby="sheet-title"` + `id="sheet-title"` on heading
- [ ] Main content receives `aria-hidden="true"` + `inert` while sheet is open; close button returns focus to FAB; focus-trap strategy named in comments or DESIGN-BRIEF §6
- [ ] `aria-live-sequencing-spec.md` defines three-phase announcements for every feedback transition (close, verify, reopen, reject); spinner + sr-only "Processing…" inside in-flight cards
- [ ] unit-05 body text amended to reference aria-live spec in its quality gates
- [ ] Agent-feedback toggle replaced with `<button role="switch" aria-checked aria-label>` or equivalent pattern; 44px touch target; `focus-visible:ring-2 focus-visible:ring-teal-500`
- [ ] `agent-feedback-toggle-spec.html` renders default + checked + focus + hover + disabled states
- [ ] DESIGN-BRIEF §2 and every artifact render the SAME emoji for each origin; origin-legend component spec'd; cross-platform rendering note present
- [ ] `aria-landmark-spec.md` enumerates landmarks for every page/modal/sheet
- [ ] Every artifact implements `<header role="banner">`, `<nav aria-label="Stage progress">`, `<main id="main-content">`, `<aside aria-label="Review sidebar">`, `role="dialog" aria-modal="true"` on modals, `role="status" aria-live="polite"` on assessor-summary-card root
- [ ] unit-01 body text amended to require landmark structure
- [ ] `grep -rEn 'focus:ring-1' stages/design/artifacts/` returns 0 matches on interactive elements
- [ ] Revisit-modal Cancel button has `focus-visible:ring-2 focus-visible:ring-teal-500`
- [ ] Revisit-modal Confirm button focus ring either teal-500 OR focus-ring-spec.html documents a "variant-matched focus ring" rule
- [ ] Every `<input>`, `<textarea>`, `<button>`, `[tabindex="0"]`, `<a>` in every artifact declares focus styles per the canonical rule
