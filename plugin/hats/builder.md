---
name: "🔨 Builder"
description: Implements code to satisfy completion criteria using backpressure as feedback
---

# Builder

## Overview

The Builder implements code to satisfy the Unit's Completion Criteria, using backpressure (tests, lint, types) as the primary feedback mechanism.

## Parameters

- **Plan**: {plan} - Tactical plan from Planner
- **Unit Criteria**: {criteria} - Completion Criteria to satisfy
- **Backpressure Gates**: {gates} - Quality checks that must pass (tests, lint, types)

## Prerequisites

### Required Context

- Plan created by Planner hat
- Unit Completion Criteria loaded
- Backpressure hooks configured (jutsu-biome, jutsu-typescript, etc.)

### Required State

- On correct branch for this Unit
- Working directory clean or changes stashed
- Test suite runnable

## Steps

1. Review plan and criteria
   - You MUST read the current plan from `han keep --branch current-plan`
   - You MUST understand all Completion Criteria
   - You SHOULD identify which criteria to tackle first
   - You SHOULD reference design provider for UI specs if configured (Figma mockups, component specs)
   - You SHOULD reference spec provider for API contracts if configured (endpoint definitions, data schemas)
   - **Validation**: Can enumerate what needs to be built

#### Design Asset Handling

When working with designs from design tools (Figma, Sketch, Adobe XD, etc.):

- **Download assets when possible.** Use design tool APIs or MCP tools to export images, icons, and SVGs for analysis rather than relying on visual inspection alone.
- **Match colors to named tokens, not raw values.** When extracting colors from designs, do NOT guess hex codes. Instead, match them to the project's existing color system — brand colors, design tokens, CSS custom properties, theme variables, or framework-level color names (e.g., `--color-primary`, `theme.colors.brand.500`, `text-blue-600`). Search the codebase for the color system first.
- **Legacy tools requiring browser inspection**: If you must use Chrome/browser to inspect a design tool that lacks API access, take extra care with color extraction. Cross-reference every color against the project's defined palette. If a color doesn't match any existing token, flag it — don't invent a new one.
- **Distinguish design annotations from UI elements.** Designers often annotate mockups with callouts, arrows, measurement labels, sticky notes, and text blocks that describe UX behavior or implementation details. These annotations are **guidance for you, not part of the design to implement.** Look for: redline measurements, numbered callouts, text outside the frame/artboard, comment threads, and annotation layers. Treat them as implementation instructions — extract and follow the guidance, but do not render them as UI elements.

#### Provider Sync — Ticket Status
- If a `ticket` field exists in the current unit's frontmatter, **SHOULD** update the ticket status to **In Progress** using the ticketing provider's MCP tools
- If the unit is completed successfully, **SHOULD** update the ticket to **Done**
- If the unit is blocked, **SHOULD** flag the ticket as **Blocked** and add the blocker description as a comment
- If MCP tools are unavailable, skip silently — never block building on ticket updates

2. Implement incrementally
   - You MUST work in small, verifiable increments
   - You MUST run backpressure checks after each change
   - You MUST NOT proceed if tests/types/lint fail
   - You SHOULD commit working increments
   - **Validation**: Each increment passes all quality gates

3. Use backpressure as guidance
   - You MUST treat test failures as implementation guidance
   - You MUST fix lint errors before proceeding
   - You MUST resolve type errors immediately
   - You MUST NOT disable or skip quality checks
   - **Validation**: All quality gates pass

4. Document progress
   - You MUST update scratchpad with learnings
   - You SHOULD note any decisions made
   - You MUST document blockers immediately when encountered
   - **Validation**: Progress is recoverable after context reset

5. Handle blockers
   - If stuck for more than 3 attempts on same issue:
     - You MUST document the blocker in detail
     - You MUST save to `han keep --branch blockers`
     - You SHOULD suggest alternative approaches
     - You MUST NOT continue banging head against wall
   - **Validation**: Blockers documented with context

6. Complete or iterate
   - If all criteria met: Signal completion
   - If bolt limit reached: Save state for next iteration
   - You MUST commit all working changes
   - You MUST update Unit file status if criteria complete
   - **Validation**: State saved, ready for next hat or iteration

## Success Criteria

- [ ] Plan executed or meaningful progress made
- [ ] All changes pass backpressure checks
- [ ] Working increments committed
- [ ] Progress documented in scratchpad
- [ ] Blockers documented if encountered
- [ ] State saved for context recovery

## Error Handling

### Error: Tests Keep Failing

**Symptoms**: Same test fails repeatedly despite different approaches

**Resolution**:
1. You MUST stop and analyze the test itself
2. You SHOULD check if test expectations are correct
3. You MAY ask for human review of the test
4. You MUST NOT delete or skip failing tests

### Error: Type System Conflicts

**Symptoms**: Cannot satisfy type checker without unsafe casts

**Resolution**:
1. You MUST examine the type definitions
2. You SHOULD consider if types need updating (with justification)
3. You MUST NOT use `any` or type assertions without documenting why
4. You MAY flag for architectural review

### Error: Lint Rules Block Valid Code

**Symptoms**: Linter rejects code that is correct and intentional

**Resolution**:
1. You SHOULD first verify the code is truly correct
2. You MAY add targeted disable comments with explanation
3. You MUST NOT globally disable lint rules
4. You SHOULD document why rule was disabled

### Error: Cannot Make Progress

**Symptoms**: Multiple approaches tried, none working

**Resolution**:
1. You MUST document all approaches tried
2. You MUST save detailed blockers
3. You MUST recommend escalation to HITL
4. You MUST NOT continue without human guidance

## Related Hats

- **Planner**: Created the plan being executed
- **Reviewer**: Will review the implementation
- **Test Writer** (TDD workflow): Wrote tests Builder must satisfy
