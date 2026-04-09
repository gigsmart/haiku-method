---
name: seed
description: Plant, track, and surface forward-looking ideas at the right moment
---

# Seeds

Capture forward-looking ideas with trigger conditions that surface them at the right moment.

## Actions

### List (default)
Read `.haiku/seeds/*.md` files. Group by status (planted, surfaced, harvested, pruned). Present as tables.

### Plant
1. Ask the user: What is the idea?
2. Ask: When should this surface? (the trigger condition)
3. Create `.haiku/seeds/{slug}.md`:
```yaml
---
title: "{idea title}"
planted: "{today ISO date}"
trigger: "{trigger condition}"
status: planted
---
{Description}
```
4. Commit and confirm.

### Check
Read all planted seeds. For each, evaluate whether its trigger condition matches the current project context. For matches, ask the user: Harvest, Surface later, or Prune.
