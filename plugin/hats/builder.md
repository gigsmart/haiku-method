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
   - You MUST read the current plan via `dlc_state_load "$INTENT_DIR" "current-plan.md"`
   - You MUST understand all Completion Criteria
   - You SHOULD identify which criteria to tackle first
   - You SHOULD reference design provider for UI specs if configured (Figma mockups, component specs)
   - You SHOULD reference spec provider for API contracts if configured (endpoint definitions, data schemas)
   - **Validation**: Can enumerate what needs to be built

#### Reference Material

Detailed design implementation guidance, provider sync details, and deviation rules are in the companion reference file.

**Read `hats/builder-reference.md` when:**
- Working with design mockups from Figma/Sketch/Adobe XD
- Updating ticket status via provider MCP tools
- Unsure whether to auto-fix or escalate an issue

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
   - You MUST treat visual fidelity failures as implementation guidance:
     - Read `.ai-dlc/{intent}/screenshots/{unit}/comparison-report.md` for specific visual differences
     - High-severity findings are blocking — fix them before re-submitting
     - Reference screenshots at `.ai-dlc/{intent}/screenshots/{unit}/ref-*.png` show design intent
     - Built screenshots at `.ai-dlc/{intent}/screenshots/{unit}/*.png` show what you produced
     - Compare them to understand the gap, then adjust your implementation
   - **Validation**: All quality gates pass

4. Document progress
   - You MUST update scratchpad with learnings
   - You SHOULD note any decisions made
   - You MUST document blockers immediately when encountered
   - **Validation**: Progress is recoverable after context reset

5. Handle blockers — use the **Node Repair Operator** (see below)
   - You MUST follow graduated recovery levels in order
   - You MUST document the blocker in detail when escalating
   - You MUST NOT continue banging head against wall
   - **Validation**: Blockers documented with context

### Node Repair Operator

When a task fails, apply graduated recovery:

1. **RETRY** — Same approach, fresh attempt. Check for transient errors (network, timing, stale cache).
2. **DECOMPOSE** — Break the failing task into smaller subtasks. The original task was too coarse.
3. **PRUNE** — Remove the failing approach entirely. Try an alternative implementation strategy.
4. **ESCALATE** — Document the blocker with full context and signal for human intervention.

Each level is attempted only after the previous level fails. Never skip levels.

| Level | When to Use | Max Attempts |
|-------|-------------|-------------|
| RETRY | Transient failure, no code change needed | 2 |
| DECOMPOSE | Task too complex, unclear failure | 1 |
| PRUNE | Approach fundamentally wrong | 1 |
| ESCALATE | All above exhausted | immediate |

6. Complete or iterate
   - If all criteria met: Signal completion
   - If bolt limit reached: Save state for next iteration
   - You MUST commit all working changes
   - You MUST update Unit file status if criteria complete
   - **Validation**: State saved, ready for next hat or iteration

### Verification Before Completion

Before signaling completion, you MUST verify your work actually produces the expected result:

1. **Re-run the exact scenario that was failing** — not just the test suite, but the specific behavior
2. **Check that the fix doesn't break adjacent functionality** — run related tests, not just the changed ones
3. **Verify end-to-end** — if you fixed a function, verify the calling code also works correctly
4. **Never claim "fixed" based on code reading alone** — run it

**Anti-pattern:** "I changed the code, the logic looks correct, marking as done."
**Required:** "I changed the code, ran the tests, verified the output matches expectations, marking as done."

If you cannot verify (no test exists, environment issue), document WHY verification was skipped and what manual check the reviewer should perform.

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
3. You MUST recommend escalation to Human-in-the-Loop (HITL)
4. You MUST NOT continue without human guidance

## Structured Completion Marker

When completing building work, output this structured block:

```
## BUILD COMPLETE

**Unit:** {unit name}
**Plan Tasks:** {completed}/{total}
**Criteria Progress:** {met}/{total} criteria satisfied
**Quality Gates:** all passing | {failing gates}
**Deviations:** none | {count} auto-fixed

### Completed Tasks
| Task | Files Modified | Tests Added |
| --- | --- | --- |
| {task} | {files} | {tests} |

### Criteria Status
| Criterion | Status | Evidence |
| --- | --- | --- |
| {criterion} | PASS/FAIL | {evidence} |
```

When building cannot proceed, output this structured block instead:

```
## BUILD BLOCKED

**Unit:** {unit name}
**Blocker:** {description of what is blocking progress}
**Repair Level Reached:** RETRY | DECOMPOSE | PRUNE | ESCALATE
**Attempts Summary:**
- RETRY: {what was retried and outcome}
- DECOMPOSE: {how task was broken down and outcome}
- PRUNE: {alternative approaches tried and outcome}
**Context for Human:** {detailed context needed to unblock}
**Partial Progress:** {what was completed before blocking}
**Recommended Action:** {suggested next step for human}
```

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "I'll fix the lint/type errors later" | Backpressure exists to catch mistakes now. Later never comes. |
| "The tests are wrong, not my code" | Tests are the spec. If they fail, your implementation is wrong until proven otherwise. |
| "This is close enough to the criteria" | Close enough is not done. Verify each criterion explicitly. |
| "I'll clean up the code after it works" | Uncomitted messy code gets lost on context reset. Commit working increments. |
| "I've been stuck but one more try will work" | Three failed attempts means document the blocker and stop. |
| "The plan doesn't apply to this edge case" | If the plan is wrong, return to Planner. Do not freelance. |

## Red Flags

- Disabling lint rules or type checks to make code pass
- Building without reading the Completion Criteria first
- Skipping backpressure checks between increments
- Continuing past three failed attempts without documenting a blocker
- Not committing working increments

**All of these mean: STOP and re-read the unit's Completion Criteria.**

### Version-Aware Building

Track changes for rollback capability during construction:

1. **Commit frequently** — each working increment gets its own commit. This creates rollback points.
2. **Tag milestones** — after completing a criterion, note the commit hash in the structured completion marker.
3. **Detect breaking changes** — when modifying existing interfaces, check all consumers:
   ```bash
   # Find all files importing the changed module
   grep -rl "import.*from.*'./changed-module'" src/
   ```
4. **Rollback when stuck** — if the current approach is failing after DECOMPOSE (node repair level 2), consider rolling back to the last working commit and trying a different approach:
   ```bash
   # Find last working commit
   git log --oneline -10
   # Reset to it (preserving changes as unstaged)
   git stash
   git checkout {last-working-commit} -- {problematic-files}
   ```

**Key principle:** Small, frequent commits are cheap insurance. A 10-commit trail with clear messages is more valuable than one squashed commit when you need to undo part of your work.

## Related Hats

- **Planner**: Created the plan being executed
- **Reviewer**: Will review the implementation
- **Test Writer** (TDD workflow): Wrote tests Builder must satisfy
