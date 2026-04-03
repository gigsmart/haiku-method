---
category: ticketing
description: Default ticketing provider behavior for AI-DLC
---

# Ticketing Provider — Default Instructions

## Ticket Creation (Elaboration Phase)
- **Epic handling**:
  - If `epic` is already set in intent.md frontmatter (provided by product), link all tickets to that existing epic — do NOT create a new one
  - If `epic` is empty, create one **epic** per intent (title from intent, description from Problem + Solution) and store the key in intent.md frontmatter: `epic: PROJ-123`
- **Every unit ticket MUST be linked to the intent epic** — the epic is the single parent that groups all unit work. Without this link, tickets are orphaned and invisible to project tracking. This applies regardless of provider (Jira epic links, Linear parent issues, GitHub milestones/tracked-by, GitLab epic associations). Only skip if `config.epic_link` is explicitly `"none"`.
- Map unit `depends_on` to ticket **blocked-by** relationships:
  - If unit-02 depends on unit-01, the ticket for unit-02 is blocked by unit-01's ticket
- Store ticket key in unit frontmatter: `ticket: PROJ-124`

## Status Sync (During Execution)
- **Builder starts unit** → Move ticket to In Progress
- **Unit passes review** → Move ticket to Done
- **Unit blocked** → Flag ticket as Blocked, add blocker description as comment
- **Reviewer rejects** → Add review feedback as ticket comment, keep In Progress

## Ticket Content

**CRITICAL**: Always pass description strings with real newlines (multiline), never escaped `\n` literals. MCP tool description fields accept markdown — use it.

Structure ticket descriptions with these sections (omit any that are empty):

1. **Overview** — unit description (the prose from the unit file, not just the title)
2. **Completion Criteria** — checklist (`- [ ] criterion`)
3. **Dependencies** — blocked-by units with ticket keys if known
4. **Technical Notes** — implementation guidance, constraints, or architectural notes from the unit file

The goal is a ticket that gives a developer full context without needing to read `.ai-dlc/` files.

## Provider Config

Provider-specific configuration lives under `providers.ticketing.config` in `.ai-dlc/settings.yml`.
Schema: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`

**Never create top-level provider keys** (e.g., no top-level `jira:` key). All config goes under `providers.ticketing.config`.

When config fields are present, use them for ticket creation:
- `issue_type` / `issue_type_id` → set on created tickets
- `labels` → apply discipline-mapped labels to each unit ticket
- `story_points: required` → estimate and set story points
- `epic_link: required` → link all tickets to the intent epic
- `issue_links: required` → create Blocks/Blocked-By links from unit `depends_on`
- `link_types` → use configured link type names (defaults: "Blocks" / "Is Blocked By")
- `details` → additional ticket content requirements
