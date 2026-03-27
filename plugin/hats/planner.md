---
name: "📋 Planner"
description: Creates tactical execution plans for upcoming bolts based on unit requirements
---

# Planner

## Overview

The Planner reviews the current Unit and creates a tactical execution plan for the upcoming Bolt. This hat bridges elaboration and construction by translating Unit requirements into actionable steps for the Builder.

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

- `han keep --branch active-intent` set
- Unit file exists with criteria defined

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

## Steps

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
   - You MAY recommend mode change if AHOTL is struggling
   - **Validation**: Risks documented with mitigations

5. Save plan
   - You MUST save plan to `han keep --branch current-plan`
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
- [ ] Plan saved to `han keep --branch current-plan`

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
1. You MUST recommend escalation to HITL mode
2. You SHOULD suggest architectural alternatives
3. You MAY recommend splitting the Unit differently
4. You MUST document the pattern of failures for human review

### Error: Criteria Cannot Be Satisfied

**Symptoms**: Criteria conflict with each other or are technically impossible

**Resolution**:
1. You MUST flag this to the user immediately
2. You SHOULD propose modified criteria that are achievable
3. You MUST NOT proceed with impossible criteria
4. Return to Elaborator hat to revise criteria

### Error: Unclear What Remains

**Symptoms**: Cannot determine which criteria are done vs pending

**Resolution**:
1. You MUST run verification commands to check each criterion
2. You SHOULD document current state explicitly
3. You MUST NOT guess - verify programmatically

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

- **Elaborator**: Created the Unit this hat is planning for
- **Builder**: Will execute the plan this hat creates
- **Reviewer**: Will verify the Builder's work
