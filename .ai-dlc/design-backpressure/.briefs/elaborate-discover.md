---
intent_slug: design-backpressure
worktree_path: /Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/design-backpressure
project_maturity: established
provider_config: {"spec": null, "ticketing": null, "design": null, "comms": null}
---

# Intent Description

Build a "design as backpressure" quality gate for the AI-DLC construction loop. When units produce user-visible output, the reviewer hat should capture screenshots of what was built (using Playwright) and compare them against the design reference (elaboration wireframes, external design files like Figma exports, or previous iteration output) using AI vision analysis. If the visual output doesn't match the design intent — covering layout, structure, colors, typography, interactive states, responsive behavior, navigation flows, and UX flow fidelity — the reviewer fails the unit back to the builder with specific visual feedback, same as a test failure.

This adds subjective visual fidelity checking as a first-class backpressure mechanism alongside the existing hard gates (TESTS_PASS, CRITERIA_MET).

## Clarification Answers

**Q: When should the visual design check run?**
A: As part of the reviewer hat's responsibility — the reviewer gains a visual comparison step in its two-stage verification.

**Q: How should the visual comparison work technically?**
A: AI vision analysis — screenshot the built output using Playwright, send it alongside the design reference to a vision model for subjective comparison.

**Q: What should happen when the visual check fails?**
A: Loop back to builder — same as test failure. Builder gets specific visual feedback and iterates until it matches.

**Q: How should the built output be captured?**
A: Playwright screenshots at key breakpoints (mobile, tablet, desktop).

**Q: Which design reference sources should be supported?**
A: All sources with a priority hierarchy:
1. External design files (Figma exports, uploaded screenshots) — highest fidelity
2. Previous iteration output (from iterates_on context)
3. Elaboration wireframes (Phase 6.25 HTML mockups) — lowest fidelity, always available for frontend/design units

**Q: What visual aspects should the gate evaluate?**
A: Full UX flow fidelity — layout & structure, colors, typography, iconography, interactive states, responsive behavior, navigation flows, transitions, and user journey match.

**Q: Which units should the gate apply to?**
A: Any unit that produces user-visible output, regardless of discipline tag.

## Discovery File Path

/Volumes/dev/src/github.com/thebushidocollective/ai-dlc/.ai-dlc/worktrees/design-backpressure/.ai-dlc/design-backpressure/discovery.md
