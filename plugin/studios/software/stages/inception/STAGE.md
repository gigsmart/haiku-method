---
name: inception
description: Understand the problem, define success, and decompose into units
hats: [architect, decomposer]
review: auto
unit_types: [research, backend, frontend]
inputs: []
---

# Inception

## Criteria Guidance

Good criteria examples:
- "Discovery document maps all entities with their fields and relationships"
- "Each unit has 3-5 completion criteria, each verifiable by a specific command or test"
- "Unit DAG has no circular dependencies — verified by topological sort"

Bad criteria examples:
- "Domain is understood"
- "Units have criteria"
- "Decomposition is complete"

## Overlap Awareness

During decomposition, check for other active H·AI·K·U branches working on overlapping files:

```bash
# List active haiku branches and their changed files
for branch in $(git branch -r --list 'origin/haiku/*/main' 2>/dev/null); do
  changed=$(git diff --name-only main...$branch 2>/dev/null)
  [ -n "$changed" ] && echo "Branch: $branch" && echo "$changed"
done
```

If overlap is detected with files this intent plans to modify, note it in the discovery document. Not a blocker — just awareness for the architect hat to factor in.

## Completion Signal

Discovery document exists with domain model and technical landscape. All units have specs with dependencies and verifiable completion criteria. Unit DAG is acyclic. Each unit is scoped to complete within a single bolt.
