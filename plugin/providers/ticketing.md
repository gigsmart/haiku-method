---
category: ticketing
description: Bidirectional ticketing provider — sync H·AI·K·U state to/from issue trackers
---

# Ticketing Provider — Default Instructions

## Inbound: Provider → H·AI·K·U

On session start, check the provider for events that affect active intents:

- **New tickets** created outside H·AI·K·U that reference the intent epic → surface as potential new units
- **Status changes** on unit tickets made by humans → update unit status in H·AI·K·U
- **Comments/feedback** added to tickets → load as context for the current stage's hats
- **Assignments** changed → note ownership changes in intent state

### Translation (Provider → H·AI·K·U)

The provider's data model may not match H·AI·K·U's frontmatter. Claude distills:

| Provider Concept | H·AI·K·U Concept | Translation |
|---|---|---|
| Epic / Parent Issue | Intent | Map title, description, acceptance criteria |
| Sub-task / Child Issue | Unit | Map to unit with completion criteria from ticket description |
| Sprint / Iteration | Bolt | Map sprint assignment to current iteration context |
| Status (To Do / In Progress / Done) | Unit status (pending / active / completed) | Direct mapping via status categories |
| Blocked flag / link | depends_on | Map blocking relationships to DAG dependencies |
| Labels / Components | unit_types / stage | Infer stage context from labels |
| Story points / Estimate | (informational) | Include in unit context, not enforced |

**Key principle:** Not all provider data has a H·AI·K·U equivalent. Claude reads what's useful, ignores what isn't, and never forces provider data into fields that don't fit.

## Outbound: H·AI·K·U → Provider

### Ticket Creation (During Decomposition)
- **Epic handling:**
  - If `epic` is already set in intent.md frontmatter (provided by product), link all tickets to that existing epic — do NOT create a new one
  - If `epic` is empty, create one **epic** per intent (title from intent, description from Problem + Solution) and store the key in intent.md frontmatter: `epic: PROJ-123`
- **Every unit ticket MUST be linked to the intent epic** — the epic is the single parent that groups all unit work. Only skip if `config.epic_link` is explicitly `"none"`.
- Map unit `depends_on` to ticket **blocked-by** relationships
- Store ticket key in unit frontmatter: `ticket: PROJ-124`

### Status Sync (During Execution)
- **Builder starts unit** → Move ticket to In Progress
- **Unit passes review** → Move ticket to Done
- **Unit blocked** → Flag ticket as Blocked, add blocker description as comment
- **Reviewer rejects** → Add review feedback as ticket comment, keep In Progress
- **Stage completes** → Update epic status/progress

### Translation (H·AI·K·U → Provider)

| H·AI·K·U Concept | Provider Concept | Translation |
|---|---|---|
| Intent title + description | Epic title + description | Direct, with markdown → provider format |
| Unit spec + criteria | Ticket description + checklist | Structure as Overview, Criteria, Dependencies, Notes |
| Unit depends_on | Blocked-by links | Create issue links using configured link types |
| Stage review findings | Ticket comments | Post review summary as structured comment |
| Intent completion | Epic status → Done | Update when all stages complete |

### Ticket Content

**CRITICAL**: Always pass description strings with real newlines (multiline), never escaped `\n` literals.

Structure ticket descriptions with these sections (omit any that are empty):

1. **Overview** — unit description (the prose from the unit file, not just the title)
2. **Completion Criteria** — checklist (`- [ ] criterion`)
3. **Dependencies** — blocked-by units with ticket keys if known
4. **Technical Notes** — implementation guidance, constraints, or architectural notes

The goal is a ticket that gives a person full context without needing to read `.haiku/` files.

## Sync: Event Discovery

On session start (or when `/haiku:resume` is invoked), check the provider for relevant events:

```
1. Load active intent's epic key from frontmatter
2. Query provider for changes since last sync timestamp
3. Surface: new comments, status changes, new sub-tickets, assignment changes
4. Update local state to reflect provider changes
5. Record sync timestamp in intent state
```

This is pull-based — not real-time. It runs when the user starts working.

## Provider Config

Provider-specific configuration lives under `providers.ticketing.config` in `.haiku/settings.yml`.
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
