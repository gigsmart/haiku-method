---
skip: []
add: []
wireframe_fidelity: high
criteria_focus: design
---

# Design Stage — Elaboration

## Phase Instructions (RFC 2119)

The key words "MUST", "MUST NOT", "SHALL", "SHALL NOT", "REQUIRED" in this section are to be interpreted as described in RFC 2119.

During elaboration, the agent **MUST** establish a design direction with the user before drafting any final wireframes. The flow is **intake-first** — the user may already have finished designs, in which case archetype generation is skipped entirely:

1. The agent **MUST** call `pick_design_direction` **with no `archetypes` field** (or an empty array) to open the picker in intake mode. The picker asks the user whether they have designs to upload OR want the agent to generate variants.
2. The agent **MUST** call `haiku_await_design_direction` to wait for the response.
3. The user's response branches:
   - **Upload** — the user provided finished designs. The next `haiku_run_next` tick surfaces the file paths via a `design_direction_uploaded` action. The agent **MUST** `Read` each uploaded file and treat the uploads as the source of truth for the visual direction. The agent **MUST NOT** generate archetypes in this case.
   - **Generate** — the user wants the agent to produce variants. The agent **MUST** generate 2-3 distinct design approaches as HTML wireframe snippets (different layouts, interaction patterns, or visual hierarchies) and call `pick_design_direction` again with the variants as `archetypes` — each with a `name`, `description`, and `preview_html` (the rendered wireframe).
4. After variants are presented, the user either picks one as the final direction (optionally annotating it via the pencil tool — strokes are screen-captured and returned to the agent as image content blocks) **or** asks the agent to regenerate — keeping a subset of the current archetypes and steering the next batch via comments. On a regenerate response, the agent **MUST** produce replacements for the unkept slots and call `pick_design_direction` again with the merged set.
5. The agent **MUST** use the final direction (uploaded files or selected archetype) to create the wireframes saved to `stages/design/artifacts/`
6. The agent **MUST NOT** produce ASCII art wireframes — all wireframes **MUST** be HTML or design provider files
7. If a design provider MCP is available (Pencil, OpenPencil, Figma), the agent **SHOULD** use it instead of raw HTML when generation is needed

## Criteria Guidance

Design criteria are verified by **visual approval** — a reviewer inspects the deliverable against the criterion, not by command-exit-code. The condition can be a structural check (counting screen variants, asserting tokens-only colors via grep) or a reviewer-applied condition stated precisely enough that two reviewers would reach the same verdict.

### Good criteria — concrete and verifiable

When generating criteria for this stage, focus on verifiable design deliverables:

- Screen layouts defined for all breakpoints (mobile 375px / tablet 768px / desktop 1280px)
- All interactive states specified (default, hover, focus, active, disabled, error)
- Color usage references only design system tokens — no raw hex values (verifiable by grep for `#[0-9a-fA-F]{3,6}` outside token files)
- Touch targets meet 44px minimum on mobile breakpoints
- Empty states, loading states, and error states designed
- Contrast ratios meet WCAG AA (4.5:1 body text, 3:1 large text) — verifiable by automated contrast checker
- Focus order documented for keyboard navigation
- Component hierarchy documented (which design system components to use/extend)
- Interaction specs complete for all user actions (tap, swipe, scroll, transition)

### Bad criteria — vague (no clear condition)

- "Design looks good" — what does good mean?
- "It's responsive" — at which breakpoints? With what behavior?
- "Accessible" — to which standard? WCAG A, AA, AAA?

### Bad criteria — design-specific unverifiable

(In addition to the universal unverifiable shapes called out in the workflow engine contracts.)

- "Design is intuitive" — needs a usability test pass against a stated success-rate threshold
- "Visual hierarchy is clear" — needs a structural rule (e.g. heading scale, contrast progression) the reviewer can apply consistently
- "Brand feels right" — needs a brand-guideline document to compare against, not a subjective vibe check
