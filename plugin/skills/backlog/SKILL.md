---
name: backlog
description: Parking lot for ideas not ready for planning — add, list, review, or promote
---

# Backlog

Manage a parking lot of ideas not yet ready for formal planning.

## Actions

### List (default)
Read `.haiku/backlog/*.md` files. Present a table: ID | Priority | Tags | Created.
If empty, suggest adding items.

### Add
Create `.haiku/backlog/{slug}.md` with frontmatter:
```yaml
---
id: {slug}
priority: medium
tags: []
created: {today YYYY-MM-DD}
---
```
Derive slug from description (lowercase, hyphens, max 50 chars).

### Review
Present each backlog item and ask the user to: Keep, Reprioritize, Drop, Promote (to intent), or Skip. Use `ask_user_visual_question` for choices.

### Promote
Read the backlog item, confirm with user, then start a new intent with `/haiku:start` using the item's description. Delete the backlog file after promotion.
