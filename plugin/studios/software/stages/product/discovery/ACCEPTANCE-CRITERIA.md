---
name: acceptance-criteria
location: .haiku/intents/{intent-slug}/knowledge/ACCEPTANCE-CRITERIA.md
scope: intent
format: text
required: true
---

# Acceptance Criteria

Prioritized user stories and acceptance criteria produced by the product hat. Defines what "done" looks like from the user's perspective — not how the system implements it.

## Content Guide

- **User stories** — "As a [role], I want [action], so that [benefit]" with specific domain entities
- **Variability brief** — dimensions along which behavior varies, confirmed before AC writing
- **Acceptance criteria** — structured as General Rules first, then variant-specific subsections
- **Prioritization** — P0 (must-have for completion) vs P1 (follow-up)

## Quality Signals

- User stories reference specific domain entities, not generic placeholders
- Every criterion is specific enough to write a test for
- Edge cases and error paths are covered alongside happy paths
- Variability dimensions are explicitly enumerated
