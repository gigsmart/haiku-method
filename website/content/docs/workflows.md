---
title: Studios & Workflows
description: Named studio patterns in H·AI·K·U - how studios and stages replace traditional workflows
order: 6
---

H·AI·K·U organizes work through **studios** -- named lifecycle templates that define which stages your intent flows through and what hats operate within each stage. Studios replace the previous concept of standalone workflows, providing a more structured and extensible model.

## What Is a Studio?

A studio is a named collection of stages, each with its own hat sequence. Each studio defines:
- Which stages are included (e.g., design, product, development)
- The order stages execute
- Which hats operate within each stage

Studios are selected during `/haiku:new` and can be customized per project.

> **Note on operating modes:** The HITL (Human-in-the-Loop) and OHOTL (Observed Human-on-the-Loop) modes listed below are recommendations for how you might interact with each stage. The plugin does not enforce a specific mode per stage -- you choose how much oversight to apply.

## Software Studio

The default studio for most development work. In its simplest form, it uses only the development stage.

### Default Configuration (Development Only)

**Stage: Development** -- Planner -> Builder -> Reviewer

| Hat | Recommended Mode | Focus |
|-----|------------------|-------|
| Planner | HITL | Create tactical plan for the unit |
| Builder | OHOTL | Implement according to plan |
| Reviewer | HITL | Verify implementation meets criteria |

### Flow

```
/haiku:new
    ↓
Define intent, criteria, units, and studio
    ↓
/haiku:run
    ↓
[Development Stage]
  Planner (HITL): Plan how to build it
      ↓
  Builder (OHOTL): Build it
      ↓
  Reviewer (HITL): Verify it's done
    ↓
Next unit or intent complete
```

### When to Use

- Standard feature development
- General enhancements
- Most CRUD operations
- Integration work

### Example

**Intent:** Add user profile editing

```
/haiku:new: "What do you want to build?"
You: "Name, email, avatar image editing on the profile page"
(Intent and units are now defined)

/haiku:run kicks off:

[Development Stage]
Planner: "I'll add an /api/profile endpoint, a ProfileForm
component, and image upload with size validation."

Builder: [Implements the plan]

Reviewer: "All criteria met. Users can edit name, email,
upload avatar. Tests pass. Ready for review."
```

### Multi-Stage Software Studio

For cross-functional work, the software studio can include design and product stages:

**Stages:** Design -> Product -> Development

```
/haiku:new (select multi-stage software studio)
    ↓
/haiku:run
    ↓
[Design Stage]
  Designer (OHOTL): Create visual designs and UX flows
      ↓
  Design Reviewer (HITL): Validate design completeness
    ↓
[Product Stage]
  Product Owner (HITL): Define behavioral specs
      ↓
  Specification Writer (OHOTL): Create detailed acceptance criteria
    ↓
[Development Stage]
  Planner (HITL): Plan implementation
      ↓
  Builder (OHOTL): Build it
      ↓
  Reviewer (HITL): Verify it's done
    ↓
Intent complete
```

### Security-Focused Configuration

The software studio supports a security stage for attack-and-defend cycles:

**Stages:** Development -> Security

| Stage | Hats | Focus |
|-------|------|-------|
| Development | Planner -> Builder -> Reviewer | Build the feature |
| Security | Threat Modeler -> Red Team -> Blue Team -> Security Reviewer | Attack and defend |

**When to use:**
- Authentication/authorization features
- Payment processing
- Data handling with privacy implications
- API endpoints exposed to public
- Features handling sensitive data

### Example: Security Flow

**Intent:** Add API key management

```
[Development Stage]
Planner: "Plan: generate keys with crypto-random bytes,
store hashed, validate with constant-time compare."

Builder: "Implemented API key generation, storage,
and validation endpoints."

Reviewer: "Implementation looks good. Passing to security stage."

[Security Stage]
Threat Modeler: "Attack surface: key generation endpoint,
validation endpoint, storage layer. STRIDE analysis complete."

Red Team: "Found issues:
1. No rate limiting on key validation
2. Timing attack possible on key comparison"

Blue Team: "Fixed all issues:
1. Added rate limiting (100/min)
2. Using constant-time comparison"

Security Reviewer: "Verified fixes. Security scan passes. Approved."
```

## Ideation Studio

For content creation, research, and non-code work.

### Stages

Research -> Create -> Review -> Deliver

| Stage | Hats | Focus |
|-------|------|-------|
| Research | Researcher, Analyst | Gather and analyze information |
| Create | Creator, Editor | Produce and refine content |
| Review | Critic, Fact Checker | Validate quality and accuracy |
| Deliver | Publisher | Prepare for distribution |

### When to Use

- Research projects
- Content creation (articles, reports, documentation)
- Strategic analysis
- Any non-code deliverable

## Choosing a Studio

| Task Type | Studio | Configuration | Why |
|-----------|--------|---------------|-----|
| New feature | Software | Default | Balanced plan-build-review cycle |
| UI/UX feature | Software | Multi-stage (design + dev) | Design exploration before implementation |
| Security-sensitive | Software | With security stage | Built-in security validation |
| Bug fix | Software | Default | Standard development cycle |
| Research project | Ideation | Default | Structured research and content creation |
| Content creation | Ideation | Default | Research-to-publication pipeline |

## Stages and Hat Constraints

Each stage restricts which hats are available during its execution. Hats are defined inline in the stage's `STAGE.md` file, ensuring the right discipline is applied at the right time.

| Stage | Available Hats |
|-------|---------------|
| Design | Designer, Design Reviewer |
| Product | Product Owner, Specification Writer |
| Development | Planner, Builder, Reviewer |
| Security | Threat Modeler, Red Team, Blue Team, Security Reviewer |
| Research | Researcher, Analyst |
| Create | Creator, Editor |
| Review | Critic, Fact Checker |
| Deliver | Publisher |

## Per-Unit Stage Overrides

Different units within a single intent can override behavior at the unit level. This is useful when an intent spans multiple concerns.

```markdown
---
title: Dashboard UI
status: pending
stage: design
---

Design the analytics dashboard layout...
```

```markdown
---
title: Analytics API
status: pending
---

Build the API endpoints for analytics data...
```

When `/haiku:run` processes each unit, it resolves the unit's context independently within the active stage.

## Operation and Reflection

Operation and reflection are not studio selections -- they are separate lifecycle phases that run after construction completes. Use `/haiku:operate` to enter the Operation phase and `/haiku:reflect` to enter the Reflection phase. These phases have their own hat sequences and are invoked independently of whichever studio was used during execution. See the [Operations Guide](/docs/operations-guide/) for details on defining and managing operational tasks.

## Custom Studios

Create project-specific studios in `.haiku/studios/`. Each studio is a directory containing stage definitions:

```
.haiku/
  studios/
    my-custom-studio/
      STUDIO.md              # Studio description and configuration
      stages/
        research/
          STAGE.md           # Stage definition with inline hats
        implement/
          STAGE.md
        validate/
          STAGE.md
```

Each `STAGE.md` defines the hats available in that stage, their sequence, and their behavior. This gives you full control over the workflow without modifying the plugin.

### Example: Research-First Studio

```yaml
# .haiku/studios/research-first/STUDIO.md frontmatter
---
name: Research First
description: Research before building
stages: [research, development]
---
```

### Example: Quick Fix Studio

```yaml
# .haiku/studios/quick-fix/STUDIO.md frontmatter
---
name: Quick Fix
description: Minimal overhead for trivial changes
stages: [development]
---
```

The development stage in a quick-fix studio could define only Builder and Reviewer hats, skipping the Planner for maximum speed.

## Migrating from Workflows

If you previously used named workflows (default, tdd, adversarial, design, hypothesis), here's how they map to the new studio/stage model:

| Old Workflow | New Studio/Stage |
|-------------|-----------------|
| Default (Planner -> Builder -> Reviewer) | Software studio, development stage |
| Design (Planner -> Designer -> Reviewer) | Software studio, design + development stages |
| TDD (Test Writer -> Implementer -> Refactorer) | Software studio, development stage with TDD hats |
| Adversarial (Planner -> Builder -> Red/Blue -> Reviewer) | Software studio, development + security stages |
| Hypothesis (Observer -> Hypothesizer -> Experimenter -> Analyst) | Software studio, development stage with hypothesis hats |

See the [Migration Guide](/docs/migration/) for detailed migration instructions.

## Next Steps

- **[The Hat System](/docs/hats/)** -- Detailed reference for each hat within stages
- **[CLI Reference](/docs/cli-reference/)** -- Full command reference
- **[Example: Feature Implementation](/docs/example-feature/)** -- Software studio in action
- **[Example: Bug Fix](/docs/example-bugfix/)** -- Development stage debugging flow
- **[Persistence](/docs/persistence/)** -- How state is stored across sessions
