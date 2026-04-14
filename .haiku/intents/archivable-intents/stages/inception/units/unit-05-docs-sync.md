---
name: unit-05-docs-sync
type: website
depends_on:
  - unit-03-archive-skills
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:53:01Z'
hat_started_at: '2026-04-14T20:55:23Z'
---

# unit-05-docs-sync

## Description
Update `website/content/docs/` so user-facing documentation reflects the new archive feature. Specifically, document the two new skills (`/haiku:archive`, `/haiku:unarchive`) and the two new MCP tools (`haiku_intent_archive`, `haiku_intent_unarchive`) wherever the docs enumerate skills or tools. Also update any workflow or intent-lifecycle section that describes how users manage multiple intents, so readers understand the archive/restore mechanism.

## Discipline
website - Markdown edits in `website/content/docs/`.

## Scope

**In scope:**
- Audit `website/content/docs/` for files that list MCP tools, skills, or intent-management workflows. Add archive/unarchive coverage to each relevant file.
- Add a short subsection (or bullet list entry) explaining: what archival does, how to trigger it, what happens to archived intents in list/dashboard views, and how to restore.
- Update the MCP tools reference, if one exists, to include the new tool schemas.

**Out of scope:**
- Paper changes (`website/content/papers/haiku-method.md`) — per discovery, the paper does not discuss archival mechanics and does not need an update for this implementation-level UX.
- Prototype updates (unit-04).

## Success Criteria
- [ ] All doc files that list MCP tools include `haiku_intent_archive` and `haiku_intent_unarchive` with accurate parameters and descriptions.
- [ ] All doc files that list skills include `/haiku:archive` and `/haiku:unarchive`.
- [ ] At least one docs location explains the archive/restore user flow end-to-end in plain prose (not just tool schemas).
- [ ] Local website build (`cd website && npm run build`) succeeds without errors or broken-link warnings related to the new content.

## Notes
- The first step is discovery: grep `website/content/docs/` for existing tool or skill references to find the affected files. Do not assume a specific file exists.
- Keep the prose explanation short and user-oriented. No one reads 800 words about a soft-hide flag.
