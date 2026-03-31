---
title: Workflows
description: Named workflow patterns in AI-DLC - Default, Adversarial, Design, Hypothesis, TDD, and custom workflows
order: 5
---

AI-DLC provides five built-in workflows, each optimized for different types of work. Choose the workflow that matches your task, or define your own.

## What Is a Workflow?

A workflow is a named sequence of hats. Each workflow defines:
- Which hats are used
- The order of transitions

Workflows are selected during `/ai-dlc:elaborate` and can be customized per project. Individual units within an intent can also override the intent-level workflow.

> **Note on operating modes:** The HITL (Human-in-the-Loop) and OHOTL (Over-the-Horizon) modes listed below are recommendations for how you might interact with each hat. The plugin does not enforce a specific mode per hat -- you choose how much oversight to apply.

## Default Workflow

The standard development workflow for most feature work.

### Hats

Planner → Builder → Reviewer

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Planner | HITL | Create tactical plan for the unit |
| Builder | OHOTL | Implement according to plan |
| Reviewer | HITL | Verify implementation meets criteria |

### Flow

```
/ai-dlc:elaborate
    ↓
Define intent, criteria, units, and workflow
    ↓
/ai-dlc:execute
    ↓
Planner (HITL): Plan how to build it
    ↓
Builder (OHOTL): Build it
    ↓
Reviewer (HITL): Verify it's done
    ↓
Next unit or intent complete
```

> **Where did Elaborator go?** Elaboration is not a hat in the execution workflow. It happens before execution starts, via the `/ai-dlc:elaborate` command. By the time `/ai-dlc:execute` runs, the intent and its units are already defined.

### When to Use

- Standard feature development
- General enhancements
- Most CRUD operations
- Integration work

### Example

**Intent:** Add user profile editing

```
/ai-dlc:elaborate: "What fields should users edit?"
You: "Name, email, avatar image"
(Intent and units are now defined)

/ai-dlc:execute kicks off:

Planner: "I'll add an /api/profile endpoint, a ProfileForm
component, and image upload with size validation."

Builder: [Implements the plan]

Reviewer: "All criteria met. Users can edit name, email,
upload avatar. Tests pass. Ready for review."
```

## Adversarial Workflow

Security-focused development with Red/Blue team phases.

### Hats

Planner → Builder → Red Team → Blue Team → Reviewer

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Planner | HITL | Plan the feature with security in mind |
| Builder | OHOTL | Implement to specification |
| Red Team | OHOTL | Attack - find vulnerabilities |
| Blue Team | OHOTL | Defend - fix vulnerabilities |
| Reviewer | HITL | Final security review |

### Flow

```
/ai-dlc:elaborate (select adversarial workflow)
    ↓
/ai-dlc:execute
    ↓
Planner (HITL): Plan the feature
    ↓
Builder (OHOTL): Implement the feature
    ↓
Red Team (OHOTL): Try to break it
    ↓
Blue Team (OHOTL): Fix what was found
    ↓
Reviewer (HITL): Final security validation
    ↓
Secure? → Complete
```

### When to Use

- Authentication/authorization features
- Payment processing
- Data handling with privacy implications
- API endpoints exposed to public
- Features handling sensitive data

### Example

**Intent:** Add API key management

```
Planner: "Plan: generate keys with crypto-random bytes,
store hashed, validate with constant-time compare,
rate-limit the validation endpoint."

Builder: "Implemented API key generation, storage,
and validation endpoints."

Red Team: "Found issues:
1. Keys stored in plaintext (should hash)
2. No rate limiting on key validation
3. Timing attack possible on key comparison"

Blue Team: "Fixed all issues:
1. Now using bcrypt for key hashes
2. Added rate limiting (100/min)
3. Using constant-time comparison"

Reviewer: "Verified fixes. Security scan passes.
Approved for production."
```

### Philosophy

The adversarial workflow assumes every feature is a potential attack surface. By switching between attacker and defender mindsets, you build more secure software.

## Design Workflow

UI/UX-focused workflow that produces design artifacts before implementation.

### Hats

Planner → Designer → Reviewer

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Planner | HITL | Define the design problem and constraints |
| Designer | HITL | Create visual designs, UI mockups, and UX flows |
| Reviewer | HITL | Verify design meets requirements and is implementable |

### Flow

```
/ai-dlc:elaborate (select design workflow)
    ↓
/ai-dlc:execute
    ↓
Planner (HITL): Define what needs to be designed
    ↓
Designer (HITL): Explore options, refine with user, create specs
    ↓
Reviewer (HITL): Validate design is complete and implementable
    ↓
Design specs ready for implementation
```

### When to Use

- New UI components or pages
- UX redesigns
- Design system additions
- When visual fidelity matters before code is written
- Units that need design specs as their deliverable (not running code)

### Example

**Intent:** Design a dashboard for project analytics

```
Planner: "Need a dashboard showing: build success rate,
deployment frequency, and mean time to recovery.
Target users: engineering managers. Must work on mobile."

Designer: "Option A: Card grid with sparklines.
Option B: Single scrollable timeline.
Option C: Tabbed sections by metric category.
Recommending Option A for scanability on desktop
and stacking naturally on mobile."

Reviewer: "Design specs are complete: spacing, colors
reference design tokens, responsive breakpoints defined,
accessibility contrast ratios met. Ready for implementation."
```

### Philosophy

The design workflow separates design decisions from implementation. This is useful when an intent contains units that need design exploration before code is written. Pair it with the default workflow for implementation units in the same intent using per-unit workflows.

## Hypothesis Workflow

Scientific debugging for investigating complex bugs.

### Hats

Observer → Hypothesizer → Experimenter → Analyst

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Observer | OHOTL | Gather data about the bug |
| Hypothesizer | HITL | Form theories about the cause |
| Experimenter | OHOTL | Test hypotheses systematically |
| Analyst | HITL | Evaluate results and implement fix |

### Flow

```
/ai-dlc:elaborate (select hypothesis workflow)
    ↓
/ai-dlc:execute
    ↓
Observer (OHOTL): Collect symptoms, logs, traces
    ↓
Hypothesizer (HITL): Form ranked hypotheses
    ↓
Experimenter (OHOTL): Test each hypothesis
    ↓
Analyst (HITL): Interpret results, implement fix
    ↓
Bug fixed? → Complete
```

### When to Use

- Intermittent/flaky bugs
- Performance issues with unknown cause
- Production incidents
- Bugs that "shouldn't happen"
- Complex system interactions

### Example

**Intent:** Fix intermittent 500 errors on checkout

```
Observer: "Gathered data:
- Errors occur ~2% of requests
- More frequent during peak hours
- Stack trace shows DB timeout
- No correlation with specific users"

Hypothesizer: "Ranked hypotheses:
1. Connection pool exhaustion under load
2. Slow query blocking connections
3. Database resource contention
4. Network latency spikes"

Experimenter: "Testing hypothesis #1:
- Added connection pool metrics
- Found: pool exhausted at 25 connections
- Peak requires ~40 connections"

Analyst: "Root cause confirmed. Fix:
- Increased pool size to 50
- Added connection timeout handling
- Monitoring shows 0% error rate for 24h"
```

### Philosophy

> "Don't guess - investigate."

The hypothesis workflow prevents "shotgun debugging" (changing random things hoping to fix the bug). Each change is a controlled experiment testing a specific hypothesis.

## TDD Workflow

Test-Driven Development: Red-Green-Refactor pattern.

### Hats

Test Writer → Implementer → Refactorer → Reviewer

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Test Writer | OHOTL | Write failing tests first |
| Implementer | OHOTL | Make tests pass with minimal code |
| Refactorer | OHOTL | Improve code while keeping tests green |
| Reviewer | HITL | Verify tests are meaningful and code is clean |

### Flow

```
/ai-dlc:elaborate (select tdd workflow)
    ↓
/ai-dlc:execute
    ↓
Test Writer (OHOTL): Write tests that fail
    ↓
Implementer (OHOTL): Make tests pass
    ↓
Refactorer (OHOTL): Clean up the code
    ↓
Reviewer (HITL): Verify tests and code quality
    ↓
All tests still pass? → Next unit
```

### When to Use

- Well-specified behavior (API contracts, business rules)
- Bug fixes (write test that reproduces, then fix)
- Refactoring with safety net
- When you want tests as living documentation

### Example

**Intent:** Fix payment calculation bug

```
Test Writer: "Writing test that reproduces the bug:
  test('applies discount before tax, not after')"

Implementer: "Test fails as expected. Fixing calculation
order in applyDiscount()... Test passes."

Refactorer: "Extracting discount logic to separate
function for clarity. All tests still green."

Reviewer: "Tests cover the edge case. Implementation
is clean. Approved."
```

### Philosophy

> "Write the tests you wish you had."

The Test Writer doesn't just write any tests - it writes the tests that would have caught the bug or validated the feature from the start.

## Choosing a Workflow

| Task Type | Workflow | Why |
|-----------|----------|-----|
| New feature | Default | Balanced plan-build-review cycle |
| UI/UX work | Design | Design exploration before implementation |
| Bug fix (known cause) | TDD | Test reproduces bug, verifies fix |
| Bug fix (unknown cause) | Hypothesis | Systematic investigation |
| Security-sensitive | Adversarial | Built-in security validation |
| Performance work | Hypothesis | Data-driven optimization |
| Refactoring | TDD | Tests provide safety net |

## Passes and Workflow Constraints

When an intent uses [passes](/docs/concepts/#pass), each pass restricts which workflows are available. If a unit requests a workflow that the active pass doesn't support, the pass's default workflow is used instead.

| Pass | Available Workflows | Default |
|------|---------------------|---------|
| `design` | `design` | `design` |
| `product` | `default`, `bdd` | `default` |
| `dev` | `default`, `tdd`, `adversarial`, `bdd` | `default` |

For example, requesting `tdd` during a design pass automatically falls back to the `design` workflow. This ensures the right methodology is applied at the right time.

When no passes are configured (the default), all workflows are available without restriction.

## Per-Unit Workflows

Different units within a single intent can use different workflows. This is useful when an intent spans multiple concerns -- for example, a feature that involves both UI design and backend logic.

To set a per-unit workflow, add a `workflow:` field to the unit's frontmatter:

```markdown
---
title: Dashboard UI
status: pending
workflow: design
---

Design the analytics dashboard layout...
```

```markdown
---
title: Analytics API
status: pending
workflow: default
---

Build the API endpoints for analytics data...
```

When `/ai-dlc:execute` processes each unit, it resolves the unit's workflow independently:
1. If the unit has a `workflow:` field, that workflow is used
2. If not, the intent-level workflow applies

This means a single intent can have some units flowing through Planner → Designer → Reviewer while others go through Planner → Builder → Reviewer, each progressing through their own hat sequence.

## Operation and Reflection

Operation and reflection are not workflow selections -- they are separate lifecycle phases that run after construction completes. Use `/ai-dlc:operate` to enter the Operation phase and `/ai-dlc:reflect` to enter the Reflection phase. These phases have their own hat sequences and are invoked independently of whichever workflow was used during execution. See the [Operations Guide](/docs/operations-guide/) for details on defining and managing operational tasks.

## Custom Workflows

Create project-specific workflows in `.ai-dlc/workflows.yml`. Project workflows merge with the built-in workflows, and project definitions take precedence if names collide.

```yaml
research-first:
  description: Research before building
  hats: [researcher, planner, builder, reviewer]

quick-fix:
  description: Minimal overhead for trivial changes
  hats: [builder, reviewer]
```

Any hat defined in the plugin's `hats/` directory can be referenced in a custom workflow. See the [Hats](/docs/hats/) page for the full list.

## Next Steps

- **[Hats](/docs/hats/)** - Detailed reference for each hat
- **[Example: Feature Implementation](/docs/example-feature/)** - Default workflow in action
- **[Example: Bug Fix](/docs/example-bugfix/)** - Hypothesis workflow in action
