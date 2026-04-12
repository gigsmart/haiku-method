---
name: studios
description: Browse available H·AI·K·U studios grouped by category with help links into each studio definition
---

# Studios

Browse the studio portfolio — every lifecycle template available in this
project, grouped by category, with direct links to each studio's definition.

## What to do

1. Call `haiku_studio_list` to get the full list of studios. The response
   includes, for each studio: `name`, `slug`, `aliases`, `description`,
   `category`, `stages`, `source` (`plugin` or `project`), `path` (directory),
   and `studio_md` (absolute path to STUDIO.md — the canonical definition).

2. Group the studios by `category` and present them as a Markdown portfolio.
   Inside each category, sort alphabetically by canonical `name`.

3. For each studio, render:
   - **Name** (with slug in parens if different), and `[project]` tag if
     `source === "project"`
   - One-line description
   - Stage count or stage list if short (≤5 stages)
   - A help link to the studio definition: render as a Markdown link using
     the `studio_md` path, labelled "definition"
   - Aliases, if any (so users know all the ways to invoke the studio)

4. If the user asks to drill into a studio, call `haiku_studio_get` with the
   name, slug, alias, or dir — any of them resolves. For a specific stage,
   use `haiku_studio_stage_get`.

## Example output shape

```markdown
## engineering

- **Application Development** (`appdev`) — Lifecycle for web, mobile, and desktop applications · 6 stages · [definition](/abs/path/to/STUDIO.md)
  - aliases: `software`
- **Game Development** (`gamedev`) — Lifecycle for games · 5 stages · [definition](/abs/path/to/STUDIO.md)
- **Hardware Development** (`hwdev`) — Lifecycle for hardware products · 6 stages · [definition](/abs/path/to/STUDIO.md)
- **Library Development** (`libdev`) — Lifecycle for libraries, SDKs, CLI tools · 4 stages · [definition](/abs/path/to/STUDIO.md)

## go-to-market
...
```

## Notes

- Always include the help link (`studio_md`) — discoverability is the whole
  point of browse. Users should be able to click through to read any studio's
  full definition.
- Project studios (`source: project`) override plugin studios of the same
  name. Surface this clearly with a `[project]` tag so users know they're
  looking at a customization.
- Do not filter or omit studios. If there are 20+, show all of them — the
  user asked to browse.
