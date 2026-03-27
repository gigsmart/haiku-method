---
description: (Internal) Cross-cutting intent-level validation after all units are merged
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# Integrate: Cross-Unit Validation

Intent-level integration validation that runs after all units have been completed and merged. This skill verifies that all units work together as a cohesive whole and that intent-level success criteria are satisfied.

Unlike the Reviewer hat (which validates individual units), this skill validates the combined result on the merged intent branch.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. Return a clear ACCEPT or REJECT decision.

---

## Input

This skill is invoked by `/advance` or `/execute` when all units are complete. It receives its context via the subagent prompt, including:

- **Intent slug** - The intent being validated
- **Worktree path** - Path to the intent worktree (contains all merged unit work)
- **Intent branch** - The branch name (`ai-dlc/{intent-slug}/main`)
- **Intent-level success criteria** - From `intent.md`
- **Completed units list** - All units that were built and merged

---

## Step 1: Verify Merged State Integrity

- You MUST confirm you are on the intent branch (`ai-dlc/{intent-slug}/main`)
- You MUST verify all unit branches have been merged
- You MUST check for merge conflicts or incomplete merges
- You MUST run `git log --oneline` to confirm all unit merge commits are present
- **Validation**: Clean merged state with all units present

## Step 2: Run Full Backpressure Suite

- You MUST run the full test suite on the merged codebase
- You MUST run lint checks across all changed files
- You MUST run type checks if applicable
- You MUST verify no regressions from unit interactions
- **Validation**: All tests pass, no lint errors, no type errors

## Step 3: Verify Intent-Level Success Criteria

- You MUST read intent-level success criteria from `intent.md`
- You MUST check each intent-level criterion individually
- You MUST run verification commands, not just read code
- You MUST distinguish between unit-level criteria (already verified) and intent-level criteria (your responsibility)
- **Validation**: Each intent-level criterion marked pass/fail with evidence

## Step 4: Verify Cross-Unit Integration

- You MUST check that units interact correctly at their boundaries
- You MUST verify shared state, APIs, or data flows between units work end-to-end
- You MUST check for conflicting patterns, duplicate code, or inconsistent conventions across units
- You SHOULD run integration tests if they exist
- You SHOULD verify that cross-cutting concerns (documented as intent-level criteria) are consistently applied
- **Validation**: Units work together, no integration gaps

## Step 5: Check for Emergent Issues

- You MUST look for problems that only appear when units are combined
- You SHOULD check for performance regressions from combined changes
- You SHOULD verify that the overall user experience flows correctly across unit boundaries
- You MUST identify any missing glue code or wiring between units
- **Validation**: No emergent issues from unit combination

## Step 6: Make Decision

- If all intent-level criteria pass, integration checks pass, and no emergent issues: **ACCEPT**
- If issues found: **REJECT** with specific units that need rework and clear reasons
- You MUST document decision clearly
- You MUST NOT accept if intent-level criteria are not met
- You MUST specify which units need rework when rejecting (not just "fix it")
- **Validation**: Clear ACCEPT/REJECT with rationale

---

## Output Format

### On ACCEPT

```
INTEGRATOR DECISION: ACCEPT

All intent-level criteria verified:
- [x] {criterion 1} -- {evidence}
- [x] {criterion 2} -- {evidence}

Cross-unit integration: PASS
Backpressure suite: PASS
```

### On REJECT

```
INTEGRATOR DECISION: REJECT

Failed criteria:
- [ ] {criterion} -- {what failed and why}

Units requiring rework:
- {unit-NN-slug}: {specific issue to fix}
- {unit-MM-slug}: {specific issue to fix}

Integration issues:
- {description of cross-unit problem}
```

---

## Error Handling

### Error: Merge Conflicts on Intent Branch

**Symptoms**: Units merged but conflicts remain unresolved

**Resolution**:
1. You MUST NOT attempt to resolve merge conflicts
2. You MUST REJECT and identify the conflicting units
3. Specify which units need to be re-built with awareness of each other's changes

### Error: Tests Pass Individually But Fail Combined

**Symptoms**: Unit tests passed during review but fail on merged branch

**Resolution**:
1. You MUST identify which units' tests are conflicting
2. You MUST determine root cause (shared state, import conflicts, etc.)
3. You MUST REJECT with the specific units that need rework
4. Include the failing test output in your rejection feedback

### Error: Missing Integration Between Units

**Symptoms**: Units work independently but aren't wired together

**Resolution**:
1. You MUST identify the missing wiring (e.g., component not imported, route not registered)
2. You MUST REJECT and specify which unit should own the integration
3. If the gap is a new concern, recommend it be added to the unit spec
