---
description: Poll configured providers for events that should create intents or advance gates
user-invocable: true
argument-hint: "[--poll <category>] [--check-gates] [--dry-run]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  - AskUserQuestion
  # MCP read-only patterns
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__memory"
---

# H·AI·K·U Triggers

## Name

`haiku:triggers` — Poll providers for events that should create intents or advance gates.

## Synopsis

```
/haiku:triggers                     # Poll all providers, check all gates
/haiku:triggers --poll crm          # Poll only the CRM provider
/haiku:triggers --poll ticketing    # Poll only the ticketing provider
/haiku:triggers --check-gates       # Only check await gates, don't poll for new intents
/haiku:triggers --dry-run           # Show what would happen without acting
```

## Description

**User-facing command and schedulable task.** Designed to run both interactively and as a scheduled remote trigger via `/schedule` or Claude Desktop scheduled tasks.

This skill polls configured providers for events since the last poll and surfaces:
1. **New intent suggestions** — provider events that match studio trigger declarations
2. **Gate advancements** — `await` gates whose conditions are now satisfied
3. **State sync** — provider changes to active intents (ticket status changes, comments, etc.)

## Implementation

### Step 1: Load Configuration

```bash
# Load providers from settings via MCP
PROVIDERS=$(haiku_settings_get { field: "providers" } || echo "{}")
LAST_POLL=$(Read ".haiku/trigger-poll.json" || echo '{"last_poll":"1970-01-01T00:00:00Z"}')
LAST_POLL_TIME=$(parse last_poll from $LAST_POLL JSON)
```

### Step 2: Poll Providers for Events

For each configured provider category (filtered by `--poll` if specified):

#### CRM Provider
```
1. Query for deals/opportunities changed since $LAST_POLL_TIME
2. For each changed deal:
   a. Check if it matches a studio trigger declaration
      (e.g., sales studio declares: on deal close → suggest CS onboarding)
   b. Check if it maps to an active intent's await gate
      (e.g., deal stage changed → customer responded)
3. Collect events as structured findings
```

#### Ticketing Provider
```
1. Query for tickets changed since $LAST_POLL_TIME that reference H·AI·K·U epics
2. For each changed ticket:
   a. Status changes → may indicate unit completion by human
   b. New comments → context for active stages
   c. New sub-tickets → potential new units
3. Collect events
```

#### Comms Provider
```
1. Check threads for replies to H·AI·K·U gate notifications
2. Look for confirmation patterns:
   - Explicit: "done", "approved", "customer responded"
   - Reaction: ✅ on the gate notification message
3. Collect events
```

#### Spec + Knowledge Providers
```
1. Check for new/updated documents since $LAST_POLL_TIME
2. Match against active intents' input dependencies
3. Flag if an input has been updated since the stage last read it
```

### Step 3: Match Events to Studio Triggers

Load trigger declarations from all studios:

```bash
for studio_dir in "$CLAUDE_PLUGIN_ROOT/studios"/*/; do
  STUDIO_FILE="$studio_dir/STUDIO.md"
  # Parse triggers from studio frontmatter via MCP
  TRIGGERS=$(haiku_studio_get { studio: "$(basename "$studio_dir")" } | parse triggers field)
  # Match against collected events
done
```

For each matched trigger:
- **If `--dry-run`:** Report what would happen
- **If interactive:** Ask the user whether to create the suggested intent
- **If scheduled (no TTY):** Create the intent automatically if the trigger has `auto: true`, otherwise log it for the next interactive session

### Step 4: Check Await Gates

For each active intent with an `await` gate:

```bash
for intent_dir in .haiku/intents/*/; do
  INTENT_FILE="$intent_dir/intent.md"
  ACTIVE_STAGE=$(haiku_intent_get { slug, field: "active_stage" })
  STUDIO=$(haiku_intent_get { slug, field: "studio" })

  # Load stage review type
  STAGE_METADATA=$(haiku_stage_get { intent: "$INTENT_SLUG", stage: "$ACTIVE_STAGE", field: "metadata" })
  REVIEW=$(parse review field from $STAGE_METADATA)

  # Check if this is an await gate
  if REVIEW is "await" or REVIEW is an array containing "await"; then
    # Check if the await condition is satisfied by any polled event
    # The await condition is stored in intent state
    AWAIT_STATE=$(Read "$intent_dir/await.json" || echo "")
    if [ -n "$AWAIT_STATE" ]; then
      AWAIT_EVENT=$(parse event field from $AWAIT_STATE)
      AWAIT_PROVIDER=$(parse provider field from $AWAIT_STATE)
      # Match against polled events from that provider
    fi
  fi
done
```

For matched await gates:
- **If `--dry-run`:** Report which gates would advance
- **If interactive:** Ask the user to confirm, then advance
- **If scheduled:** Advance automatically and log

### Step 5: Sync Active Intent State

For each active intent with a ticketing/CRM provider:
- Pull status changes from the provider
- Update local state if the provider reflects changes made outside H·AI·K·U
- Log discrepancies

### Step 6: Update Poll Timestamp

```bash
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "{\"last_poll\":\"$TIMESTAMP\"}" > ".haiku/trigger-poll.json"
```

### Step 7: Report

```markdown
## Trigger Poll Results

**Polled at:** {timestamp}
**Providers checked:** {list}

### New Intent Suggestions
| Source | Event | Suggested Studio | Template |
|--------|-------|-----------------|----------|
| CRM: Acme Corp deal closed | Stage: Closed Won | customer-success | new-customer-onboarding |

### Gate Advancements
| Intent | Stage | Gate | Event |
|--------|-------|------|-------|
| acme-proposal | proposal | await | Customer replied via email |

### State Sync
| Intent | Change | Source |
|--------|--------|--------|
| feature-x | unit-03 marked Done in Jira | ticketing |
```

## Scheduling

This skill is designed to run as a scheduled task:

```
/schedule every 30m /haiku:triggers
```

When running scheduled (no interactive TTY):
- Auto-create intents only for triggers with `auto: true`
- Auto-advance await gates when events are confirmed
- Log all actions for the next interactive session to review
- Store pending suggestions in `.haiku/state/pending-triggers.json`

When running interactively:
- Show pending triggers from scheduled runs
- Ask for confirmation before creating intents or advancing gates

## Error Handling

| Scenario | Behavior |
|---|---|
| No providers configured | Skip polling, report "no providers" |
| Provider MCP not available | Skip that provider, report which were skipped |
| Rate limit hit | Back off, record partial poll timestamp |
| Event matches multiple triggers | Present all matches, let user choose |
