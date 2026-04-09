---
name: composite
description: Create a composite intent combining stages from multiple studios with sync points
---

# Composite Intent

Create a composite intent that runs stages from multiple studios in parallel with sync points.

## Process

1. Gather from the user:
   - Work description
   - Studio selection (MUST select 2+ studios — use `haiku_studio_list` to get available studios)
   - Stage selection per studio
   - Sync points between studios

2. Present studio selection as a multi-select question via `ask_user_visual_question`. At least 2 required.

3. For each selected studio, show its stages and let the user pick which to include.

4. Ask where studios need to synchronize. Suggest sync points based on stage produce/require chains.

5. Create the intent with composite frontmatter:
```yaml
composite:
  - studio: {studio1}
    stages: [stage1, stage2]
  - studio: {studio2}
    stages: [stage1, stage2]
sync:
  - wait: [studio1:stage2]
    then: [studio2:stage2]
```

6. Report the created intent with studio/stage overview.
