---
name: fundamentals
description: Use when understanding H·AI·K·U methodology fundamentals. Covers core principles, iteration patterns, hat-based workflows, and the philosophy of human-AI collaboration in software development.
user-invocable: false
allowed-tools:
  - Read
  - Grep
  - Glob
---

# H·AI·K·U Fundamentals

H·AI·K·U (AI-Driven Development Lifecycle) is a methodology for collaborative human-AI software development. It addresses the fundamental challenge of maintaining productive AI sessions across context window limitations.

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

### The H·AI·K·U Solution

H·AI·K·U takes a different approach: **embrace context resets as a feature, not a bug**.

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

H·AI·K·U uses **backpressure** instead:
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

H·AI·K·U stores state in files:
- `intent.md` - What we're building
- `completion-criteria.md` - How we know it's done
- `discovery.md` - Domain discovery findings from elaboration
- `scratchpad.md` - Learnings and notes
- `blockers.md` - What's blocking progress
- `stages/{stage}/state.json` - Stage status, phase, gate outcome
- Unit frontmatter - Current hat, bolt count, status per unit

These files are:
- Injected at session start (via hooks)
- Updated during work (via MCP tools: `haiku_intent_get/set`, `haiku_stage_get/set`, `haiku_unit_get/set`)
- Preserved across `/clear` commands

## The Iteration Loop

```
┌────────────────────────────────────────────────┐
│  SessionStart Hook                              │
│  - Load state from .haiku/intents/{slug}/state/         │
│  - Inject context (hat, intent, criteria)       │
│  - Display previous learnings                   │
└────────────────────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Work Phase                                     │
│  - AI operates with injected context            │
│  - Backpressure guides quality                  │
│  - Progress saved to .haiku/intents/{slug}/state/      │
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

Different phases of work require different mindsets. H·AI·K·U uses "hats" to formalize this.

**Terminology mapping:** In the H·AI·K·U paper, a **Bolt** is the smallest iteration cycle — one pass through the hat sequence for a unit. The plugin implements Bolts as hat sequences defined in stage STAGE.md files: each unit progresses through its stage's hats (e.g., planner → builder → reviewer for the development stage), with reviewer rejection cycling back to the previous hat. One complete pass = one Bolt. Multiple rejections = multiple Bolts for that unit.

### Default Workflow

Elaboration (`/haiku:elaborate`) is a separate pre-execution phase. The execution workflow starts after elaboration is complete:

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

### Stage-Based Hat Resolution

Hats are defined as files in `stages/{stage}/hats/{hat}.md` within studios. Each stage has a `hats:` frontmatter field in STAGE.md defining the hat sequence, and individual hat instruction files in the `hats/` directory.

Studios and their stages live in `plugin/studios/{studio}/stages/{stage}/STAGE.md`. Project-level overrides can be placed in `.haiku/studios/{studio}/stages/{stage}/STAGE.md`.

Project-level hat augmentations can still be placed in `.haiku/hats/{hat-name}.md` — these augment (not replace) the stage-defined hat instructions.

```bash
# Example: resolve hat instructions for the builder hat in the development stage
# Read hat file directly — check project override first, then plugin built-in
HAT_FILE=".haiku/studios/software/stages/development/hats/builder.md"
[ ! -f "$HAT_FILE" ] && HAT_FILE="$CLAUDE_PLUGIN_ROOT/studios/software/stages/development/hats/builder.md"
instructions=$(cat "$HAT_FILE" 2>/dev/null || echo "")

# Read hat sequence from stage definition via MCP
hat_sequence=$(haiku_studio_stage_get { studio: "software", stage: "development" } | parse hats and join with " ")
# → "planner builder reviewer"
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

Most work needs only a dev pass — this is the default when `default_passes` is empty (`[]`). Multipass is for cross-functional collaboration where design or product artifacts should precede code. Example: `[design, product, dev]` runs three passes in sequence, each with its own units and stage-based hat sequence.

### Custom Passes

Create a pass definition at `.haiku/passes/{name}.md` with frontmatter and body instructions:

```markdown
---
name: accessibility
description: Accessibility audit and remediation
available_stages: [development]
default_stage: development
---

# Accessibility Pass

Audit all user-facing components for WCAG 2.1 AA compliance...
```

The `available_stages` field constrains which execution stages the pass supports. The `default_stage` is used when the requested stage is not in the available list.

### Augmenting Built-in Passes

To tailor a built-in pass to your project, create `.haiku/passes/{name}.md` where `{name}` matches a built-in pass (e.g., `design`, `product`, `dev`). The project file's body is appended under a `## Project Augmentation` heading when the pass instructions are loaded. This lets you add project-specific guidance without replacing the built-in defaults.

### Configuration

- **Global default:** Set `default_passes` in `.haiku/settings.yml` (e.g., `default_passes: [design, dev]`)
- **Per-intent override:** Set `passes` in the intent frontmatter or intent-level `settings.yml`
- **Empty array** (`[]`) means a single implicit dev pass — the default for most work

## State Management

### Scoped Storage

H·AI·K·U uses file-based state persistence in `.haiku/intents/{slug}/state/`:

| Scope | Location |
|-------|----------|
| Intent state | `.haiku/intents/{slug}/state/` — iteration state, blockers, plans |
| Intent artifacts | `.haiku/intents/{slug}/` — intent.md, unit files, discovery.md |
| Project config | `.haiku/settings.yml` — project-level settings |

### State Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `stages/{stage}/state.json` | Stage status, phase, gate outcome | MCP tools |
| `intent.md` frontmatter | Status, studio, active_stage, mode | MCP tools |
| Unit frontmatter | Hat, bolt, status, depends_on | MCP tools |
| `intent.md` | What we're building | /haiku:elaborate |
| `completion-criteria.md` | How we know it's done | /haiku:elaborate |
| `discovery.md` | Domain discovery findings | /haiku:elaborate |
| `current-plan.md` | Plan for this iteration | Planner hat |
| `scratchpad.md` | Learnings and notes | AI during work |
| `blockers.md` | What's blocking progress | AI when stuck |

## Integration with Claude Code

### Hooks

H·AI·K·U uses Claude Code's native hook system:

- **SessionStart** - Inject context from state files
- **Stop** - Enforce iteration pattern, prompt for /clear

### Commands

H·AI·K·U provides slash commands:

- `/haiku:elaborate` - Start mob elaboration
- `/haiku:execute` - Run autonomous execution loop
- advance (internal) - Read `plugin/skills/execute/subskills/advance/SKILL.md` and execute it
- fail (internal) - Read `plugin/skills/execute/subskills/fail/SKILL.md` and execute it
- `/haiku:resume` - Resume lost intent
- `/haiku:reset` - Clear state

### MCP State Tools

State is managed via MCP tools:

- `haiku_intent_get/set` - Read/write intent frontmatter fields
- `haiku_stage_get/set/start/complete` - Read/write stage state
- `haiku_unit_get/set/start/complete/advance_hat/increment_bolt` - Read/write unit frontmatter
- `haiku_unit_list` - List units in a stage
- `haiku_knowledge_list/read` - Read knowledge artifacts

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
3. **Respect the stage's hat sequence** - Don't skip hats
4. **Customize if needed** - Default stage isn't mandatory

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

H·AI·K·U is a methodology that:
1. **Embraces context limits** through deliberate iteration
2. **Uses backpressure** instead of prescription
3. **Enables autonomy** through clear completion criteria
4. **Persists state** in files, not context
5. **Structures work** through stage-based hat sequences

The result is more productive AI-assisted development with fewer repeated mistakes and clearer progress toward goals.
