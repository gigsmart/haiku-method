---
title: 'Component naming, footer-button copy, and sidebar structure reconciliation'
type: design
closes:
  - FB-27
  - FB-34
  - FB-36
depends_on:
  - unit-05-feedback-lifecycle-ownership
inputs:
  - stages/design/DESIGN-BRIEF.md
  - packages/haiku/review-app/src
  - stages/design/artifacts/feedback-card-states.html
  - stages/design/artifacts/comments-list-with-agent-toggle.html
  - stages/design/artifacts/feedback-inline-desktop.html
  - >-
    stages/design/feedback/27-component-naming-diverges-from-existing-review-app-pattern-l.md
  - >-
    stages/design/feedback/34-footer-button-copy-drift-close-vs-verify-close-vs-dismiss-vs.md
  - >-
    stages/design/feedback/36-design-brief-sidebar-segmented-control-contradicts-unit-05-s.md
outputs:
  - stages/design/artifacts/component-inventory.md
  - stages/design/artifacts/footer-button-copy-spec.md
quality_gates:
  - >-
    DESIGN-BRIEF §9 component inventory updated: `SidebarSegmentedControl`
    removed (replaced by `AgentFeedbackToggle` from unit-05);
    `MobileFeedbackSheet` renamed to `FeedbackSheet` (responsive behavior baked
    in) OR split into reusable `MobileSheet` + scoped usage; `FeedbackFAB`
    renamed to `FeedbackFloatingButton` (or `FloatingActionButton` as a shared
    primitive); every new component name follows existing PascalCase pattern
    language from packages/haiku/review-app/src/
  - >-
    `AgentFeedbackToggle` added as a first-class component in DESIGN-BRIEF §9
    with props, state, ARIA contract (ties into unit-13's switch role spec)
  - >-
    component-inventory.md lists every new/renamed/removed component with a
    one-line rationale tied to the review-app pattern language and the accepted
    H·AI·K·U hierarchy
  - >-
    Footer-button copy canonicalized across ALL documents: pending → "Dismiss"
    (single verb for both human and agent origins); addressed → "Verify & Close"
    + "Reopen"; closed/rejected → "Reopen" (one word, no hyphen); DESIGN-BRIEF
    §2, DESIGN-BRIEF §3 Feedback Status Transitions table,
    feedback-card-states.html §1, and unit-05 body text all use the SAME verbs
    and SAME hyphenation
  - >-
    footer-button-copy-spec.md tabulates canonical copy per status × origin
    combination; any split by author_type is either removed (single verb) or
    explicitly documented with rationale
  - >-
    Sidebar structure reconciled: DESIGN-BRIEF §1 and §2 updated to remove
    `SidebarSegmentedControl` ("Mine / Feedback" segmented) and adopt unit-05's
    unified Comments list + AgentFeedbackToggle pattern; ASCII layout at
    DESIGN-BRIEF §1 lines ~76-97 replaced; `ReviewSidebar.tsx` state block at
    DESIGN-BRIEF line ~312 updated; existing filter pills
    ("Pending/Addressed/All" per unit-01) reconciled with the unified list (kept
    as status filters, not identity filters)
  - >-
    grep -rEn '(Mine|Feedback)' stages/design/DESIGN-BRIEF.md filtered to
    exclude references to FeedbackX components — returns no references to the
    `Mine` segmented identity split
status: active
bolt: 1
hat: feedback-assessor
started_at: '2026-04-18T21:17:19Z'
hat_started_at: '2026-04-18T21:21:53Z'
iterations:
  - hat: designer
    started_at: '2026-04-18T21:17:19Z'
    completed_at: '2026-04-18T21:20:05Z'
    result: advance
  - hat: design-reviewer
    started_at: '2026-04-18T21:20:05Z'
    completed_at: '2026-04-18T21:21:53Z'
    result: advance
  - hat: feedback-assessor
    started_at: '2026-04-18T21:21:53Z'
    completed_at: null
    result: null
---
# Component naming, footer-button copy, and sidebar structure reconciliation

## Scope

Three FB items all flag inconsistencies inside the stage's OWN outputs — DESIGN-BRIEF disagrees with unit-05 disagrees with the wireframes. Development cannot pick a side. This unit forces the stage to settle on ONE vocabulary and ONE sidebar structure.

**FB-to-fix mapping:**

- **FB-27** (component naming): update DESIGN-BRIEF §9 inventory to follow `packages/haiku/review-app/src/` pattern language (PascalCase full-word). Specifically:
  - Remove `SidebarSegmentedControl` (replaced by `AgentFeedbackToggle`; ties to FB-36 resolution).
  - Rename `MobileFeedbackSheet` → `FeedbackSheet` (responsive baked in) or split into reusable `MobileSheet` + scoped usage (designer's call; document rationale).
  - Rename `FeedbackFAB` → `FeedbackFloatingButton` (full word; no abbreviation) or adopt a shared `FloatingActionButton` primitive.
  - Add `AgentFeedbackToggle` as a canonical component name (unit-05 used the concept but assigned no PascalCase name).
- **FB-34** (footer-button copy drift): settle on canonical vocabulary across four documents:
  - `pending` → **Dismiss** (single verb for human and agent origins — simpler than split)
  - `addressed` → **Verify & Close** + **Reopen**
  - `closed`/`rejected` → **Reopen** (one word, no hyphen)
  - Sweep DESIGN-BRIEF §2 (lines ~218-220), §3 (lines ~472-480), feedback-card-states.html §1 (lines ~45-64), and unit-05 body text (lines ~37-39) to match. Verify no "Re-open" vs "Reopen" drift remains.
- **FB-36** (sidebar segmented control contradicts unit-05): update DESIGN-BRIEF §1 (lines ~99-108) and §2 (lines ~287-300) to remove the `SidebarSegmentedControl` with "Feedback" / "Mine" segments. Replace with the unified Comments list + AgentFeedbackToggle pattern unit-05 specified. Update the ASCII sidebar layout (lines ~76-97) and the `ReviewSidebar.tsx` state block (line ~312). Reconcile the existing status filter pills ("Pending/Addressed/All" from unit-01) with the unified list — they stay, but they're status filters, NOT identity filters.

## Approach

The designer hat will:

1. Produce `component-inventory.md` listing every new/renamed/removed component, each with a one-line rationale tied to the review-app pattern language.
2. Produce `footer-button-copy-spec.md` tabulating canonical copy per status × origin combination — settles the verb, the hyphenation, and whether copy splits by author_type.
3. Sweep DESIGN-BRIEF §1, §2, §3, §9 to apply the naming + copy + sidebar-structure changes.
4. Sweep `feedback-card-states.html` §1 footer-button inventory to match `footer-button-copy-spec.md`.
5. Amend unit-05 body text (NOT FSM fields) to adopt canonical copy.

The design-reviewer hat will verify the four-document consistency by cross-referencing section-by-section, and will grep for residual drift (e.g. `Re-open` vs `Reopen`, `Dismiss` vs `Reject` vs `Close`).

The feedback-assessor hat (auto-injected) will independently verify: component inventory matches review-app pattern language (no abbreviations, PascalCase, full words); footer-button copy is identical across DESIGN-BRIEF §2, §3, feedback-card-states.html §1, unit-05 body; DESIGN-BRIEF §1 + §2 no longer contain `SidebarSegmentedControl` or "Mine" segment references.

## Completion criteria

- [ ] DESIGN-BRIEF §9 component inventory matches the review-app PascalCase pattern language; `FAB` abbreviation removed; `Mobile` prefix resolved (renamed or rationalized); `SidebarSegmentedControl` removed; `AgentFeedbackToggle` added
- [ ] `component-inventory.md` written with one-line rationale per component decision
- [ ] Footer-button copy canonicalized: pending → "Dismiss"; addressed → "Verify & Close" + "Reopen"; closed/rejected → "Reopen" (one word)
- [ ] `footer-button-copy-spec.md` tabulates canonical copy per status × origin
- [ ] DESIGN-BRIEF §2, §3, feedback-card-states.html §1, and unit-05 body text all use the canonical verbs + hyphenation
- [ ] `grep -rEn 'Re-open' stages/design/` returns 0 matches in unit + artifact files
- [ ] DESIGN-BRIEF §1 sidebar ASCII layout replaced with unified Comments + AgentFeedbackToggle; §2 `SidebarSegmentedControl` component removed; `ReviewSidebar.tsx` state block updated
- [ ] `grep -rEn '\bMine\b' stages/design/DESIGN-BRIEF.md` returns 0 matches for the segmented-identity context
- [ ] Status filter pills ("Pending/Addressed/All") preserved in the unified list with a note clarifying they are status filters, NOT identity filters
