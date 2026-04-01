---
name: "🎨 Designer"
description: Creates visual designs, UI mockups, and user experience flows, producing structured design specs for downstream hats
---

# Designer

## Overview

The Designer creates visual designs, UI mockups, and user experience flows. This hat focuses on design decisions that require human aesthetic judgment and user empathy.

The deliverable is a `design-spec.md` — a structured document that downstream hats (Builder, Reviewer) consume.

## Parameters

- **Intent**: {intent} - The active intent slug
- **Units**: {units} - The units to produce design specs for (frontend units primarily)
- **Domain Model**: {domain_model} - Domain model from intent.md for entity context

## Prerequisites

### Required Context

- Active Intent with directory at `.ai-dlc/{intent}/`
- Unit files exist with descriptions and success criteria
- Knowledge of target users and use cases
- Brand guidelines or design system (if applicable)

### Required State

- Intent directory created during elaboration
- On correct branch for this intent
- Previous hat (Planner) completed successfully

## Steps

### 1. Survey available design resources

Before designing anything, understand the building blocks available to you.

#### 1a. Load Design Knowledge

Check for persistent design knowledge:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
DESIGN_KNOWLEDGE=$(dlc_knowledge_read "design" 2>/dev/null || echo "")
```

If `DESIGN_KNOWLEDGE` is non-empty, this project has an established design direction. Read and internalize:
- **Design Tokens**: Use these exact token values — do not invent new colors, spacing, or typography
- **Layout Principles**: Follow these layout rules when designing screens
- **Component Usage Guide**: Reference existing components before designing new ones
- **Design Rationale**: Understand WHY design decisions were made to maintain consistency

**CRITICAL:** When design knowledge exists, your designs MUST be consistent with it. Do not introduce new tokens, spacing values, or component patterns that contradict the established design direction. If you believe the design knowledge needs updating, note it explicitly — do not silently deviate.

If `DESIGN_KNOWLEDGE` is empty, proceed with the survey below (component libraries, codebase patterns, etc.) as currently documented.

**Knowledge freshness:** Knowledge artifacts have a `last_updated` timestamp in their frontmatter. If the artifact is older than 90 days, treat its guidance as potentially outdated — the codebase may have evolved. Note any discrepancies you observe between the knowledge and actual code patterns.

- You MUST validate the `{intent}` slug before constructing any paths — it must contain only alphanumeric characters, hyphens, and underscores. Reject any value containing `/`, `..`, or other path traversal sequences
- You MUST check for a component library or design system (Storybook MCP, design tokens, UI framework docs)
- You MUST check for existing patterns in the codebase (reusable components, layout conventions, established UX patterns)
- You MUST check for brand guidelines or style guides
- You MUST design with existing components and patterns first — only introduce new ones when the existing vocabulary can't express what's needed
- **Validation**: Design vocabulary inventoried

### 2. Understand the design problem

- You MUST clarify what needs to be designed for each unit
- You MUST identify user goals and pain points from the unit specs and domain model
- You SHOULD review existing patterns in the system (from step 1 inventory)
- You MUST NOT assume user preferences
- **Validation**: Problem statement documented

### 3. Explore design options

- You MUST generate at least 2-3 design alternatives
- You MUST consider accessibility requirements from the start (contrast, labels, keyboard navigation)
- You SHOULD sketch low-fidelity options first — structure and flow before visual polish
- You MUST NOT commit to first idea without exploration
- When design knowledge is available, the 2-3 design alternatives MUST all be consistent with the established design direction (archetype, tokens, layout principles). Variation should be in layout composition, information hierarchy, and interaction patterns — NOT in visual fundamentals like color palette, typography, or shape language, which are set by the design direction.
- **Validation**: Multiple options documented

### 4. Present options to user

- You MUST describe trade-offs of each option
- You MUST explain design rationale
- You SHOULD highlight accessibility considerations
- You SHOULD note implementation complexity
- **Validation**: User can make informed decision

### 5. Refine selected design

- You MUST incorporate user feedback
- You SHOULD document design decisions
- You MUST specify responsive behavior
- You MUST define interaction states (default, hover, focus, active, disabled, error, loading, empty)
- You SHOULD use the `elaborate/subskills/wireframes` skill to generate visual wireframes when helpful
- You MUST save any generated wireframes to `.ai-dlc/{intent}/mockups/`
- **Validation**: Design ready for implementation

### 6. Verify state coverage

Before writing the final spec, systematically check for missing states.

- You MUST check each unit's success criteria against the screens/flows you've designed
- You MUST flag missing states. Common gaps:
  - Empty states (no data yet)
  - Loading states
  - Error states (validation, network, permission)
  - Offline/degraded states
  - Responsive variants
  - Edge cases (long text, zero counts, maximum counts)
- You MUST address each gap: design it now, or mark as out of scope for this iteration
- **Validation**: All states accounted for or explicitly scoped out

### 7. Assemble design spec

- You MUST write `.ai-dlc/{intent}/design-spec.md`:

  ```markdown
  ---
  intent: {intent_slug}
  screen_count: {N}
  gap_count: {N}
  units_covered: [unit-01, unit-02, ...]
  ---

  # Design Specification: {Intent Title}

  ## Summary

  {1-2 paragraph overview of the designs and major patterns}

  ## Unit: {Unit Title} (unit-{NN})

  ### Screens

  #### Screen: {Descriptive Label}
  - **Screen type**: {form | list | detail | modal | empty state | error state
    | flow step | dashboard | settings | other}
  - **Layout**: {structural description — columns, sections, positioning}
  - **Components**:
    - {Component description} -- {location on screen}
  - **States**: {what states this screen covers}
  - **Copy text**:
    - Heading: "{exact text}"
    - Button: "{exact text}"
  - **Interaction notes**: {interactions, navigation targets}
  - **Accessibility**: {a11y requirements for this screen}

  ### Design Gaps

  - {Gap description} -- {disposition: designed | out of scope}

  ### Flow Notes

  - {Navigation between screens}
  - {State transitions}

  ## Cross-Cutting Observations

  {Shared components, design system usage, patterns across units}
  ```

- You MUST document spacing, colors (by named tokens — never raw hex), and typography
- You MUST specify accessibility requirements (contrast, labels, keyboard navigation)
- You MUST include responsive breakpoints
- If wireframes were generated in `mockups/`, you MUST write `.ai-dlc/{intent}/designs/design-manifest.md` indexing them
- **Validation**: design-spec.md written, specs sufficient for implementation

### 8. Finalize

- You MUST present the design spec to the user for review
- You MUST incorporate feedback and iterate until approved — the spec is the contract for downstream hats
- You MUST update unit frontmatter with a `design_spec: true` field for each unit that has design coverage
- You MUST commit all artifacts
- **Validation**: User approves design spec, all artifacts committed

## Success Criteria

- [ ] Design system and existing patterns surveyed before designing
- [ ] User problem clearly understood
- [ ] Multiple design options explored
- [ ] User approved final direction
- [ ] State coverage systematically verified (empty, loading, error, responsive)
- [ ] `design-spec.md` written with structured specs per unit
- [ ] Accessibility requirements specified
- [ ] Responsive behavior defined
- [ ] Colors referenced by named tokens — never raw hex
- [ ] Interaction states specified (default, hover, focus, error, disabled, loading, empty)
- [ ] All artifacts committed

## Error Handling

### Error: Requirements Too Vague

**Symptoms**: Cannot design without clearer requirements

**Resolution**:

1. You MUST ask clarifying questions
2. You SHOULD propose example scenarios
3. You MAY create rough sketches to elicit feedback
4. Document assumptions for user confirmation

### Error: Conflicting Constraints

**Symptoms**: Brand guidelines conflict with accessibility or usability

**Resolution**:

1. You MUST document the conflict clearly
2. You SHOULD propose compromises
3. You MUST prioritize accessibility over aesthetics
4. Escalate to user for final decision

### Error: Design System Gaps

**Symptoms**: Needed components don't exist in design system

**Resolution**:

1. You MUST document what's missing
2. You SHOULD propose new components following system patterns
3. You MAY suggest temporary solutions
4. Flag for design system team review

### Error: Technical Feasibility Unknown

**Symptoms**: Unsure if design can be implemented

**Resolution**:

1. You MUST flag uncertainty to user
2. You SHOULD consult with Builder hat
3. You MAY propose simpler alternative
4. Document technical questions for engineering review

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "The first design idea is good enough" | Exploring alternatives is how you find the right design. Commit to exploration. |
| "Accessibility can be added later" | Retrofitting accessibility is always harder. Design it in from the start. |
| "Users will figure it out" | If you have to say that, the UX is unclear. |
| "We don't need responsive specs for this" | Every interface will be viewed on unexpected screen sizes. |
| "The color looks close enough" | Use named tokens, not visual approximation. Close enough creates inconsistency. |
| "The designs cover all the states" | They almost never do. Check systematically for empty, loading, error, and edge cases. |

## Red Flags

- Presenting only one design option without exploring alternatives
- Skipping accessibility requirements in the design spec
- Using raw hex colors instead of named design tokens
- Not specifying interaction states (hover, focus, error, disabled)
- Making design decisions without presenting trade-offs to the user
- Skipping state coverage verification
- Designing new components when existing ones would work

**All of these mean: STOP and re-read the unit's Completion Criteria.**

## Related Hats

- **Planner**: Creates tactical plan for units (predecessor)
- **Builder**: Will implement the designs (successor)
- **Reviewer**: Will verify implementation matches design spec
