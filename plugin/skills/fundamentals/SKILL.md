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
- Updated during work (via `dlc_state_save`/`dlc_state_load`)
- Preserved across `/clear` commands

## The Iteration Loop

```
┌────────────────────────────────────────────────┐
│  SessionStart Hook                              │
│  - Load state from .ai-dlc/{slug}/state/         │
│  - Inject context (hat, intent, criteria)       │
│  - Display previous learnings                   │
└────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Work Phase                                     │
│  - AI operates with injected context            │
│  - Backpressure guides quality                  │
│  - Progress saved to .ai-dlc/{slug}/state/      │
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

Elaboration (`/ai-dlc:elaborate`) is a separate pre-execution phase. The execution workflow starts after elaboration is complete:

```
planner → builder → reviewer
```

| Hat | Focus |
|-----|-------|
| Planner | Plan this iteration (Bolt) |
| Builder | Implement to spec |
| Reviewer | Verify quality — approve completes the Bolt, reject starts a new one |

### Hat Transitions

Hat transitions are performed by reading and executing the internal skill definitions directly:

- **Advance** (move to next hat): Read `plugin/skills/execute/subskills/advance/SKILL.md` and execute it
- **Fail** (return to previous hat): Read `plugin/skills/execute/subskills/fail/SKILL.md` and execute it

These are internal skills (`user-invocable: false`) — not registered slash commands.

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

## Iteration Passes

Passes are typed disciplinary iterations that focus each unit through a specific lens. They allow cross-functional collaboration where design or product artifacts precede code.

### Built-in Passes

| Pass | Description |
|------|-------------|
| `design` | Visual and interaction design; produces mockups, tokens, component specs |
| `product` | Behavioral specification and gap analysis; produces acceptance criteria |
| `dev` | Working implementation; produces tested, deployable code |

### Single-Pass vs Multipass

Most work needs only a dev pass — this is the default when `default_passes` is empty (`[]`). Multipass is for cross-functional collaboration where design or product artifacts should precede code. Example: `[design, product, dev]` runs three passes in sequence, each with its own units and workflow.

### Custom Passes

Create a pass definition at `.ai-dlc/passes/{name}.md` with frontmatter and body instructions:

```markdown
---
name: accessibility
description: Accessibility audit and remediation
available_workflows: [default]
default_workflow: default
---

# Accessibility Pass

Audit all user-facing components for WCAG 2.1 AA compliance...
```

The `available_workflows` field constrains which execution workflows the pass supports. The `default_workflow` is used when the requested workflow is not in the available list.

### Augmenting Built-in Passes

To tailor a built-in pass to your project, create `.ai-dlc/passes/{name}.md` where `{name}` matches a built-in pass (e.g., `design`, `product`, `dev`). The project file's body is appended under a `## Project Augmentation` heading when the pass instructions are loaded. This lets you add project-specific guidance without replacing the built-in defaults.

### Configuration

- **Global default:** Set `default_passes` in `.ai-dlc/settings.yml` (e.g., `default_passes: [design, dev]`)
- **Per-intent override:** Set `passes` in the intent frontmatter or intent-level `settings.yml`
- **Empty array** (`[]`) means a single implicit dev pass — the default for most work

## State Management

### Scoped Storage

AI-DLC uses file-based state persistence in `.ai-dlc/{slug}/state/`:

| Scope | Location |
|-------|----------|
| Intent state | `.ai-dlc/{slug}/state/` — iteration state, blockers, plans |
| Intent artifacts | `.ai-dlc/{slug}/` — intent.md, unit files, discovery.md |
| Project config | `.ai-dlc/settings.yml` — project-level settings |

### State Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `iteration.json` | Hat, iteration count, status | Commands |
| `intent.md` | What we're building | /ai-dlc:elaborate |
| `completion-criteria.md` | How we know it's done | /ai-dlc:elaborate |
| `discovery.md` | Domain discovery findings | /ai-dlc:elaborate |
| `current-plan.md` | Plan for this iteration | Planner hat |
| `scratchpad.md` | Learnings and notes | AI during work |
| `blockers.md` | What's blocking progress | AI when stuck |

## Integration with Claude Code

### Hooks

AI-DLC uses Claude Code's native hook system:

- **SessionStart** - Inject context from state files
- **Stop** - Enforce iteration pattern, prompt for /clear

### Commands

AI-DLC provides slash commands:

- `/ai-dlc:elaborate` - Start mob elaboration
- `/ai-dlc:execute` - Run autonomous execution loop
- advance (internal) - Read `plugin/skills/execute/subskills/advance/SKILL.md` and execute it
- fail (internal) - Read `plugin/skills/execute/subskills/fail/SKILL.md` and execute it
- `/ai-dlc:resume` - Resume lost intent
- `/ai-dlc:reset` - Clear state

### CLI Commands

State is managed via foundation library functions:

- `dlc_state_save "$INTENT_DIR" "<key>" "<content>"` - Persist state
- `dlc_state_load "$INTENT_DIR" "<key>"` - Retrieve state
- `dlc_state_list "$INTENT_DIR"` - List keys
- `dlc_state_delete "$INTENT_DIR" "<key>"` - Remove key

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
