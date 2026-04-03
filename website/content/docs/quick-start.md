---
title: Quick Start
description: Get started with H·AI·K·U in 5 minutes
order: 2
---

Get H·AI·K·U running in your project and complete your first feature.

## Installation

**Option 1: Via Claude Code (recommended)**
```
/plugin marketplace add thebushidocollective/ai-dlc
/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project
```

**Option 2: Via Han**
```bash
npx han plugin install thebushidocollective/ai-dlc --scope project
```

## The Two Commands You Need

H·AI·K·U uses just two main commands:

| Command | What it does |
|---------|--------------|
| `/haiku:new` | Define what you're building and how you'll know it's done |
| `/haiku:run` | Start the autonomous execution loop through the stage pipeline |

## Your First Feature

### Step 1: Create an Intent

```
/haiku:new
```

The AI guides you through:
1. **What** you want to build
2. **Success criteria** - how you'll know it's done
3. **Units** - how to break down the work (for complex features)

Example session:
```
User: /haiku:new
AI: What do you want to build?
User: Add user authentication with email/password
AI: [Asks clarifying questions via interactive prompts]
AI: Here are the success criteria I captured...
AI: Intent created! Run /haiku:run to start.
```

### Step 2: Run

```
/haiku:run
```

The AI now works autonomously through the stage pipeline:
- Creates a feature branch
- Plans the implementation
- Builds to meet your criteria
- Reviews its own work
- Continues until all criteria are satisfied

You can watch, intervene if needed, or let it run.

### Step 3: Continue After Context Resets

If the session runs long, the AI will suggest clearing context:
```
AI: "Context getting full. Run /clear to continue."
User: /clear
User: /haiku:run
```

Your progress is preserved - the AI picks up where it left off.

## Other Commands

| Command | Purpose |
|---------|---------|
| `/haiku:review` | Pre-delivery code review -- catches issues before external CI/bots |
| `/haiku:resume [slug]` | Resume an existing intent after a break |
| `/haiku:reset` | Abandon current work and start fresh |
| `/methodology [question]` | Ask questions about H·AI·K·U |

## Example: Complete Workflow

```
User: /haiku:new
AI: What do you want to build?
User: Add a dark mode toggle to the settings page
AI: [Guides through requirements and criteria]
AI: Intent created!

User: /haiku:run
AI: [Works autonomously through planner → builder → reviewer]
AI: Intent complete! All criteria satisfied.

User: Great, let's create a PR
AI: [Creates PR with summary of changes]
```

## After Construction

Once your intent is complete, manage ongoing operational tasks with `/haiku:operate`. Define scheduled jobs, reactive handlers, and human review processes as spec files in `.haiku/{intent}/operations/`. See the [Operations Guide](/docs/operations-guide/) for details.

## Next Steps

- [Inception & Planning](/docs/elaboration/) - What to expect during `/haiku:new`
- [Core Concepts](/docs/concepts/) - Understand intents, units, and stages
- [Studios & Stages](/docs/studios/) - Learn about studios and their stage pipelines
- [Installation](/docs/installation/) - Detailed setup including Han CLI
- [Operations Guide](/docs/operations-guide/) - Manage ongoing operational tasks
- [Migration](/docs/migration/) - Migrating from AI-DLC to H·AI·K·U
