---
description: Continue the AI-DLC execution loop - autonomous build/review cycles until completion
argument-hint: "[intent-slug] [unit-name]"
disable-model-invocation: true
---

## Name

`ai-dlc:execute` - Run the autonomous AI-DLC execution loop.

## Synopsis

```
/execute [intent-slug] [unit-name]
```

## Description

**User-facing command** - Continue the AI-DLC autonomous execution loop.

**Two modes:**
- `/execute` — DAG-driven, behavior depends on `change_strategy`
- `/execute unit-01-backend` — target a specific unit (precheck deps first)
- `/execute my-feature unit-01-backend` — with explicit intent slug

This command resumes work from the current hat and runs until:
- All units complete (`/advance` completes the intent automatically)
- User intervention needed (all units blocked)
- Session exhausted (Stop hook instructs agent to call `/execute`)

**User Flow:**
```
User: /elaborate           # Once - define intent, criteria, and workflow
User: /execute             # Kicks off autonomous loop
...AI works autonomously across all units...
...session exhausts, Stop hook fires...
Agent: /execute            # Agent continues (subagents have clean context)
...repeat until all units complete...
AI: Intent complete! [summary]
```

**Important:**
- Fully autonomous - Agent continues across units without stopping
- Subagents have clean context - No `/clear` needed between iterations
- User intervention - Only required when ALL units are blocked
- State preserved - Progress saved in han keep between sessions

**CRITICAL: No Questions During Execution**

During the execution loop, you MUST NOT:
- Use AskUserQuestion tool
- Ask clarifying questions
- Request user decisions
- Pause for user feedback

This breaks han's hook logic. The execution loop must be fully autonomous.

If you encounter ambiguity:
1. Make a reasonable decision based on available context
2. Document the assumption in your work
3. Let the reviewer hat catch issues on the next pass

If truly blocked (cannot proceed without user input):
1. Document the blocker clearly in `han keep save blockers.md`
2. Stop the loop naturally (don't call /advance)
3. The Stop hook will alert the user that human intervention is required

## Implementation

This skill uses the same implementation as `/construct`. See `construct/SKILL.md` for the full implementation details.

The only differences are:
- User-facing terminology uses "execution" instead of "construction"
- The Stop hook references `/execute` instead of `/construct`

All internal state keys, workflows, and hat mechanics are identical.
