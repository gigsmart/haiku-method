---
workflow: default
git:
  change_strategy: intent
  auto_merge: true
  auto_squash: false
announcements: []
passes: []
active_pass: ""
iterates_on: ""
created: 2026-03-27
status: completed
epic: ""
---

# Design as Backpressure

## Problem
When AI builds user-facing UI, the existing backpressure system (tests, lint, types) validates code correctness but has no mechanism for visual fidelity. Tests pass, types check, lint is clean — but the rendered output may look nothing like the design intent. There is no quality gate that compares what the user will actually see against what they were supposed to see. Visual drift accumulates silently across bolts until a human notices.

## Solution
Add visual fidelity checking as a sixth backpressure type in the AI-DLC construction loop. The reviewer hat gains a new "Visual Fidelity" delegation agent that:
1. Resolves the design reference for the unit (external designs > previous iteration screenshots > elaboration wireframes)
2. Captures screenshots of the built output via Playwright at mobile (375px), tablet (768px), and desktop (1280px) breakpoints
3. Sends screenshots alongside the design reference to AI vision for subjective comparison
4. Produces structured findings covering layout, colors, typography, interactive states, responsive behavior, and UX flow
5. Integrates findings into the reviewer's existing `REVIEW COMPLETE` structured marker
6. On failure, loops back to builder with specific visual feedback — same retry mechanism as test failures

The visual gate is a hard requirement: if screenshots can't be captured or a design reference can't be resolved for a UI-producing unit, the review fails.

## Domain Model

### Entities
- **DesignReference** — Source of truth for expected UI appearance. Types: external (Figma exports, uploaded screenshots), iteration (prior intent output), wireframe (elaboration Phase 6.25 HTML). Priority hierarchy determines selection.
- **Screenshot** — Captured PNG of built output at a specific viewport via Playwright. One per breakpoint per review cycle.
- **ComparisonReport** — AI vision analysis comparing screenshots against design reference. Contains verdict (pass/fail) and list of findings.
- **VisualFinding** — Specific visual discrepancy with category (layout/color/typography/states/responsive/flow), severity (high/medium/low), description, and what was expected vs found.

### Relationships
- Unit has zero-or-one DesignReference (resolved via priority hierarchy)
- Unit has many Screenshots (one per breakpoint per review cycle)
- ReviewerHat produces ComparisonReport via Visual Fidelity delegation agent
- ComparisonReport contains many VisualFindings
- Builder consumes VisualFindings as actionable feedback on rejection

### Data Sources
- **Filesystem** — wireframes at `.ai-dlc/{intent}/mockups/`, external designs linked via `design_ref:` frontmatter, unit metadata
- **Dev server / static HTML** — Playwright captures rendered output from running application
- **AI vision** — Claude vision capabilities for subjective comparison analysis

### Data Gaps
- No Playwright infrastructure exists — foundation unit installs and configures it
- No vision comparison prompt template — unit-03 designs the structured prompt
- No auto-detection heuristic for "produces UI output" — unit-03 defines the detection logic

## Success Criteria
- [ ] Reviewer hat documentation includes Visual Fidelity review delegation agent that activates for units producing user-visible output
- [ ] Visual Fidelity agent resolves design references using priority hierarchy: external designs > previous iteration screenshots > elaboration wireframes
- [ ] Playwright-based screenshot capture utility captures built output at 3 breakpoints (mobile 375px, tablet 768px, desktop 1280px)
- [ ] AI vision comparison produces structured findings with category (layout/color/typography/states/responsive/flow), severity (high/medium/low), and specific descriptions
- [ ] Visual findings integrate into reviewer's existing `## REVIEW COMPLETE` structured marker — visual failures result in `Decision: REQUEST CHANGES` with visual feedback
- [ ] Builder receives visual findings as actionable feedback when looped back via `/fail` — same retry mechanism as existing test failures (max 3 retries)
- [ ] Visual gate is a hard requirement — if Playwright can't capture or reference can't be resolved for a UI unit, review fails (not silently skipped)
- [ ] Unit frontmatter supports `design_ref:` field for linking external design files
- [ ] Screenshots stored in `.ai-dlc/{intent-slug}/screenshots/{unit-slug}/` with breakpoint-labeled filenames
- [ ] Backpressure documentation updated to include visual fidelity as the sixth backpressure type

## Context
- Existing backpressure types: test, type, lint, build, security — visual fidelity is the sixth
- Reviewer already delegates to specialized agents (Correctness, Security, Design System, etc.) — Visual Fidelity follows the same pattern
- Reviewer Step 4 already has design provider integration for token checking — visual gate extends from code-level to rendered-output-level
- Builder feedback loop (REQUEST CHANGES → retry up to 3x) works identically for visual failures
- Hard gate CRITERIA_MET already blocks on review failure — visual failures flow through existing gate
- Website stack: Next.js 15, React 19, Tailwind 4, static export
- Playwright is new to the project — no existing visual testing or browser automation
