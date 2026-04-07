---
title: "MCP Prompt Catalog"
---

## MCP Prompt Catalog

### Prompt Registry — All 21 Prompts

#### Core Workflow (5)

| Name | Title | Description | Arguments |
| --- | --- | --- | --- |
| `haiku:new` | New Intent | Create a new H·AI·K·U intent with studio and stage configuration | `description?`: free text |
| `haiku:run` | Run Intent | Advance an intent through its stages | `intent?`: slug (completable) |
| `haiku:refine` | Refine | Amend specs mid-execution without losing progress | `stage?`: stage name (completable) |
| `haiku:review` | Review | Pre-delivery code review with fix loop | `intent?`: slug (completable) |
| `haiku:reflect` | Reflect | Post-completion analysis and learnings capture | `intent?`: slug (completable) |

#### Supporting (9)

| Name | Title | Description | Arguments |
| --- | --- | --- | --- |
| `haiku:autopilot` | Autopilot | Full autonomous workflow — elaborate, build, review, deliver | `description?`: free text |
| `haiku:composite` | Composite Intent | Run stages from multiple studios in parallel with sync points | `description?`: free text |
| `haiku:setup` | Setup | Configure H·AI·K·U providers and workspace settings | (none) |
| `haiku:migrate` | Migrate | Migrate legacy .ai-dlc intents to H·AI·K·U format | `intent?`: slug |
| `haiku:scaffold` | Scaffold | Generate custom studios, stages, hats, and provider overrides | `type`: enum (studio, stage, hat, provider); `name`: string; `parent?`: string |
| `haiku:operate` | Operate | Run post-delivery operational tasks from studio templates | `operation?`: operation name (completable) |
| `haiku:triggers` | Triggers | Poll configured providers for events that create intents or advance gates | `category?`: provider category |
| `haiku:dashboard` | Dashboard | Current intent status overview | (none) |
| `haiku:backlog` | Backlog | Manage intent backlog — add, list, review, promote | `action?`: enum (add, list, review, promote); `description?`: free text |

#### Complex (7)

| Name | Title | Description | Arguments |
| --- | --- | --- | --- |
| `haiku:adopt` | Adopt | Reverse-engineer an existing feature into H·AI·K·U intent artifacts | `description?`: free text |
| `haiku:quick` | Quick | Single-stage mode for small tasks — skip full elaboration | `stage?`: stage name; `description`: free text |
| `haiku:seed` | Seed | Create intents from studio templates | `action?`: enum (plant, list, check) |
| `haiku:ideate` | Ideate | Brainstorm and explore design directions | `area?`: free text |
| `haiku:pressure-testing` | Pressure Test | Challenge a unit's implementation with adversarial scenarios | `hat?`: hat name |
| `haiku:capacity` | Capacity | Historical throughput — bolt counts, stage durations, patterns | `studio?`: studio name (completable) |
| `haiku:release-notes` | Release Notes | Show project changelog and version history | `version?`: version string |

### Argument Schemas

#### Completable Arguments

| Argument | Completion Source | Context-Aware |
| --- | --- | --- |
| `intent` | Scan `.haiku/intents/` directories, filter active, sort by recency | No |
| `stage` | Resolve intent's studio, return studio's stage names | Yes — needs `intent` resolved first |
| `studio` | Scan built-in + project studios | No |
| `operation` | Scan selected studio's `operations/` directory | Yes — needs `studio` from settings |
| `template` | Scan selected studio's `templates/` directory | Yes — needs `studio` |

#### Completion Behavior

- Case-insensitive prefix match
- Substring match as fallback if no prefix matches
- Max 100 results per completion request
- Sorted: exact prefix first, then substring matches by recency
- `context.arguments` provides previously-resolved values for context-aware filtering

### Message Construction Pattern

All prompts return `GetPromptResult` with a consistent message structure:

```text
Message 1 (role: user)
├── Purpose: Establish context
├── Content: Current state snapshot (intent status, active stage, recent actions)
└── Audience annotation: assistant (context for the model, not shown to user)

Message 2 (role: assistant)
├── Purpose: Prime model intent
├── Content: Acknowledgment + statement of what it will do
└── Short — 1-2 sentences

Message 3 (role: user)
├── Purpose: Actionable instructions
├── Content: Full instructions with:
│   ├── Stage metadata (STAGE.md content, hat definitions)
│   ├── Elaboration mode (collaborative vs autonomous)
│   ├── Available MCP tools for this action
│   ├── Completion criteria from active unit
│   └── Anti-patterns and RFC 2119 requirements
└── Audience annotation: assistant
```

#### Variations by Prompt Type

**State-reading prompts** (dashboard, capacity, release-notes): Return 1 message — user role with formatted state data. No assistant priming needed.

**Action prompts** (run, new, review): Full 3-message pattern with dynamic context.

**Dispatch prompts** (backlog, seed): First message includes subcommand routing based on arguments.

### Prompt Grouping & Display Order

MCP clients typically display prompts in the order returned by `prompts/list`. Ordering:

1. Core workflow (most used): new, run, refine, review, reflect
2. Supporting: autopilot, composite, setup, migrate, scaffold, operate, triggers, dashboard, backlog
3. Complex/niche: adopt, quick, seed, ideate, pressure-testing, capacity, release-notes

### Error Response Patterns

| Error Condition | MCP Error Code | Message Pattern |
| --- | --- | --- |
| Unknown prompt name | -32602 (InvalidParams) | `Unknown prompt: {name}` |
| Missing required argument | -32602 (InvalidParams) | `Missing required argument: {arg} for prompt {name}` |
| Invalid argument value | -32602 (InvalidParams) | `Invalid value for {arg}: {value}. Expected: {expected}` |
| No active intent (when required) | -32602 (InvalidParams) | `No active intent found. Create one with /haiku:new` |
| Intent not found | -32602 (InvalidParams) | `Intent not found: {slug}` |

All errors use MCP's `McpError` class with `ErrorCode.InvalidParams` (-32602) since prompt argument errors are parameter validation failures.
