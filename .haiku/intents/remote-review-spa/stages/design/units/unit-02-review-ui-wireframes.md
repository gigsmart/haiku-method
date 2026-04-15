---
title: Review UI document-view wireframes
type: design
status: completed
inputs: ["knowledge/DISCOVERY.md"]
quality_gates:
  - Document-view layout with ToC sidebar and prose content area
  - Intent review and unit review variants wireframed
  - Question page and direction picker variants wireframed
  - Inline margin comments shown as amber left-border annotations
  - Approve/Request Changes sticky footer bar
  - Color-coded session type accents (review=teal, question=amber, direction=indigo)
  - Mobile responsive layout (sidebar collapses to top bar)
---

# Review UI Document-View Wireframes

Selected direction: **Document View** within **Split Panel** shell.

## Layout Structure
- Left sidebar: fixed table of contents with section anchors, active section highlighted with left border accent
- Right panel: prose content area, max-width 720px, sections flow vertically
- Inline comments rendered as margin notes (amber left border)
- Sticky footer with Approve / Request Changes buttons
- Connection status in sidebar footer

## Session Type Accents
- Review: teal (#14b8a6)
- Question: amber (#f59e0b)
- Direction: indigo (#6366f1)

## Variants Needed
1. Intent review (Problem, Solution, Units table, DAG, Criteria, Knowledge, Artifacts)
2. Unit review (Spec, Wireframe/mockup, Criteria, Risks)
3. Question form (context text + multi-question form)
4. Direction picker (archetype cards + parameter sliders)
