---
status: success
error_message: ""
---

# Discovery Results

## Domain Model Summary

### Entities
- **DesignReference** — Source of truth for expected UI appearance. Fields: `type` (external|iteration|wireframe), `path`, `fidelity` (high|medium|low), `breakpoints`
- **Screenshot** — Captured image of built output at a viewport. Fields: `unit_slug`, `breakpoint`, `viewport_width`, `path`, `captured_at`
- **ComparisonReport** — AI vision analysis result. Fields: `unit_slug`, `breakpoint`, `verdict` (pass|fail), `fidelity_score`, `findings`
- **VisualFinding** — Specific visual discrepancy. Fields: `category` (layout|color|typography|states|responsive|flow), `severity`, `description`, `location`, `reference_detail`, `actual_detail`
- **ReviewerHat** — Existing, gains Visual Fidelity review delegation agent
- **Unit** — Existing, gains `design_ref` field and visual gate auto-detection

### Relationships
- Unit has zero-or-one DesignReference (priority: external > iteration > wireframe)
- Unit has many Screenshots (one per breakpoint per review cycle)
- Unit has one ComparisonReport per review cycle
- ComparisonReport has many VisualFindings
- ReviewerHat produces ComparisonReport via delegated Visual Fidelity agent
- Builder consumes VisualFindings as feedback on rejection

### Data Sources
- **Filesystem** — wireframes at `.ai-dlc/{intent}/mockups/`, external designs, unit frontmatter
- **Dev server** — Playwright captures from `localhost:3000` (or configured port)
- **AI vision** — Claude vision for subjective comparison

### Data Gaps
- No Playwright infrastructure (new dependency)
- No screenshot storage convention
- No vision comparison prompt template
- No auto-detection heuristic for "produces UI output"

## Key Findings

- Reviewer hat already delegates to specialized agents (Correctness, Security, Design System, etc.) — visual fidelity fits naturally as a new delegation agent
- Reviewer Step 4 already has design provider integration for token checking — visual gate extends this from code-level to rendered-output-level
- Builder feedback loop (REQUEST CHANGES → retry up to 3x) works identically for visual failures — no new retry mechanism needed
- Hard gate CRITERIA_MET already blocks on review failure — visual fidelity failures flow through existing gate
- Wireframe HTML files exist but have no rendering/screenshot capability — Playwright fills this gap
- No existing visual testing or browser automation in the project — entirely new infrastructure
- Website uses Next.js 15 with static export, React 19, Tailwind 4

## Open Questions

- Should the visual gate require a running dev server, or can it work with static HTML files opened in Playwright? (Wireframes are static HTML; built apps may need a dev server)
- How should the vision comparison prompt handle fidelity differences? (Wireframes are gray/low-fi; external designs are high-fi — the comparison tolerance should adapt)
- Should screenshots be committed to git or stored as ephemeral artifacts? (Git bloat vs. historical record)
- How does the builder know which specific routes/pages to screenshot? (Route mapping from unit spec?)
- Should the visual gate run for every bolt iteration or only at review time? (Performance vs. early feedback)
