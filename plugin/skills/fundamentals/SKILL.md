---
name: fundamentals
description: Use when understanding AI-DLC methodology fundamentals. Covers core principles, iteration patterns, hat-based workflows, and the philosophy of human-AI collaboration in software development.
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Glob
---

# AI-DLC Fundamentals

AI-DLC (AI-Driven Development Lifecycle) is a methodology for collaborative human-AI software development. It addresses the fundamental challenge of maintaining productive AI sessions across context window limitations.

## Core Philosophy

### The Context Problem

AI coding assistants face a fundamental limitation: context windows are finite. As sessions grow longer:
- Context accumulates (code, errors, conversation history)
- Signal-to-noise ratio decreases
- AI may "forget" earlier decisions or repeat mistakes
- Quality of suggestions degrades

Traditional approaches try to work around this by:
- Larger context windows (expensive, diminishing returns)
- Better summarization (lossy, loses nuance)
- Retrieval augmentation (latency, relevance issues)

### The AI-DLC Solution

AI-DLC takes a different approach: **embrace context resets as a feature, not a bug**.

Instead of fighting context limits:
1. **Plan for iterations** - Work in deliberate cycles
2. **Preserve state externally** - Store intent, criteria, and learnings outside the context
3. **Fresh starts are good** - Each iteration begins with clean context + injected state
4. **Files are memory** - Persist what matters between sessions

## The Three Pillars

### 1. Backpressure Over Prescription

Traditional development processes prescribe steps:
- "Write tests first"
- "Get code review before merge"
- "Run linting before commit"

These become checkbox exercises that teams learn to game.

AI-DLC uses **backpressure** instead:
- Quality gates that **block progress** until satisfied
- Automated enforcement via hooks
- The AI learns to satisfy constraints, not follow scripts

Example backpressure:
```bash
# Stop hook that fails if tests don't pass
bun test || exit 1
```

The AI can't complete work until tests pass. It learns to write tests and fix failures, not because a process document says to, but because the system won't let it proceed otherwise.

*For detailed backpressure guidance, see the `backpressure` skill.*

### 2. Completion Criteria Enable Autonomy

Clear criteria unlock autonomous operation:

**Vague criteria (bad):**
- "Make the login work"
- "Improve performance"
- "Fix the bug"

**Clear criteria (good):**
- "Users can log in with Google OAuth"
- "API response time < 200ms for 95th percentile"
- "Error message displays when password is incorrect"

With clear criteria:
- AI can self-verify progress
- Human review becomes targeted ("Did you meet criteria X?")
- Iteration loops have clear exit conditions

*For detailed criteria guidance, see the `completion-criteria` skill.*

### 3. Files Are Memory

Context windows reset. Files persist.

AI-DLC stores state in files:
- `intent.md` - What we're building
- `completion-criteria.md` - How we know it's done
- `discovery.md` - Domain discovery findings from elaboration
- `scratchpad.md` - Learnings and notes
- `blockers.md` - What's blocking progress
- `iteration.json` - Current hat, iteration count, workflow state

These files are:
- Injected at session start (via hooks)
- Updated during work (via `han keep`)
- Preserved across `/clear` commands

## The Iteration Loop

```
┌────────────────────────────────────────────────┐
│  SessionStart Hook                              │
│  - Load state from han keep                     │
│  - Inject context (hat, intent, criteria)       │
│  - Display previous learnings                   │
└────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Work Phase                                     │
│  - AI operates with injected context            │
│  - Backpressure guides quality                  │
│  - Progress saved to han keep                   │
└────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Stop Hook                                      │
│  - Increment iteration count                    │
│  - Prompt for /clear                            │
└────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  User runs /clear                               │
│  - Context window wiped                         │
│  - Return to SessionStart                       │
└────────────────────────────────────────────────┘
```

Each iteration:
1. Starts fresh (clean context)
2. Inherits state (injected from files)
3. Makes progress (guided by criteria and backpressure)
4. Saves state (for next iteration)

## Hat-Based Workflows (Bolts)

Different phases of work require different mindsets. AI-DLC uses "hats" to formalize this.

**Terminology mapping:** In the AI-DLC paper, a **Bolt** is the smallest iteration cycle — one pass through the hat workflow for a unit. The plugin implements Bolts as hat sequences: each unit progresses through its workflow hats (e.g., planner → builder → reviewer), with reviewer rejection cycling back to the previous hat. One complete pass = one Bolt. Multiple rejections = multiple Bolts for that unit.

### Default Workflow

Elaboration (`/elaborate`) is a separate pre-construction phase. The construction workflow starts after elaboration is complete:

```
planner → builder → reviewer
```

| Hat | Focus |
|-----|-------|
| Planner | Plan this iteration (Bolt) |
| Builder | Implement to spec |
| Reviewer | Verify quality — approve completes the Bolt, reject starts a new one |

### Hat Transitions

- `/advance` - Move to next hat in workflow (handles completion at the last hat)
- `/fail` - Return to previous hat (e.g., reviewer finds issues)

### Custom Workflows

Teams can define custom workflows in `.ai-dlc/workflows.yml` and custom hats in `.ai-dlc/hats/`:

```yaml
# .ai-dlc/workflows.yml
research-first:
  description: Research before building
  hats: [researcher, architect, builder, reviewer]
```

```markdown
<!-- .ai-dlc/hats/researcher.md -->
---
name: "🔍 Researcher"
description: Investigates the problem space before implementing
---

# Researcher

## Overview
Investigate the problem space before implementing.
Gather context, explore options, document findings.
```

## State Management

### Scoped Storage

AI-DLC uses `han keep` for state persistence:

| Scope | Use Case |
|-------|----------|
| `--branch` | Per-branch iteration state (default) |
| `--repo` | Cross-branch project knowledge |
| `--global` | User preferences |

### State Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `iteration.json` | Hat, iteration count, status | Commands |
| `intent.md` | What we're building | /elaborate |
| `completion-criteria.md` | How we know it's done | /elaborate |
| `discovery.md` | Domain discovery findings | /elaborate |
| `current-plan.md` | Plan for this iteration | Planner hat |
| `scratchpad.md` | Learnings and notes | AI during work |
| `blockers.md` | What's blocking progress | AI when stuck |

## Integration with Han

### Hooks

AI-DLC uses Han's hook system:

- **SessionStart** - Inject context from han keep
- **Stop** - Enforce iteration pattern, prompt for /clear

### Commands

AI-DLC provides slash commands:

- `/elaborate` - Start mob elaboration
- `/construct` - Run autonomous construction loop
- `/advance` - Next hat (internal)
- `/fail` - Previous hat (internal)
- `/resume` - Resume lost intent
- `/reset` - Clear state

### CLI Commands

State is managed via han keep CLI commands:

- `han keep save <key> <content>` - Persist state
- `han keep load <key> --quiet` - Retrieve state
- `han keep list` - List keys
- `han keep delete <key>` - Remove key

## Best Practices

### For Clear Criteria

1. **Be specific** - "Users can log in" not "Authentication works"
2. **Be measurable** - Can it be automatically verified?
3. **Be atomic** - One criterion, one thing to check
4. **Include negative cases** - "Error shown on invalid password"

### For Effective Iterations

1. **Keep iterations focused** - One bolt of work per cycle
2. **Save state early** - Don't wait until the end
3. **Document blockers** - Help next iteration avoid the same issues
4. **Trust the process** - /clear is your friend, not your enemy

### For Hat Transitions

1. **Advance when done** - Don't linger in a hat
2. **Fail fast** - If reviewer finds issues, go back immediately
3. **Respect the workflow** - Don't skip hats
4. **Customize if needed** - Default workflow isn't mandatory

## Anti-Patterns

### Fighting the Context Reset

❌ "Let me try to fit everything in one session"
✅ Embrace iterations, trust state persistence

### Vague Criteria

❌ "Make it better"
✅ "Response time < 200ms for 95th percentile"

### Skipping Elaboration

❌ "I know what to build, let's just start"
✅ Take time to define clear criteria upfront

### Ignoring Blockers

❌ "I'll figure it out next time"
✅ Document blockers explicitly so next iteration can address them

## Summary

AI-DLC is a methodology that:
1. **Embraces context limits** through deliberate iteration
2. **Uses backpressure** instead of prescription
3. **Enables autonomy** through clear completion criteria
4. **Persists state** in files, not context
5. **Structures work** through hat-based workflows

The result is more productive AI-assisted development with fewer repeated mistakes and clearer progress toward goals.
