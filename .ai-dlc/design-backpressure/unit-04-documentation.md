---
status: completed
last_updated: ""
depends_on:
  - unit-03-visual-fidelity-agent
branch: ai-dlc/design-backpressure/04-documentation
discipline: documentation
pass: ""
workflow: ""
ticket: ""
---

# unit-04-documentation

## Description
Update all AI-DLC plugin documentation to reflect visual fidelity as the sixth backpressure type. This includes the backpressure skill docs, reviewer hat docs, builder reference docs, and the elaboration skill docs (for the `design_ref:` frontmatter field).

## Discipline
documentation - This unit will be executed by `do-technical-documentation` specialized agents.

## Domain Entities
- **Backpressure** — The documented concept of automated quality gates. This unit adds visual fidelity to the list alongside test, type, lint, build, and security backpressure.
- **ReviewerHat** — The documented reviewer process. This unit ensures the visual fidelity delegation agent is properly documented in the reviewer hat file.
- **Unit frontmatter** — The documented schema for unit files. This unit documents the new `design_ref:` and `views:` fields.

## Data Sources
- **Existing documentation files** (filesystem):
  - `plugin/skills/backpressure/SKILL.md` — backpressure theory and types
  - `plugin/hats/reviewer.md` — reviewer two-stage verification process
  - `plugin/hats/reviewer-reference.md` — anti-rationalization reference
  - `plugin/hats/builder.md` — builder backpressure guidance
  - `plugin/hats/builder-reference.md` — builder design reference guidance
  - `plugin/skills/elaborate/SKILL.md` — unit frontmatter template
- **New scripts created by units 01-03** (filesystem):
  - `plugin/lib/capture-interface.md` — capture interface contract
  - `plugin/lib/capture-screenshots.sh` — dispatcher
  - `plugin/lib/capture-playwright.sh` — Playwright provider
  - `plugin/lib/capture-manual.sh` — manual provider
  - `plugin/lib/resolve-design-ref.sh` — reference resolver
  - `plugin/lib/detect-visual-gate.sh` — gate auto-detection
  - `plugin/lib/run-visual-comparison.sh` — comparison orchestration
  - `plugin/lib/vision-comparison-prompt.md` — vision prompt template

## Technical Specification

### 1. Update Backpressure Skill Docs
In `plugin/skills/backpressure/SKILL.md`, add visual fidelity as the sixth backpressure type:

```markdown
6. **Visual Fidelity Backpressure** - AI vision comparison
   - AI learns to match design references visually
   - Screenshots captured via pluggable providers (Playwright default)
   - Compared against design references (external designs, previous iterations, wireframes)
   - Fidelity-aware: tolerance adjusts based on reference quality
   - Hard gate: cannot skip when visual gate is active
```

Add to the "AI Adaptation Patterns" section:
```markdown
4. **Design Fidelity** - AI learns to reproduce design references accurately,
   preemptively matching layout, colors, typography, and spacing before review
```

Add to the anti-patterns section:
```markdown
- ❌ "The wireframe is too vague to compare" → ✅ Fidelity-aware comparison adjusts tolerance
- ❌ Skipping visual gate because dev server won't start → ✅ Fix infrastructure, use manual provider as fallback
```

### 2. Update Reviewer Hat Docs
In `plugin/hats/reviewer.md`:
- Add Visual Fidelity to the delegation agent table in Step 4
- Add visual fidelity check to the review process description
- Update the REVIEW COMPLETE marker template to include the `**Visual Fidelity:**` line
- Document the hard gate behavior: visual gate active + comparison fails = REQUEST CHANGES

In `plugin/hats/reviewer-reference.md`:
- Add anti-rationalization entries for visual fidelity:

| Excuse | Reality |
|--------|---------|
| "The wireframes are too different" | Fidelity level adjusts tolerance. Low-fidelity compares structure, not pixels. |
| "Visual comparison is subjective" | That's why we use structured categories. High-severity issues are objective (missing sections, wrong layout). |
| "The screenshots didn't capture correctly" | Infrastructure failure is a review failure. Fix the capture, don't skip the gate. |

### 3. Update Builder Docs
In `plugin/hats/builder.md`, add to Step 3 ("Use backpressure as guidance"):
```markdown
You MUST treat visual fidelity failures as implementation guidance:
- Read comparison-report.md for specific visual differences
- Reference screenshots show design intent, built screenshots show what you produced
- High-severity findings are blocking — fix before re-submitting
```

In `plugin/hats/builder-reference.md`, add section on visual fidelity feedback handling:
- How to read and interpret comparison-report.md
- How to compare ref-*.png vs built *.png to understand the gap
- How fidelity level affects what's expected

### 4. Update Elaboration Skill Docs
In `plugin/skills/elaborate/SKILL.md`, update the unit frontmatter template to include:
```yaml
design_ref: ""  # Optional: path to external design file or provider URI (e.g., figma://file/node)
views: []       # Optional: list of views/routes this unit produces (for visual gate)
```

Add documentation explaining:
- When to use `design_ref:` (external design files, Figma exports)
- When views are auto-discovered vs explicitly listed
- How the visual gate activates based on frontmatter and changed files

### 5. Changelog Entry
Add entry to `CHANGELOG.md` under the appropriate version section:

```markdown
### Added
- Visual fidelity backpressure: reviewer captures screenshots and compares against design references using AI vision
- Pluggable screenshot capture with Playwright (web) and manual (any platform) providers
- Design reference resolution with priority hierarchy (external > iteration > wireframe)
- `design_ref:` and `views:` unit frontmatter fields for explicit design linking
```

## Success Criteria
- [ ] Backpressure skill docs list visual fidelity as the sixth type with description, AI adaptation patterns, and anti-patterns
- [ ] Reviewer hat docs include Visual Fidelity delegation agent with activation criteria
- [ ] Reviewer reference docs include anti-rationalization entries for visual fidelity
- [ ] REVIEW COMPLETE marker template in reviewer docs includes `**Visual Fidelity:**` line
- [ ] Builder hat docs include visual fidelity feedback handling in Step 3
- [ ] Builder reference docs explain how to read comparison reports and compare screenshots
- [ ] Elaboration skill docs include `design_ref:` and `views:` in unit frontmatter template
- [ ] CHANGELOG.md updated with visual fidelity feature entries
- [ ] All documentation changes are consistent with the actual implementation from units 01-03

## Risks
- **Documentation drift**: Docs written based on spec may not match actual implementation if units 01-03 deviated. Mitigation: this unit depends on unit-03 being complete — read the actual implementation before writing docs.
- **Excessive documentation**: Adding too many sections may make existing docs harder to navigate. Mitigation: keep additions concise and placed in-line with existing structure rather than creating new top-level sections.

## Boundaries
This unit does NOT handle:
- Implementation of any scripts or tools (units 01-03 own those)
- Creating new documentation files (only updates existing ones, except changelog)
- Website documentation updates (out of scope for this intent — the plugin docs are the audience)

This unit ONLY updates existing plugin documentation to reflect the new visual fidelity backpressure system.

## Notes
- Read the actual implementation from units 01-03 before writing docs — do not document based solely on this spec. The implementation is the source of truth.
- Keep the same tone and structure as existing documentation — visual fidelity should feel like a natural extension, not an afterthought.
- The backpressure skill doc is the primary place users learn about quality gates — ensure the visual fidelity section is thorough enough to understand the concept without reading implementation code.
- The changelog entry format should match existing entries in CHANGELOG.md.
