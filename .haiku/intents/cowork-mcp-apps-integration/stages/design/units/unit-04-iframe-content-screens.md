---
title: >-
  Iframe-mode layouts for IntentReview / UnitReview / QuestionPage /
  DesignPicker / AnnotationCanvas
type: feature
model: sonnet
depends_on:
  - unit-01-iframe-shell-layout
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - stages/design/DESIGN-BRIEF.md
  - knowledge/DESIGN-TOKENS.md
  - stages/design/units/unit-01-iframe-shell-layout.md
status: active
bolt: 1
hat: design-reviewer
started_at: '2026-04-15T12:44:41Z'
hat_started_at: '2026-04-15T12:56:12Z'
outputs: |-
  - stages/design/artifacts/intent-review-narrow.html
  - stages/design/artifacts/intent-review-medium.html
  - stages/design/artifacts/intent-review-wide.html
  - stages/design/artifacts/unit-review-narrow.html
  - stages/design/artifacts/unit-review-medium.html
  - stages/design/artifacts/unit-review-wide.html
  - stages/design/artifacts/question-narrow.html
  - stages/design/artifacts/question-medium.html
  - stages/design/artifacts/question-wide.html
  - stages/design/artifacts/design-picker-narrow.html
  - stages/design/artifacts/design-picker-medium.html
  - stages/design/artifacts/design-picker-wide.html
  - stages/design/artifacts/annotation-canvas-narrow.html
  - stages/design/artifacts/annotation-canvas-medium.html
  - stages/design/artifacts/annotation-canvas-wide.html
  - stages/design/artifacts/unit-04-design-review.md
---

# Iframe-mode layouts for the five existing review screens

## Scope

The five existing review screens (`IntentReview`, `UnitReview`, `QuestionPage`, `DesignPicker`, `AnnotationCanvas`) need responsive layout deltas for iframe mode. The component trees stay the same; only the wrapper layout changes. This unit produces high-fidelity mockups for each screen at the three iframe-width breakpoints.

In scope:
- Three mockups per screen (narrow / medium / wide) at `stages/design/artifacts/{screen}-{breakpoint}.html`. Five screens × three breakpoints = 15 files.
- Stack-vs-grid logic for `DesignPicker` archetype cards (vertical at narrow, side-by-side at wide).
- Slider position for `DesignPicker` parameters (below preview at narrow, beside at wide).
- Annotation canvas resize behavior — the canvas should size to the iframe width and scale annotations proportionally.
- Question-image pair behavior — single column at narrow, side-by-side at medium and wide.
- Keyboard shortcuts visible in each screen's footer.

Out of scope:
- Component code refactors — implementation belongs to a later stage.
- Browser-tab versions of these screens — unchanged.
- New components — covered by units 02 and 03.

## Completion Criteria

1. **15 mockup files exist** at the named paths — verified by `ls stages/design/artifacts/{intent-review,unit-review,question,design-picker,annotation-canvas}-{narrow,medium,wide}.html 2>/dev/null | wc -l` returns 15.
2. **DesignPicker stacks vertically at narrow** — verified by inspection of `design-picker-narrow.html` (no flex-row at the archetype list).
3. **AnnotationCanvas is responsive** — the canvas element has `max-width: 100%` and aspect-ratio preserved at all three breakpoints.
4. **Keyboard shortcuts documented** in each screen's footer — verified by `grep -c "kbd" stages/design/artifacts/*-narrow.html` returns ≥ 5.
5. **Touch targets ≥ 44px** on every interactive element across all 15 mockups — verified by `grep -c "min-height" stages/design/artifacts/*.html` ≥ 30 (decision buttons + form controls per screen).
6. **No raw hex** across all 15 files — `rg -n '#[0-9a-fA-F]{3,6}' stages/design/artifacts/*-{narrow,medium,wide}.html` returns zero hits in style attributes.
7. **`aria-labelledby`** on form regions in `QuestionPage` and `DesignPicker` mockups — verified by grep.
8. **External-review constraint** documented in `intent-review-{narrow,medium,wide}.html`: external-review URL renders as a copy-to-clipboard input with instructions, NOT a clickable link (sandbox `allow-popups` not assumed).
