---
status: pending
depends_on: []
---

# Unit: [Unit Name]

<!--
AI-DLC Unit Template
Replace bracketed text with your content.
Delete these comment blocks before use.

Status values: pending, in-progress, blocked, complete
depends_on: list of unit filenames this unit depends on
-->

## Description

<!--
What this specific unit accomplishes.
Should be completable in one focused session (2-4 hours).
-->

[Describe what this unit delivers. What will be different when it's complete?]

## Completion Criteria

<!--
Specific, verifiable criteria for this unit.
Each should be independently testable.
Include positive cases, negative cases, and edge cases.
-->

### Success Cases
- [ ] [When X happens, Y should result]
- [ ] [Given A, the system should B]
- [ ] [User can perform action Z]

### Failure Cases
- [ ] [When invalid input X, error Y is shown]
- [ ] [Missing required field returns 400]
- [ ] [Unauthorized access returns 401]

### Edge Cases
- [ ] [Empty input handled gracefully]
- [ ] [Boundary value behaves correctly]
- [ ] [Concurrent access handled properly]

## Quality Gates

<!--
Automated checks that must pass.
These run without human intervention.
-->

- [ ] All tests pass (`bun test` / `npm test`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint warnings (`biome check` / `eslint .`)
- [ ] Test coverage >80% for new code

## Technical Notes

<!--
Implementation guidance or constraints.
Things the Builder should know.
-->

- [Preferred approach or pattern to use]
- [File or component to modify]
- [Library or API to integrate with]

## Blockers

<!--
Document any blockers encountered during work.
Update as blockers are discovered or resolved.
-->

- [ ] [Blocker description - RESOLVED/UNRESOLVED]

## Progress Log

<!--
Optional: Track progress during work.
Useful for picking up after context resets.
-->

| Date | Hat | Notes |
|------|-----|-------|
| | Researcher | |
| | Planner | |
| | Builder | |
| | Reviewer | |
