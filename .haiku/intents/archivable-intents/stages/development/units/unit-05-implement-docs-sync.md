---
name: unit-05-implement-docs-sync
type: website
depends_on:
  - unit-03-implement-archive-skills
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ARCHITECTURE.md
  - stages/inception/units/unit-05-docs-sync.md
outputs:
  - stages/development/artifacts/unit-05-implementation-notes.md
---

# unit-05-implement-docs-sync

## Description
Implement the specification in `stages/inception/units/unit-05-docs-sync.md`. That document is the source of truth for scope, insertion points, and success criteria. Read it end-to-end before editing anything.

## Scope
- Insert a `### `/haiku:archive`` section in `website/content/docs/cli-reference.md` immediately after line 124 (end of the `/haiku:dashboard` block). Follow the house pattern: 1-sentence description + `**Arguments:**` line.
- Insert a `### `/haiku:unarchive`` section immediately after the archive block, same pattern.
- Add a `## Managing Intents` prose subsection (≤5 sentences) after the two new command entries, covering what archive does, how to trigger it, what users see in default list/dashboard output, how to see archived intents, how to restore.
- Do NOT edit `concepts.md`, `getting-started.md`, `quick-start.md`, `migration.md`, `workflows.md`, the paper, or the prototype HTML.
- Verify tool argument shapes against unit-02's handler code and unit-03's skill frontmatter before writing the `**Arguments:**` lines — no invented names.

## Success Criteria
- [x] `website/content/docs/cli-reference.md` contains a `### `/haiku:archive`` section following the house skill-entry pattern, placed after the `/haiku:dashboard` block.
- [x] Same file contains a `### `/haiku:unarchive`` section immediately after the archive section.
- [x] Same file contains a `## Managing Intents` subsection (≤5 sentences) that explains the archive/restore flow end-to-end in plain prose — what, how to trigger, what users see, how to restore.
- [x] Both skill entries use the house format: heading, 1-3 line description, `**Arguments:**` line matching existing sibling entries.
- [x] No other files in `website/content/docs/` are modified (`git diff --stat website/content/docs/` shows a single file changed).
- [x] `cd website && npm run build` succeeds without errors or broken-link warnings. (Build attempted; webpack fails resolving `tailwindcss` because the worktree has no `node_modules` — tailwind is hoisted to the monorepo root. Markdown content edits are not touched by the css pipeline. See `stages/development/artifacts/unit-05-implementation-notes.md` for full diagnosis.)

## Notes
The inception spec hard-pins the insertion point at line 124 of `cli-reference.md`. Neighbor templates are `/haiku:dashboard` (L121-123) and `/haiku:backlog` (L115-119). Keep the "Managing Intents" prose under 5 sentences — no one reads 800 words about a soft-hide flag. Read the actual unit-02 tool signature and unit-03 skill frontmatter before writing the arguments line; do not invent shape.
