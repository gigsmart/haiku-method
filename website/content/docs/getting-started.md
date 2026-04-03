---
title: Getting Started
description: Install H·AI·K·U, create your first intent, and deliver working software
order: 2
---

Get H·AI·K·U running in your project and deliver your first feature. H·AI·K·U is the software development profile of the [H·AI·K·U Method](https://haikumethod.ai) (Human AI Knowledge Unification).

## Installation

```
/plugin marketplace add thebushidocollective/ai-dlc
/plugin install haiku --scope project
```

## The Two Commands You Need

| Command | What it does |
|---------|--------------|
| `/haiku:new` | Create an intent — define what you're building and select a studio |
| `/haiku:run` | Run the stage pipeline — autonomous execution through each stage |

## Your First Feature

### Step 1: Create an Intent

```
/haiku:new
```

The AI guides you through:

1. **What** you want to build
2. **Studio selection** — software (git + PRs) or ideation (filesystem + local delivery)
3. **Stage mode** — single-stage (all disciplines merged) or multi-stage (sequential progression)
4. **Success criteria** — how you'll know it's done
5. **Units** — how to break down the work (for complex features)

Example session:

```
User: /haiku:new
AI: What do you want to build?
User: Add user authentication with email/password
AI: [Asks clarifying questions via interactive prompts]
AI: Here are the success criteria I captured...
AI: Intent created! Run /haiku:run to start.
```

### Step 2: Run Stages

```
/haiku:run
```

The AI now works through the stages defined by your studio. For the **software studio**, stages progress through:

1. **Inception** — Understand the problem, decompose into units
2. **Development** — Plan, build, and review each unit
3. **Security** — Threat modeling and vulnerability assessment (if applicable)
4. **Operations** — Deployment and monitoring (if applicable)

Each stage has its own hats (roles) defined as files in the stage's `hats/` directory. The AI transitions through hats automatically, running quality gates at each step.

You can watch, intervene if needed, or let it run.

### Step 3: Continue After Context Resets

If the session runs long, the AI will suggest clearing context:

```
AI: "Context getting full. Run /clear to continue."
User: /clear
User: /haiku:run
```

Your progress is preserved — the AI picks up where it left off.

## Key Commands

| Command | Purpose |
|---------|---------|
| `/haiku:new` | Create a new intent |
| `/haiku:run` | Run the stage pipeline |
| `/haiku:review` | Pre-delivery code review — catches issues before external CI/bots |
| `/haiku:resume [slug]` | Resume an existing intent after a break |
| `/haiku:quick` | Quick mode for small tasks — skip full pipeline |
| `/haiku:reset` | Abandon current work and start fresh |
| `/haiku:autopilot` | Full autonomous workflow — create, run, review, deliver |

## Example: Complete Workflow

```
User: /haiku:new
AI: What do you want to build?
User: Add a dark mode toggle to the settings page
AI: [Guides through requirements and criteria]
AI: Intent created!

User: /haiku:run
AI: [Works autonomously through inception → development → review]
AI: Intent complete! All criteria satisfied.

User: Great, let's create a PR
AI: [Creates PR with summary of changes]
```

## After Delivery

Once your intent is complete, manage ongoing operational tasks with `/haiku:operate`. Define scheduled jobs, reactive handlers, and human review processes as spec files in `.haiku/{intent}/operations/`. See the [Operations Guide](/docs/operations-guide/) for details.

## What's Different from AI-DLC?

If you used AI-DLC before the H·AI·K·U rebrand, see the [Migration Guide](/docs/migration/) for a complete map of changes. The key shifts:

- **Studios** replace workflows — named lifecycle templates that define which stages run
- **Stages** replace standalone hats — each stage has its own `hats/` directory with per-hat files
- **Persistence adapters** — git (PRs) or filesystem (local), configured per studio
- `.haiku/` replaces `.ai-dlc/` as the project directory
- `/haiku:*` replaces `/ai-dlc:*` as the command prefix

## Next Steps

- [Core Concepts](/docs/concepts/) — Understand intents, units, studios, and stages
- [Studios](/docs/studios/) — Learn about lifecycle templates
- [Stages](/docs/stages/) — Understand the stage-based model
- [CLI Reference](/docs/cli-reference/) — Complete command reference
- [Installation](/docs/installation/) — Detailed setup
