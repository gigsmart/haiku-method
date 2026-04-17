---
title: Annotation creation UX across artifact types
type: design
closes:
  - FB-01
depends_on: []
inputs:
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/feedback/01-annotation-creation-ux-for-docs-and-visual-artifacts.md
  - >-
    .haiku/intents/universal-feedback-model-and-review-recovery/stages/design/artifacts/review-ui-mockup.html
outputs:
  - stages/design/artifacts/annotation-gesture-spec.html
  - stages/design/artifacts/annotation-popover-states.html
  - stages/design/artifacts/unit-04-design-review.md
status: completed
bolt: 3
hat: design-reviewer
started_at: '2026-04-17T16:51:12Z'
hat_started_at: '2026-04-17T21:32:01Z'
completed_at: '2026-04-17T21:38:55Z'
---

# Annotation creation UX across artifact types

## Goal

Specify the creation gesture and supporting UX for annotations on every artifact kind the reviewer can see. Today's mockup renders existing annotations; this unit closes the gap by speccing the *creation* path — click-to-place on spatial artifacts, click-a-line on text/markdown, and an adjacent location-form for iframe-embedded (HTML, PDF) where direct click-in can't cross the iframe boundary.

The deliverables must be concrete enough for the development stage to wire up without inventing UX.

## Quality Gates

- Creation gesture, cursor affordance, and popover UX are specified for **every** artifact kind in the feedback surface: raster image, inline SVG, markdown/text, HTML iframe, PDF embed. Any future kind inherits the matching pattern.
- Coordinate schema documented: spatial artifacts capture `{ x, y }` normalized to 0–1 of the visible bounds; text captures `{ line }` 1-indexed; iframe fallback captures `{ page, region }` as user-selected location-field values.
- Wireframes exist (light + dark) for the popover open state, filled-title-body state, and the iframe fallback form. Small-viewport behavior documented for the popover.
- Keyboard equivalent for annotation creation specified (ties to unit-07 shortcut map — e.g. focused-line + key opens popover at line; focused-artifact-wrapper + key opens popover centered).
- Accessibility: focused popover traps focus, returns focus on close, exposes `aria-label`, ESC cancels creation. Touch targets on the popover footer are ≥ 44px.
- Storage contract written: annotation location lives on `feedback.target.annotation` alongside `target.kind` and `target.{unit,knowledge,output,file}Name`. Document the exact shape the CRUD tool must accept and persist.
