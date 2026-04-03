---
title: Quick Start
description: Get started with AI-DLC in 5 minutes
order: 2
---

Get AI-DLC running in your project and complete your first feature. AI-DLC is the software development profile of the [H•AI•K•U Method](https://haikumethod.ai) (Human AI Knowledge Unification).

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

AI-DLC uses just two main commands:

| Command | What it does |
|---------|--------------|
| `/ai-dlc:elaborate` | Define what you're building and how you'll know it's done |
| `/ai-dlc:execute` | Start the autonomous execution loop |

## Your First Feature

### Step 1: Elaborate

```
/ai-dlc:elaborate
```

The AI guides you through:
1. **What** you want to build
2. **Success criteria** - how you'll know it's done
3. **Units** - how to break down the work (for complex features)

Example session:
```
User: /ai-dlc:elaborate
AI: What do you want to build?
User: Add user authentication with email/password
AI: [Asks clarifying questions via interactive prompts]
AI: Here are the success criteria I captured...
AI: Elaboration complete! Run /ai-dlc:execute to start.
```

### Step 2: Execute

```
/ai-dlc:execute
```

The AI now works autonomously:
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
User: /ai-dlc:execute
```

Your progress is preserved - the AI picks up where it left off.

## Other Commands

| Command | Purpose |
|---------|---------|
| `/ai-dlc:review` | Pre-delivery code review — catches issues before external CI/bots |
| `/ai-dlc:resume [slug]` | Resume an existing intent after a break |
| `/ai-dlc:reset` | Abandon current work and start fresh |
| `/methodology [question]` | Ask questions about AI-DLC |

## Example: Complete Workflow

```
User: /ai-dlc:elaborate
AI: What do you want to build?
User: Add a dark mode toggle to the settings page
AI: [Guides through requirements and criteria]
AI: Elaboration complete!

User: /ai-dlc:execute
AI: [Works autonomously through planner → builder → reviewer]
AI: Intent complete! All criteria satisfied.

User: Great, let's create a PR
AI: [Creates PR with summary of changes]
```

## After Construction

Once your intent is complete, manage ongoing operational tasks with `/ai-dlc:operate`. Define scheduled jobs, reactive handlers, and human review processes as spec files in `.ai-dlc/{intent}/operations/`. See the [Operations Guide](/docs/operations-guide/) for details.

## Next Steps

- [Elaboration Guide](/docs/elaboration/) - What to expect during `/ai-dlc:elaborate`
- [Core Concepts](/docs/concepts/) - Understand intents, units, and hats
- [Workflows](/docs/workflows/) - Learn about TDD, adversarial, and hypothesis workflows
- [Installation](/docs/installation/) - Detailed setup including Han CLI
- [Operations Guide](/docs/operations-guide/) - Manage ongoing operational tasks
