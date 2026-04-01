---
status: in_progress
last_updated: "2026-04-01T13:05:57Z"
depends_on: [unit-01-knowledge-infrastructure]
branch: ai-dlc/design-direction-system/06-hat-integration
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: planner
---

# unit-06-hat-integration

## Description
Update the designer, builder, planner, and reviewer hats to load and use knowledge artifacts from `.ai-dlc/knowledge/` when available. Each hat reads the knowledge relevant to its role and incorporates it as project context — design tokens for the designer, architecture conventions for the builder, domain vocabulary for the planner, etc.

## Discipline
backend - This unit will be executed by backend-focused agents.

## Domain Entities
- **Designer Hat** (`plugin/hats/designer.md`): Reads `knowledge/design.md`
- **Builder Hat** (`plugin/hats/builder.md`): Reads `knowledge/architecture.md`, `knowledge/conventions.md`, `knowledge/domain.md`
- **Planner Hat** (`plugin/hats/planner.md`): Reads `knowledge/product.md`, `knowledge/domain.md`, `knowledge/architecture.md`
- **Reviewer Hat** (`plugin/hats/reviewer.md`): Reads `knowledge/conventions.md`, `knowledge/architecture.md`

## Data Sources
- **`plugin/hats/*.md`**: Existing hat definitions to modify
- **`plugin/lib/knowledge.sh`** (unit-01): `dlc_knowledge_load_for_hat()` function

## Technical Specification

### 1. Designer Hat Update (`plugin/hats/designer.md`)

**Location:** Step 1 (Survey Design Resources)

Add a new sub-step at the beginning of Step 1, before checking for component libraries:

```markdown
**Step 1a: Load Design Knowledge**

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

If `DESIGN_KNOWLEDGE` is empty, proceed with the existing Step 1 survey (component libraries, codebase patterns, etc.) as currently documented.
```

**Location:** Step 3 (Explore Design Options)

Add a constraint when design knowledge exists:

```markdown
When design knowledge is available, the 2-3 design alternatives MUST all be consistent with the established design direction (archetype, tokens, layout principles). Variation should be in layout composition, information hierarchy, and interaction patterns — NOT in visual fundamentals like color palette, typography, or shape language, which are set by the design direction.
```

### 2. Builder Hat Update (`plugin/hats/builder.md`)

**Location:** Near the beginning of the hat, before the build steps.

Add a knowledge loading step:

```markdown
**Pre-Step: Load Project Knowledge**

Before starting implementation, load available project knowledge:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
ARCHITECTURE=$(dlc_knowledge_read "architecture" 2>/dev/null || echo "")
CONVENTIONS=$(dlc_knowledge_read "conventions" 2>/dev/null || echo "")
DOMAIN=$(dlc_knowledge_read "domain" 2>/dev/null || echo "")
```

When knowledge artifacts are available, follow them:
- **Architecture**: Follow the documented module boundaries, data flow patterns, and infrastructure conventions. Do not introduce new architectural patterns that contradict the established ones.
- **Conventions**: Follow code style, naming patterns, testing philosophy, and error handling patterns as documented. Match existing patterns, not your own preferences.
- **Domain**: Use the documented glossary terms in variable names, function names, and comments. Follow entity relationships and lifecycle as documented.

Knowledge artifacts have a `confidence` field in their frontmatter. For `confidence: high` artifacts, treat them as authoritative. For `confidence: medium` or `confidence: low`, treat them as guidance that can be adjusted if the codebase contradicts them.
```

### 3. Planner Hat Update (`plugin/hats/planner.md`)

**Location:** Early in the planning phase, before creating the execution plan.

Add a knowledge loading step:

```markdown
**Pre-Step: Load Planning Context**

Load available project knowledge for planning context:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
PRODUCT=$(dlc_knowledge_read "product" 2>/dev/null || echo "")
DOMAIN=$(dlc_knowledge_read "domain" 2>/dev/null || echo "")
ARCHITECTURE=$(dlc_knowledge_read "architecture" 2>/dev/null || echo "")
```

When knowledge artifacts are available, use them to inform planning:
- **Product**: Reference user personas and product principles when prioritizing work within the unit. If the product values "simplicity over power", don't plan complex power-user features.
- **Domain**: Use domain vocabulary in the plan. Reference entity names, relationships, and lifecycle from the documented model.
- **Architecture**: Plan implementation steps that follow the documented module boundaries and data flow patterns. Don't plan work that crosses architectural boundaries differently than documented.
```

### 4. Reviewer Hat Update (`plugin/hats/reviewer.md`)

**Location:** In the code review checklist, as an additional check.

Add a knowledge-based review step:

```markdown
**Knowledge Compliance Check**

If knowledge artifacts are available, verify the implementation follows them:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
CONVENTIONS=$(dlc_knowledge_read "conventions" 2>/dev/null || echo "")
ARCHITECTURE=$(dlc_knowledge_read "architecture" 2>/dev/null || echo "")
```

When checking:
- **Conventions**: Verify naming patterns, error handling, and testing approach match documented conventions
- **Architecture**: Verify new code respects module boundaries, data flow patterns, and infrastructure conventions

Flag as review comments (not blockers) if the implementation reasonably deviates from knowledge artifacts — knowledge is guidance, not law. Only block if the deviation is clearly accidental (e.g., using camelCase when the project uses snake_case and conventions.md documents this).
```

### 5. Knowledge Freshness Awareness

All hat updates should include awareness that knowledge artifacts may be stale:

```markdown
**Knowledge freshness:** Knowledge artifacts have a `last_updated` timestamp in their frontmatter. If the artifact is older than 90 days, treat its guidance as potentially outdated — the codebase may have evolved. Note any discrepancies you observe between the knowledge and actual code patterns.
```

This is a note to add to each hat's knowledge loading section — not a separate mechanism.

## Success Criteria
- [ ] Designer hat loads `knowledge/design.md` in Step 1 before surveying design resources
- [ ] Designer hat constrains design alternatives to be consistent with established design direction when knowledge exists
- [ ] Builder hat loads `architecture.md`, `conventions.md`, and `domain.md` before implementation
- [ ] Builder hat follows documented conventions and architecture patterns
- [ ] Builder hat respects confidence levels (high = authoritative, medium/low = guidance)
- [ ] Planner hat loads `product.md`, `domain.md`, and `architecture.md` for planning context
- [ ] Planner hat uses domain vocabulary in execution plans
- [ ] Reviewer hat checks implementation against documented conventions and architecture
- [ ] Reviewer hat treats knowledge compliance as review comments, not hard blockers
- [ ] All hats handle missing knowledge gracefully (empty string = skip, not error)
- [ ] Knowledge freshness awareness is documented in each hat
- [ ] All existing hat behavior is preserved when no knowledge artifacts exist (backwards compatible)

## Risks
- **Over-constraining agents**: If knowledge artifacts are too prescriptive, agents may produce rigid, unimaginative code that follows the letter but not the spirit. Mitigation: Frame knowledge as guidance with confidence levels, not immutable rules. Only the designer hat has hard constraints on visual fundamentals.
- **Knowledge conflicts with codebase**: If the codebase has evolved but knowledge hasn't been updated, agents may follow stale guidance. Mitigation: Include freshness awareness and instruct agents to note discrepancies rather than blindly follow outdated knowledge.

## Boundaries
This unit does NOT handle:
- Knowledge directory API (unit-01)
- Knowledge synthesis (unit-02)
- Design direction picker (unit-03)
- Archetype definitions (unit-04)
- Elaboration flow integration (unit-05)

This unit ONLY updates hat files to load and reference knowledge artifacts during their respective phases.

## Notes
- Keep hat changes surgical — add knowledge loading and reference, don't refactor surrounding hat logic
- The `dlc_knowledge_load_for_hat()` convenience function from unit-01 can be used instead of individual `dlc_knowledge_read()` calls if preferred
- All changes must be backwards-compatible — hats must work identically when no knowledge artifacts exist
- The confidence field is important — it prevents agents from treating low-confidence synthesized knowledge the same as user-verified knowledge
