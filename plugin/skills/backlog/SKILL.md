---
description: Parking lot for ideas not ready for planning — add, review, promote to intents
disable-model-invocation: true
user-invocable: true
argument-hint: "[add|list|review|promote] [description]"
---

## Name

`ai-dlc:backlog` - Parking lot for ideas not yet ready for planning.

## Synopsis

```
/backlog add <idea>
/backlog list
/backlog review
/backlog promote <id>
```

## Description

**User-facing command** - Manage a lightweight backlog of ideas, observations, and future work that aren't ready for full elaboration yet. Inspired by GSD's backlog system.

Use this when you notice something that should be done later but don't want to break flow:
- A tech debt item spotted during execution
- A feature idea that came up in conversation
- A bug noticed but unrelated to the current intent
- An improvement suggestion from a review

Items live in `.ai-dlc/backlog/{slug}.md` until promoted to a full intent.

## Storage Format

Each backlog item is a markdown file at `.ai-dlc/backlog/{slug}.md`:

```markdown
---
id: {slug}
priority: low | medium | high
tags: [tech-debt, feature, bug, improvement]
created: YYYY-MM-DD
---

# {Title}

{Description of the idea, context, and any relevant notes.}
```

## Commands

### `add` - Add a new idea

```
/backlog add <idea description>
```

1. Derive a slug from the idea description (lowercase, hyphens, max 50 chars).
2. Set default priority to `medium`.
3. Auto-detect tags from keywords (or default to empty).
4. Set `created` to today's date.
5. Create `.ai-dlc/backlog/{slug}.md` with the frontmatter and description.
6. Confirm: `Added to backlog: {slug} (priority: medium)`

### `list` - List all backlog items

```
/backlog list
```

1. Scan `.ai-dlc/backlog/*.md` for all items.
2. Parse frontmatter from each file.
3. Display a table sorted by priority (high > medium > low), then by created date:

```
ID                    Priority  Tags         Created
────────────────────  ────────  ───────────  ──────────
fix-api-retries       high      tech-debt    2026-03-20
add-search-filters    medium    feature      2026-03-22
update-readme-links   low       improvement  2026-03-25
```

4. If no items exist, print: `Backlog is empty. Use /backlog add <idea> to add one.`

### `review` - Interactive triage

```
/backlog review
```

1. Load all backlog items sorted by created date (oldest first).
2. For each item, present it and ask:
   - **Keep** - Leave as-is
   - **Reprioritize** - Change priority (prompt for new level)
   - **Drop** - Delete the item
   - **Promote** - Promote to intent (runs the promote flow)
   - **Skip** - Move to next item
3. After all items reviewed, show a summary of changes made.

### `promote` - Promote to intent

```
/backlog promote <id>
```

1. Read the backlog item at `.ai-dlc/backlog/{id}.md`.
2. If not found, print error and list available IDs.
3. Confirm with the user: `Promote "{title}" to a full intent for elaboration?`
4. On confirmation:
   a. Invoke `/elaborate` with the item's description as the starting context.
   b. Delete the backlog file from `.ai-dlc/backlog/`.
   c. Print: `Promoted {id} to intent. Elaboration started.`

## Implementation Notes

- All state is file-based in `.ai-dlc/backlog/` — no database, no external deps.
- Slugs are derived from the description: lowercase, non-alphanumeric replaced with hyphens, collapsed, trimmed to 50 chars.
- The `review` command is interactive and should use `AskUserQuestion` for each item.
- The `promote` command delegates to the existing `/elaborate` skill for intent creation.
