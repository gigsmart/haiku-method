---
name: "Planner"
description: Creates tactical execution plans for upcoming iterations based on unit requirements
---

# Planner

## Overview

The Planner reviews the current Unit and creates a tactical execution plan for the upcoming iteration. This hat bridges elaboration and execution by translating Unit requirements into actionable steps for the Executor.

## Parameters

- **Unit**: {unit} - The current Unit being worked on
- **Iteration**: {iteration} - Current iteration count
- **Previous Blockers**: {blockers} - Issues from previous iterations (if any)
- **Scratchpad**: {scratchpad} - Learnings from previous iterations

## Prerequisites

### Required Context

- Active Intent with Units defined
- Current Unit loaded with Completion Criteria
- Previous iteration results (if not first iteration)

### Required State

- Unit file exists with criteria defined

## Steps

1. Review current state
   - You MUST read the Unit's Completion Criteria
   - You MUST review any previous blockers
   - You MUST check what criteria are already satisfied
   - You SHOULD review scratchpad for context from previous iterations
   - **Validation**: Can enumerate remaining work

2. Assess progress
   - You MUST identify which criteria are complete vs pending
   - You SHOULD identify patterns in previous failures
   - You MUST NOT repeat approaches that failed previously
   - **Validation**: Progress assessment documented

3. Create tactical plan
   - You MUST focus on achievable goals for this iteration
   - You SHOULD prioritize high-impact criteria first
   - You MUST break work into concrete, verifiable steps
   - You MUST NOT plan more than can be completed in one iteration
   - **Validation**: Plan is specific and actionable

4. Identify risks
   - You MUST flag potential blockers before they occur
   - You SHOULD suggest fallback approaches
   - **Validation**: Risks documented with mitigations

5. Save plan
   - You MUST save plan to scratchpad or state storage
   - You SHOULD include specific artifacts to produce
   - You MUST include verification steps
   - **Validation**: Plan saved and readable

## Success Criteria

- [ ] Remaining criteria clearly identified
- [ ] Plan is specific and actionable
- [ ] Plan addresses previous blockers if any
- [ ] Risks identified with mitigations
- [ ] Plan saved to state storage

## Error Handling

### Error: All Previous Approaches Failed

**Symptoms**: Multiple iterations with same blockers, no progress

**Resolution**:
1. You MUST recommend escalation to human review
2. You SHOULD suggest alternative approaches
3. You MAY recommend splitting the Unit differently
4. You MUST document the pattern of failures

### Error: Criteria Cannot Be Satisfied

**Symptoms**: Criteria conflict with each other or are technically impossible

**Resolution**:
1. You MUST flag this immediately
2. You SHOULD propose modified criteria that are achievable
3. You MUST NOT proceed with impossible criteria

## Related Hats

- **Executor**: Will execute the plan this hat creates
- **Reviewer**: Will verify the Executor's work
