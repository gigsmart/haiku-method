---
name: inception
description: Understand the problem, define success, and elaborate into units
hats: [researcher, elaborator]
review: ask
elaboration: collaborative
inputs: []
---

# Inception

Understand the problem, define success, and elaborate into units.

## Overlap Awareness

During elaboration, check for other active H·AI·K·U branches working on overlapping files:

```bash
# List active haiku branches and their changed files
for branch in $(git branch -r --list 'origin/haiku/*/main' 2>/dev/null); do
  changed=$(git diff --name-only main...$branch 2>/dev/null)
  [ -n "$changed" ] && echo "Branch: $branch" && echo "$changed"
done
```

If overlap is detected with files this intent plans to modify, note it in the discovery document. Not a blocker — just awareness for the researcher hat to factor in.
