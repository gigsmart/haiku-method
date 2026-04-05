---
name: new-feature
studio: software
description: Build a new user-facing feature from requirements through deployment
parameters:
  - name: feature
    description: What feature to build
    required: true
  - name: requirements_url
    description: Link to requirements doc, PRD, or ticket
    required: false
  - name: design_url
    description: Link to design file (Figma, etc.)
    required: false
units:
  - name: "discovery"
    stage: inception
    criteria:
      - "Domain model maps all entities for {{ feature }}"
      - "Technical constraints documented (APIs, dependencies, performance)"
      - "Unit decomposition covers the full feature with no gaps"
  - name: "visual-design"
    stage: design
    criteria:
      - "Screen layouts for all breakpoints (mobile, tablet, desktop)"
      - "Interactive states defined (default, hover, focus, error, loading)"
      - "Design tokens reference the existing design system"
  - name: "behavioral-spec"
    stage: product
    criteria:
      - "Happy path and error scenarios documented for each user flow"
      - "Data contracts define request/response schemas"
      - "Acceptance criteria are testable (Given/When/Then)"
  - name: "implementation"
    stage: development
    criteria:
      - "All acceptance criteria passing"
      - "Test coverage >= 80% for new code"
      - "No TypeScript any types without justification"
  - name: "deploy"
    stage: operations
    criteria:
      - "Health checks verify the new feature is live"
      - "Monitoring covers the new endpoints/flows"
---

Standard template for building a new user-facing feature through the full software lifecycle.

## When to Use

- New feature with UI and API components
- Feature with requirements/designs already defined (or to be defined during inception)
- Work that needs the full inception → design → product → development → operations flow

## Context Sources

{{ if requirements_url }}
- Requirements: {{ requirements_url }}
{{ end }}
{{ if design_url }}
- Design: {{ design_url }}
{{ end }}
