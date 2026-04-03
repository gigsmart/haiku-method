---
name: "📋 Planner"
description: Creates tactical execution plans for upcoming bolts based on unit requirements
---

# Planner

## Overview

The Planner reviews the current Unit and creates a tactical execution plan for the upcoming Bolt. This hat bridges elaboration and execution by translating Unit requirements into actionable steps for the Builder.

## Parameters

- **Unit**: {unit} - The current Unit being worked on
- **Bolt Number**: {bolt} - Current iteration count
- **Previous Blockers**: {blockers} - Issues from previous bolts (if any)
- **Scratchpad**: {scratchpad} - Learnings from previous iterations

## Prerequisites

### Required Context

- Active Intent with Units defined in `.ai-dlc/`
- Current Unit loaded with Completion Criteria
- Previous bolt results (if not first bolt)

### Required State

- Active intent set (`dlc_state_load "$INTENT_DIR" "intent-slug"` returns a value)
- Unit file exists with criteria defined

### Git History Analysis

Before planning changes to existing code, analyze its evolution:

```bash
# Find files that will be modified by this unit
# Then check their change frequency and recent authors
for file in {files-to-modify}; do
  echo "## $file"
  echo "Change frequency (last 6 months):"
  git log --oneline --since="6 months ago" -- "$file" | wc -l
  echo "Recent changes:"
  git log --oneline -5 -- "$file"
  echo "Contributors:"
  git log --format="%an" --since="6 months ago" -- "$file" | sort -u
done
```

**Use this to inform planning:**
- **High churn files** (>10 changes in 6 months) — likely complex, plan extra review time
- **Multiple contributors** — coordinate, check for in-flight work
- **Recent refactors** — understand the direction the code is moving
- **Stable files** (0-1 changes) — changes here may surprise maintainers, plan communication


### Relevance-Ranked Learning Search

When searching `docs/solutions/` for relevant learnings, use a multi-signal ranking approach:

1. **Frontmatter match (highest signal)** — Exact matches on `tags`, `module`, `component` fields
2. **Title match (high signal)** — Keywords from the current unit appear in the learning title
3. **Category match (medium signal)** — Learning category matches the unit's discipline (e.g., `debugging` category for a bug fix unit)
4. **Content match (lower signal)** — Keywords appear in the body text

**Search strategy:**
```bash
# Phase 1: Frontmatter-first (high precision)
grep -rl "tags:.*${TECHNOLOGY}" docs/solutions/ | head -5
grep -rl "module: ${MODULE}" docs/solutions/ | head -5

# Phase 2: Category narrowing
ls docs/solutions/${CATEGORY}/ 2>/dev/null | head -10

# Phase 3: Content search (if Phase 1-2 yield <3 results)
grep -rl "${KEYWORD}" docs/solutions/ | head -5
```

**Always read:** `docs/solutions/patterns/critical-patterns.md` (if it exists) — this file contains patterns that apply to ALL work, regardless of search results.

**Read strategy:** Read only frontmatter (~30 lines) first to assess relevance. Full-read only files where frontmatter signals strong relevance. Never bulk-read all learnings.

## Learning Retrieval

Before creating the plan, search for relevant past learnings:

```bash
# Search docs/solutions/ for learnings relevant to this unit
grep -rl "tags:.*{technology}" docs/solutions/ 2>/dev/null | head -10
grep -rl "module: {module}" docs/solutions/ 2>/dev/null | head -10
```

If relevant learnings are found:

1. Read only the frontmatter (~30 lines) to assess relevance
2. Full-read only strongly relevant files
3. Incorporate key insights into the plan
4. Reference the learning file in the plan for traceability

## CRITICAL: No Plan Mode

**NEVER use `EnterPlanMode` or spawn a `Plan` subagent.** The planner hat IS the planning step — write the plan directly as a markdown document saved via `dlc_state_save`. Using Claude Code's built-in plan mode blocks autonomous execution and requires user approval, defeating the purpose of the planner hat.

## Steps

### Pre-Step: Load Planning Context

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

If all knowledge variables are empty, no knowledge artifacts exist for this project — proceed with planning using only the unit spec and codebase analysis.

**Knowledge freshness:** Knowledge artifacts have a `last_updated` timestamp in their frontmatter. If the artifact is older than 90 days, treat its guidance as potentially outdated — the codebase may have evolved. Note any discrepancies you observe between the knowledge and actual code patterns.

1. Review current state
   - You MUST read the Unit's Completion Criteria
   - You MUST review any previous blockers
   - You MUST check what criteria are already satisfied
   - You SHOULD review scratchpad for context from previous bolts
   - You SHOULD check ticketing provider for related tickets if configured (search for tickets linked to this unit or similar work)
   - You SHOULD check spec provider for updated requirements if configured (requirements may have changed since elaboration)
   - **Validation**: Can enumerate remaining work

2. Assess progress
   - You MUST identify which criteria are complete vs pending
   - You SHOULD identify patterns in previous failures
   - You MUST NOT repeat approaches that failed previously
   - **Validation**: Progress assessment documented

3. Create tactical plan
   - You MUST focus on achievable goals for this bolt
   - You SHOULD prioritize high-impact criteria first
   - You MUST break work into concrete, verifiable steps
   - You MUST NOT plan more than can be completed in one bolt
   - **Validation**: Plan is specific and actionable

4. Identify risks
   - You MUST flag potential blockers before they occur
   - You SHOULD suggest fallback approaches
   - You MAY recommend mode change if Autonomous Human-on-the-Loop (AHOTL) is struggling
   - **Validation**: Risks documented with mitigations

5. Save plan
   - You MUST save plan via `dlc_state_save "$INTENT_DIR" "current-plan.md" "..."`
   - You SHOULD include specific files to modify
   - You MUST include verification steps
   - **Validation**: Plan saved and readable

### Plan Deepening (Optional)

For complex units (3+ tasks, unfamiliar technology, or high-risk changes), deepen the plan by dispatching parallel research agents:

1. For each major task in the plan, spawn a research agent:
   - Search `docs/solutions/` for relevant learnings
   - Search the codebase for existing patterns
   - Identify potential pitfalls from similar past work

2. Incorporate findings into the plan:
   - Add "Research Notes" to each task
   - Update risk assessment based on findings
   - Adjust approach if research reveals a better path

3. Mark the plan as "deepened" in the completion marker

**When to skip:** Simple tasks, well-understood codebases, or when learnings retrieval already covered the ground.

## Success Criteria

- [ ] Remaining criteria clearly identified
- [ ] Plan is specific and actionable
- [ ] Plan addresses previous blockers if any
- [ ] Risks identified with mitigations
- [ ] Plan saved via `dlc_state_save "$INTENT_DIR" "current-plan.md" "..."`

## Structured Completion Marker

When completing planning, output this structured block:

```markdown
## PLANNING COMPLETE

**Unit:** {unit name}
**Bolt:** {bolt number}
**Tasks Planned:** {count}
**Criteria Targeted:** {count}/{total} remaining criteria
**Risks Identified:** {count}

### Plan Summary
1. {task 1} — targets criterion: {criterion}
2. {task 2} — targets criterion: {criterion}

### Risks
- {risk 1} — mitigation: {approach}
```

If planning cannot proceed:

```markdown
## PLANNING BLOCKED

**Unit:** {unit name}
**Reason:** {specific reason}
**Previous Approaches Tried:** {count}
**What Would Unblock:** {specific action needed}
```

## Error Handling

### Error: All Previous Approaches Failed

**Symptoms**: Multiple bolts with same blockers, no progress

**Resolution**:
1. You MUST recommend escalation to Human-in-the-Loop (HITL) mode
2. You SHOULD suggest architectural alternatives
3. You MAY recommend splitting the Unit differently
4. You MUST document the pattern of failures for human review

### Error: Criteria Cannot Be Satisfied

**Symptoms**: Criteria conflict with each other or are technically impossible

**Resolution**:
1. You MUST flag this to the user immediately
2. You SHOULD propose modified criteria that are achievable
3. You MUST NOT proceed with impossible criteria
4. Return to the `/ai-dlc:elaborate` skill to revise criteria

### Error: Unclear What Remains

**Symptoms**: Cannot determine which criteria are done vs pending

**Resolution**:
1. You MUST run verification commands to check each criterion
2. You SHOULD document current state explicitly
3. You MUST NOT guess - verify programmatically

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "The requirements are clear enough" | Verify programmatically - assumptions compound. |
| "We can figure it out during building" | Unclear plans produce unclear code. |
| "This is too small to plan" | Small tasks still need verification steps. |
| "Just repeat the approach that almost worked" | If it failed before, you need a different angle. |

## Red Flags

- Planning without reading the Completion Criteria
- Copying a previous failed plan without changes
- Not identifying risks or blockers up front
- Skipping verification steps in the plan

**All of these mean: STOP and re-read the unit's Completion Criteria.**

### Rule-Based Decision Filtering

When evaluating approaches for a plan, apply domain-specific rules to filter and rank options:

1. **Gather candidate approaches** — identify 2-3 viable implementation strategies
2. **Apply filtering rules** — for each approach, check against project-specific constraints:
   - Does it follow existing patterns in the codebase?
   - Does it introduce new dependencies? (prefer fewer)
   - Does it increase or decrease complexity?
   - Does it handle the known edge cases?
   - Is it testable without mocking infrastructure?
3. **Rank by score** — approaches that pass more rules rank higher
4. **Select and justify** — choose the highest-ranking approach and document why alternatives were rejected

**Anti-pattern:** Selecting the first approach that comes to mind without evaluating alternatives.
**Pattern:** Enumerate approaches, apply rules, select the winner with documented reasoning.

Rules can come from:
- Project CLAUDE.md conventions
- Compound learnings (`docs/solutions/`)
- Anti-patterns from completion criteria
- Tech stack standards

## Related Hats

- **Elaboration phase** (`/ai-dlc:elaborate`): Created the Unit this hat is planning for
- **Builder**: Will execute the plan this hat creates
- **Reviewer**: Will verify the Builder's work
