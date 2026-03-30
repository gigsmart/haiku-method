---
description: (Internal) Autonomous ticket sync for AI-DLC elaboration — creates epics, tickets, and DAG links
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only tool patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__ask*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__describe*"
  - "mcp__*__explain*"
  - "mcp__*__memory"
  # Ticketing provider write tools (epic/ticket creation)
  - "mcp__*__create*issue*"
  - "mcp__*__create*ticket*"
  - "mcp__*__create*epic*"
  - "mcp__*__update*issue*"
  - "mcp__*__update*ticket*"
  - "mcp__*__add*comment*"
---

# Elaborate: Ticket Sync

Autonomous ticket synchronization for AI-DLC elaboration. This skill runs as a forked subagent — it reads a brief file from disk, creates epics and tickets in the ticketing provider, maps the unit DAG to blocked-by relationships, and writes results to disk.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous.

---

## Step 1: Read Brief

Read the brief file passed as the first argument. The brief is at the path provided (e.g., `.ai-dlc/{intent-slug}/.briefs/elaborate-ticket-sync.md`).

Parse YAML frontmatter:

```yaml
intent_slug: my-feature
worktree_path: /path/to/.ai-dlc/worktrees/my-feature
ticketing_type: jira  # jira | linear | github | gitlab | or empty
ticketing_config:
  project_key: PROJ
  issue_type: Task
  issue_type_id: ""
  labels:
    frontend: fe-work
    backend: be-work
  story_points: optional
  issue_links: standard
  link_types:
    blocks: Blocks
    is_blocked_by: Is Blocked By
  epic_link: standard
  details: {}
plugin_root: /path/to/plugin
```

The markdown body contains:
- **Intent Summary**: Problem statement and solution description from intent.md
- **Epic**: Existing epic key (if pre-populated by product), or empty
- **Units**: List of all units with file paths, titles, disciplines, depends_on, descriptions, success criteria, and wireframe fields

**Change directory to the worktree** before any file operations:

```bash
cd "{worktree_path}"
```

**If `ticketing_type` is empty**, write results with `status: skipped` and exit immediately.

---

## Step 2: Discover Ticketing MCP Tools

Use `ToolSearch` to discover available MCP tools for the ticketing provider type (search for the provider type, e.g., `"jira"`, `"linear"`, `"github issues"`).

If no MCP tools are found:
- Write results with `status: skipped` and `error_message: "Ticketing provider '{ticketing_type}' configured but MCP tools not available"`
- Exit — never block elaboration on ticket creation failure

Read the provider config schema for reference:

```bash
cat "${plugin_root}/schemas/providers/${ticketing_type}.schema.json" 2>/dev/null
```

---

## Step 3: Epic Handling

Check the **Epic** section in the brief:

- **If epic key is already provided** (non-empty): use that existing epic — do NOT create a new one. Record the key.
- **If epic is empty**: create an epic from the intent using the ticketing MCP tools.
  - Epic title: intent title (derived from intent slug, humanized)
  - Epic description (multiline markdown, NOT escaped `\n`):

    ```markdown
    ## Problem

    {problem statement from brief}

    ## Solution

    {solution description from brief}

    ## Units

    1. {unit-01 title}
    2. {unit-02 title}
    ...
    ```

Record the epic key for later use.

---

## Step 4: Create Tickets Per Unit

For each unit listed in the brief, create a ticket using the ticketing MCP tools:

- **Title**: unit title (from the brief)
- **Issue type**: `ticketing_config.issue_type` (fall back to "Task")
- **Issue type ID**: `ticketing_config.issue_type_id` (overrides name lookup if set)
- **Labels**: `ticketing_config.labels[unit.discipline]` (if configured, apply discipline-mapped labels)
- **Story points**: estimate and set if `ticketing_config.story_points` = "required"

### Ticket Description Format

**CRITICAL**: Always pass description strings with real newlines (multiline markdown), never escaped `\n` literals. MCP tool description fields accept markdown — use it.

Build the description from the unit info in the brief:

```markdown
## Overview

{unit description from the brief}

## Completion Criteria

- [ ] {criterion 1}
- [ ] {criterion 2}
- [ ] {criterion 3}

## Dependencies

{if unit has depends_on, list them here with their ticket keys if known}
- Blocked by: {dependency unit title} ({ticket key})

{if unit has no dependencies}
None — this unit can start immediately.

## Wireframe

{if unit has wireframe field in the brief}
Low-fidelity wireframe available at `.ai-dlc/{intent-slug}/{wireframe-path}`.
Shows approved screen structure, flow, and placeholder copy.
Apply full visual design during execution.

{if unit does not have wireframe — omit this section entirely}

## Technical Notes

{include any implementation guidance, constraints, or architectural notes from the unit description in the brief — omit this section if no technical detail beyond the criteria}
```

Omit sections that have no content. The goal is a ticket that gives a developer full context without reading the `.ai-dlc/` files.

**Every unit ticket MUST be linked to the intent epic** (unless `ticketing_config.epic_link` is explicitly `"none"`). The epic is the single parent that groups all unit work. This applies regardless of provider: Jira epic links, Linear parent issues, GitHub milestones/tracked-by, GitLab epic associations.

Record the ticket key for each unit as you create them.

---

## Step 5: Map DAG to Blocked-By

If `ticketing_config.issue_links` is NOT `"none"`:

For each unit's `depends_on` list, create blocked-by relationships between the corresponding tickets:
- Use link type names from `ticketing_config.link_types` (defaults: "Blocks" / "Is Blocked By")
- Example: unit-02 depends on unit-01 → ticket for unit-02 is blocked by ticket for unit-01

---

## Step 6: Store Keys in Frontmatter

Update the actual files on disk:

1. **Intent frontmatter**: Update `epic:` field in intent.md with the epic key
2. **Unit frontmatter**: Update `ticket:` field in each unit file with its ticket key

Then commit:

```bash
INTENT_SLUG="{intent_slug from brief}"
git add .ai-dlc/
git commit -m "elaborate: sync tickets for ${INTENT_SLUG}"
```

---

## Step 7: Validate (Phase 6.75)

After ticket creation and frontmatter updates, validate:

1. **Epic check**: Read `intent.md` frontmatter. Check the `epic:` field.
   - If `epic:` is empty or missing → **FAIL**

2. **Ticket check**: Scan all `unit-*.md` files in `.ai-dlc/{intent-slug}/`. Check each file's `ticket:` frontmatter field.
   - If ANY unit has an empty or missing `ticket:` field → **FAIL**

### On FAIL

**DO NOT proceed to writing results.** Instead:

1. Report exactly what is missing:
   ```
   Ticket sync validation failed:
   - intent.md: epic field is empty
   - unit-02-auth-middleware.md: ticket field is empty
   - unit-04-api-routes.md: ticket field is empty
   ```

2. Loop back to the relevant step (Step 3 for epic, Step 4 for tickets) to create the missing items.

3. After retry, re-validate.

4. **Maximum 2 retry attempts.** After 2 failed retries, write results with `status: error` and the validation failures as `error_message`.

### On PASS

Proceed to writing results.

---

## Step 8: Write Results

Write the results file to `.ai-dlc/{intent-slug}/.briefs/elaborate-ticket-sync-results.md`:

```markdown
---
status: success
error_message: ""
validation_passed: true
---

# Ticket Sync Results

## Epic

- **Key:** {epic key}
- **Title:** {intent title}
- **Status:** {Created | Pre-existing}

## Tickets

| Unit | Ticket Key | Title | Linked to Epic |
|------|-----------|-------|----------------|
| {unit filename} | {ticket key} | {unit title} | {Yes/No} |

## DAG Links

- {ticket key} ({unit name}) blocked by {ticket key} ({unit name})

## Validation

- Epic field populated: {Yes/No}
- All ticket fields populated: {Yes/No}
- Validation passed: {Yes/No}

## Errors

{any errors encountered, empty if none}
```

If `ticketing_type` was empty:

```markdown
---
status: skipped
error_message: ""
validation_passed: true
---

# Ticket Sync Results

No ticketing provider configured — ticket sync skipped.
```

---

## Error Handling

- If ticketing MCP tools are not available → `status: skipped`
- If ticket creation partially fails → retry up to 2 times, then `status: error` with details
- If validation fails after retries → `status: error` with exact missing fields
- Never block elaboration on ticket creation failure — always write a results file
