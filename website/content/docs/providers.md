---
title: Providers
description: Connect H·AI·K·U to Jira, Notion, Figma, Slack, and other external tools
order: 10
---

# Providers

Providers connect H·AI·K·U to external systems your team already uses — ticketing, specs, design tools, and communication channels. When configured, H·AI·K·U automatically syncs work across these systems during elaboration and execution.

## Provider Categories

| Category | Purpose | Supported Types |
|----------|---------|----------------|
| **ticketing** | Track work as tickets/issues linked to units | Jira, Linear, GitHub Issues, GitLab Issues |
| **spec** | Pull requirements and acceptance criteria | Notion, Confluence, Google Docs |
| **design** | Reference designs and component specs | Figma |
| **comms** | Post status updates and notifications | Slack, Teams, Discord |
| **VCS hosting** | Auto-detected from git remote | GitHub, GitLab, Bitbucket |
| **CI/CD** | Auto-detected from repo config files | GitHub Actions, GitLab CI, Jenkins, CircleCI |

VCS hosting and CI/CD are detected automatically — you don't need to configure them.

## Configuration

Add a `providers` section to your `.haiku/settings.yml`:

```yaml
providers:
  ticketing:
    type: jira
    config:
      project_key: "PROJ"
    instructions: |
      - Set ticket type to "Feature"
      - Use Fibonacci story points (1, 2, 3, 5, 8, 13)
      - Map unit discipline to labels: backend → "Elixir", frontend → "ReactNative"

  spec:
    type: notion
    config:
      workspace_id: "your-workspace-id"
    instructions: |
      - Link each ticket to the specific AC page it covers

  design:
    type: figma
    instructions: |
      - Only reference designs marked "Ready for Dev"

  comms:
    type: slack
    config:
      channel: "#dev-updates"
```

Each provider entry has three fields:

- **type** (required) — Which tool to connect to
- **config** (optional) — Provider-specific settings like project keys or workspace IDs
- **instructions** (optional) — Project-specific rules that customize default behavior

## How It Works

### During Elaboration

When you run `/haiku:elaborate`, H·AI·K·U uses providers to enrich the process:

1. **Spec provider** — Searches for existing requirements, PRDs, and design docs related to your intent
2. **Design provider** — Pulls relevant mockups and component specs
3. **Ticketing provider** — After writing artifacts, creates an epic and tickets:
   - One epic per intent (or links to an existing epic if provided by product)
   - One ticket per unit, linked to the epic
   - Unit `depends_on` relationships become ticket blocked-by links
   - Epic and ticket keys are stored in intent/unit frontmatter

### During Execution

Hats interact with providers as they work:

- **Builder** — Updates ticket to "In Progress" when starting a unit, "Done" on completion, "Blocked" if stuck
- **Reviewer** — Posts review outcomes as ticket comments. Updates ticket status on approval/rejection
- **Comms** — Posts notifications when elaboration completes, reviews finish, or blocking issues arise

### Graceful Degradation

Provider interactions are advisory (**SHOULD**, not **MUST**). If MCP tools aren't available for a configured provider, H·AI·K·U skips the integration silently and continues working. Missing providers never block your workflow.

## Three-Tier Instruction Merge

Provider instructions are merged from three sources, with later tiers supplementing earlier ones:

1. **Built-in defaults** — Ship with the plugin. Cover universal behaviors like DAG-to-blocked-by mapping for ticketing.
2. **Inline instructions** — The `instructions:` field in your settings.yml. Project-specific rules.
3. **Project overrides** — Markdown files at `.haiku/providers/{type}.md` for detailed conventions.

### Example: Project-Level Override

Create `.haiku/providers/jira.md` for detailed Jira conventions:

```markdown
---
provider: jira
type: ticketing
---

# Jira Conventions

## Required Fields
- Story points (Fibonacci: 1, 2, 3, 5, 8, 13)
- Component: Backend | Frontend | Infrastructure
- Sprint: Current sprint unless explicitly backlogged

## Naming Conventions
- Epic titles: "{Quarter} - {Objective}"
- Story titles: Imperative verb (e.g., "Add JWT validation middleware")
```

## Existing Epic Support

If your product team creates epics ahead of time, set the `epic` field in your intent frontmatter before elaborating:

```yaml
---
epic: "PROJ-123"
---
```

H·AI·K·U will link all tickets to that existing epic instead of creating a new one. If `epic` is left empty, a new epic is created automatically.

## MCP Requirements

Providers work through MCP (Model Context Protocol) tool servers. For each provider type, you need the corresponding MCP server configured in your Claude Code settings:

| Provider Type | MCP Tool Pattern |
|--------------|-----------------|
| Jira | `mcp__*jira*` |
| Linear | `mcp__*linear*` |
| GitHub Issues | `gh issue` (built-in) |
| Notion | `mcp__*notion*` |
| Confluence | `mcp__*confluence*` |
| Figma | `mcp__*figma*` |
| Slack | `mcp__*slack*` |

## Next Steps

- **[Quick Start](/docs/quick-start/)** — Get started with H·AI·K·U
- **[Workflows](/docs/workflows/)** — Understand the hat-based workflow system
- **[Cowork Mode](/docs/cowork/)** — Work on repos remotely without local checkout
