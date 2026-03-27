# AI-DLC

AI-DLC methodology plugin for Claude Code. Provides iterative AI-driven development with convention-based artifacts, hat-based workflows, and automatic context preservation.

## Overview

AI-DLC (AI-Driven Development Lifecycle) is a methodology for collaborative human-AI software development. It addresses the fundamental challenge of maintaining productive AI sessions across context window limitations through **committed artifacts** and **ephemeral state**.

AI-DLC structures work into four phases — Elaboration, Execution, Operation, and Reflection — implemented with software-specific tooling: git worktrees, automated tests/lint/types as quality gates, pull requests, and deployment workflows.

**Key Principles:**

- **Embrace context resets** - `/clear` is a feature, not a bug
- **Backpressure over prescription** - Quality gates that block, not checklists to check
- **Completion criteria enable autonomy** - Clear criteria = less human oversight needed
- **Artifacts are memory** - Intent and progress persist in committed files

> **Learn More:** Read the full [AI-DLC Paper](https://ai-dlc.dev/papers/ai-dlc-2026) for the complete methodology, including runbooks for reimagining the SDLC, roles, and adoption paths.

## Installation

```
# Install via Claude Code
/plugin marketplace add thebushidocollective/ai-dlc
/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project
```

```bash
# Or via Han (must be npx, project-scoped)
npx han plugin install thebushidocollective/ai-dlc --scope project
```

### Prerequisites

This plugin uses [Han CLI](https://github.com/thebushidocollective/han) for state management (`han keep` commands).

Install Han first:
```bash
curl -fsSL https://han.guru/install.sh | bash
```

## Terminology

| Term | Definition |
|------|------------|
| **Intent** | Top-level goal (e.g., "Add OAuth login") - the overall objective |
| **Unit** | Discrete work package within an Intent - a focused piece of the work |
| **Bolt** | A single iteration/session bounded by `/clear` cycles - one focused work period |
| **Hat** | Role/responsibility for a phase of work (e.g., Builder, Reviewer) |

## The Unit Model

AI-DLC organizes work into **Intents** and **Units**:

```
.ai-dlc/
  add-oauth-login/              # Intent (slugified name)
    intent.md                   # Intent definition
    unit-01-setup-provider.md   # Unit 1
    unit-02-callback-handler.md
    unit-03-session-management.md
```

### Intent Files

Define what you're building with clear completion criteria:

```markdown
---
workflow: default
git:
  change_strategy: unit
  auto_merge: true
  auto_squash: false
announcements: [changelog]
status: active
epic: ""
---

# Add OAuth Login

## Problem
Application lacks authentication.

## Solution
Add Google OAuth authentication to the application.

## Success Criteria
- [ ] OAuth flow redirects to Google
- [ ] Callback handles token exchange
- [ ] User session created on success
- [ ] Error states handled gracefully
- [ ] All tests pass
```

### Unit Files

Break work into discrete units with rich frontmatter:

```markdown
---
status: completed
depends_on: []
branch: ai-dlc/add-oauth-login/01-setup-provider
discipline: backend
workflow: ""
ticket: PROJ-123
---

# Unit 01: Setup OAuth Provider

## Description
Configure Google OAuth provider with credentials and scopes.

## Success Criteria
- [x] OAuth client ID configured
- [x] Redirect URI registered
- [x] Required scopes defined

## Notes
Used environment variables for credentials as per security guidelines.
```

## Quick Start

### 1. Start with Elaboration

```
User: /elaborate
```

Work with the AI to define:

- **Workflow** - Which development pattern to use
- **Intent** - What you're building (saved to `.ai-dlc/{slug}/intent.md`)
- **Units** - How to break down the work
- **Completion Criteria** - How you'll know it's done

### 2. Run the Execution Loop

```
User: /execute
```

The AI autonomously:

- Creates a branch following conventions (`ai-dlc/{intent}/{unit-number}-{unit-slug}`)
- Executes the current hat's responsibilities
- Uses backpressure (tests, lint, types) to guide work
- Updates unit frontmatter as work progresses
- Advances through units via DAG-based dependency ordering

### 3. Continue After Each Session

```
Stop hook: "Run /execute to continue"
User: /execute
```

Context is preserved across sessions:

- **Committed**: Intent, Units, progress in `.ai-dlc/`
- **Ephemeral**: Current hat, scratchpad in `han keep`

### 4. Operate and Reflect

After execution completes:

```
User: /operate    # Execute operational tasks (deployments, config, etc.)
User: /reflect    # Analyze the cycle — capture learnings and recommendations
```

## User Commands

| Command | Purpose |
|---------|---------|
| `/elaborate` | Mob elaboration - define intent, units, and criteria |
| `/execute` | Run the autonomous execution loop |
| `/operate` | Manage operational tasks for a completed intent |
| `/reflect` | Analyze a completed cycle, capture learnings |
| `/refine` | Amend intent or unit specs mid-execution |
| `/resume` | Resume an intent when ephemeral state is lost |
| `/setup` | Configure AI-DLC for the project (auto-detects VCS, CI/CD, providers) |
| `/reset` | Abandon current unit and clear ephemeral state |
| `/cleanup` | Remove orphaned AI-DLC worktrees |

## Conventions

### Branch Naming

```
ai-dlc/{intent-slug}/{unit-number}-{unit-slug}
```

Examples:

- `ai-dlc/add-oauth-login/01-setup-provider`
- `ai-dlc/fix-memory-leak/01-identify-source`
- `ai-dlc/refactor-api/02-extract-service`

### File Naming

- Intent: `intent.md` (lowercase)
- Units: `unit-{NN}-{slug}.md` (zero-padded number)

### Frontmatter Fields

**Intent (`intent.md`):**

| Field | Description |
|-------|-------------|
| `workflow` | Workflow name (default, adversarial, design, etc.) |
| `git.change_strategy` | `unit` or `intent` - branching strategy |
| `git.auto_merge` | Auto-merge PRs on approval |
| `git.auto_squash` | Squash commits on merge |
| `announcements` | List of announcement types on completion |
| `status` | `active`, `completed`, `blocked`, `abandoned` |
| `epic` | Issue tracker epic reference |

**Unit (`unit-{NN}-{slug}.md`):**

| Field | Description |
|-------|-------------|
| `status` | `pending`, `active`, `completed`, `blocked`, `abandoned` |
| `depends_on` | List of unit dependencies (DAG ordering) |
| `branch` | Git branch name |
| `discipline` | `backend`, `frontend`, `documentation`, etc. |
| `workflow` | Per-unit workflow override (optional) |
| `ticket` | Issue/ticket reference |

## Named Workflows

Select a workflow during `/elaborate`:

| Workflow | Description | Hats |
|----------|-------------|------|
| **default** | Standard development | planner, builder, reviewer |
| **adversarial** | Security-focused with Red/Blue team | planner, builder, red-team, blue-team, reviewer |
| **design** | UI/UX units producing design artifacts | planner, designer, reviewer |
| **hypothesis** | Scientific debugging | observer, hypothesizer, experimenter, analyst |
| **tdd** | Test-Driven Development | test-writer, implementer, refactorer, reviewer |

## Hats

All hats follow the [Agent SOP format](https://github.com/strands-agents/agent-sop) with:

- **Overview** - What the hat does
- **Parameters** - Required inputs
- **Prerequisites** - Required context and state
- **Steps** - RFC 2119 keywords (MUST, SHOULD, MAY)
- **Success Criteria** - Checklist for completion
- **Error Handling** - Common issues and resolutions

### Available Hats

| Hat | Focus |
|-----|-------|
| Planner | Plan what to tackle this iteration |
| Builder | Implement according to plan and criteria |
| Reviewer | Verify implementation meets criteria |
| Designer | Produce UI/UX design artifacts |
| Test Writer | Write failing tests first |
| Implementer | Make tests pass with minimal code |
| Refactorer | Improve code while keeping tests green |
| Red Team | Attack - find vulnerabilities |
| Blue Team | Defend - fix vulnerabilities |
| Observer | Gather data about a bug |
| Hypothesizer | Form theories about the cause |
| Experimenter | Test hypotheses systematically |
| Analyst | Evaluate results and implement fix |

> **Note:** Cross-cutting integration validation runs automatically after all units are merged (via the internal `/integrate` skill), not as a hat in the per-unit workflow. It verifies that units work together and intent-level success criteria are met.

## State Management

### Committed Artifacts (`.ai-dlc/`)

Persisted across sessions, branches, and team members:

| File | Purpose |
|------|---------|
| `intent.md` | What we're building, overall completion criteria |
| `unit-{NN}-*.md` | Individual work units with their own criteria |
| `discovery.md` | Domain discovery notes from elaboration |

### Ephemeral State (`han keep`)

Session-scoped, cleared on `/reset`:

| Key | Purpose |
|-----|---------|
| `iteration.json` | Current hat, iteration count, status |
| `scratchpad.md` | Learnings and progress notes |
| `blockers.md` | Documented blockers |

> **Note:** Both commands and hooks use `han keep` CLI commands (`han keep save`, `han keep load`, `han keep delete`, `han keep list`) for state management.

## Customization

### Hat Resolution Order

Hats are resolved in this order:

1. **Project override**: `.ai-dlc/hats/{hat}.md` (in your repo)
2. **Plugin built-in**: `hats/{hat}.md`

This allows you to customize any hat while falling back to defaults.

### Custom Hats

Create `.ai-dlc/hats/` in your project to override or add hats:

```markdown
<!-- .ai-dlc/hats/researcher.md -->
---
name: "Researcher"
description: "Investigate before implementing."
---

# Researcher

## Overview

Investigate before implementing. Research existing solutions and make recommendations.

## Steps

1. Research existing solutions
   - You MUST search for prior art
   - You SHOULD document 3+ alternatives
   - **Validation**: Options documented

2. Evaluate trade-offs
   - You MUST compare against requirements
   - You SHOULD consider maintenance burden
   - **Validation**: Recommendation made

## Success Criteria

- [ ] Existing solutions documented
- [ ] Trade-offs analyzed
- [ ] Recommendation provided with rationale
```

### Custom Workflows

Create `.ai-dlc/workflows.yml` to define custom workflows:

```yaml
workflows:
  research-first:
    description: Research before building
    hats: [elaborator, researcher, planner, builder, reviewer]
```

## Reference Skills

These internal skills provide AI-DLC knowledge to the agent (not user-invocable):

- `fundamentals` - Core principles and philosophy
- `completion-criteria` - Writing effective criteria
- `backpressure` - Using quality gates effectively
- `blockers` - Documenting blockers properly

## Error Recovery

### Common Issues

| Problem | Solution |
|---------|----------|
| **Invalid iteration.json** | Run `/reset` to clear corrupted state |
| **Stuck in wrong hat** | Edit `iteration.json` via `han keep load/save` or `/reset` |
| **Hook not injecting context** | Verify `han` and `jq` are installed and in PATH |
| **Missing hat instructions** | Check hat file exists in `.ai-dlc/hats/` or plugin's `hats/` |
| **Orphaned ephemeral state** | Run `/reset` to clear, recommit intent if needed |
| **Orphaned worktrees** | Run `/cleanup` to remove stale worktrees |

### Manual State Inspection

```bash
# View current iteration state
han keep load --branch iteration.json

# View scratchpad
han keep load --branch scratchpad.md

# Clear all ephemeral state (same as /reset)
han keep clear --branch
```

### Recovery from Context Loss

If you `/clear` without running the stop hook:

1. Your committed artifacts (`.ai-dlc/`) are safe
2. Ephemeral state persists in `han keep`
3. Just run `/execute` to continue

## Development

This is a bun workspace monorepo with the plugin at root and documentation site in `website/`.

```bash
# Install dependencies
bun install

# Run website locally
bun run dev

# Lint/format
bun run lint
bun run format
```

## Learn More

### The AI-DLC Paper

This plugin implements the [AI-DLC methodology](https://ai-dlc.dev/papers/ai-dlc-2026). The paper covers:

- Core principles and philosophy
- Reimagining the SDLC for AI collaboration
- Adoption paths from Waterfall, Agile, or greenfield
- Building organizational trust

## License

Apache-2.0 - See [LICENSE](LICENSE) for details.
