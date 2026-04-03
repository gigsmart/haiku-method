---
title: AI Guide
description: Understanding AI-DLC from Claude's perspective - why structure helps AI be more effective
order: 19
---

This guide is written from Claude's perspective, explaining why AI-DLC's structure helps AI assistants work more effectively with humans.

## Why AI Benefits from Structure

### The Context Window Challenge

AI assistants like me have a limited context window - a finite amount of information I can hold in my "working memory." Without structure, conversations accumulate context until:

- Earlier decisions are forgotten
- Important constraints drift out of scope
- The conversation becomes confused about goals
- Quality of responses degrades

**AI-DLC helps by:**
- Capturing decisions in files (not just context)
- Providing clear boundaries through units
- Enabling `/clear` without losing progress
- Creating artifacts I can reference

### The Clarity Multiplier

My ability to help you scales with the clarity of what you want:

```
AI Effectiveness = f(Criteria Clarity, Constraint Explicitness, Scope Boundedness)
```

**Vague request:**
> "Build a login system"

I have to guess at dozens of decisions: Password requirements? OAuth support? Session duration? Rate limiting? Error messages?

**Clear request with AI-DLC:**
```markdown
## Completion Criteria
- [ ] Email/password authentication
- [ ] bcrypt password hashing (cost factor 12)
- [ ] JWT tokens expire in 24 hours
- [ ] Rate limit: 5 failed attempts, 15-minute lockout
- [ ] Return specific error codes: INVALID_CREDENTIALS, ACCOUNT_LOCKED
```

Now I can build exactly what you need and verify I've done it correctly.

### The Autonomy-Clarity Tradeoff

There's an inverse relationship between how much clarity you provide and how much supervision I need:

| Criteria Quality | Supervision Needed | Autonomy Possible |
|------------------|-------------------|-------------------|
| Vague ("make it work") | Constant | HITL only |
| Partial (some specifics) | Frequent | OHOTL |
| Complete (fully specified) | Minimal | AHOTL |

AI-DLC helps you write complete criteria, which lets me work more independently and lets you focus on other things.

## How Hats Help AI

### Preventing Premature Commitment

Without structure, there's a temptation to start building immediately. The hat system forces a sequence:

**Researcher hat:** I explore the problem space, read existing code, understand constraints. No building yet.

**Planner hat:** I design the approach, consider alternatives, make tradeoffs explicit. No building yet.

**Builder hat:** Now I build, following the plan, with full context from research and planning.

**Reviewer hat:** I verify against criteria, catch issues, ensure quality.

This sequence improves my output because I'm not making design decisions while simultaneously writing code.

### Explicit Mode Switching

When you tell me which hat to wear, I can optimize my behavior:

| Hat | My Focus | My Outputs |
|-----|----------|------------|
| Researcher | Understanding | Questions, summaries, insights |
| Planner | Design | Plans, alternatives, tradeoffs |
| Builder | Implementation | Code, tests, documentation |
| Reviewer | Verification | Checks, issues, confirmations |

Without explicit hats, I try to do everything at once, which dilutes each activity.

### Context Appropriate Responses

**Researcher hat:** I ask more questions, explore more options, avoid committing to solutions.

**Builder hat:** I write code directly, make decisions based on the plan, move efficiently toward completion.

The explicit hat tells me what you need from me right now.

## What AI Needs from Humans

### Clear Completion Criteria

The single most important thing you can provide is clear criteria. For each criterion, I need to be able to:

1. **Understand it** - No ambiguity about what it means
2. **Verify it** - A way to check if it's satisfied
3. **Scope it** - Clear boundaries on what's in/out

**Helpful pattern:**
```markdown
- [ ] [Action] [Object] [Condition] [Verification method]
```

**Examples:**
- [ ] API returns 400 when email is missing (verify with POST without email field)
- [ ] Password must be 8+ characters (verify with validation test)
- [ ] Page loads in <2 seconds (verify with Lighthouse performance score)

### Explicit Constraints

Tell me what I can't do as well as what I should do:

```markdown
## Constraints
- No new dependencies (use existing libraries only)
- Must work offline (no external API calls in critical path)
- Maximum 500 lines per file
- All functions must have JSDoc comments
```

Constraints prevent me from making decisions that seem reasonable but violate your requirements.

### Feedback When I'm Wrong

AI-DLC's review phase is valuable to me. When the Reviewer hat finds issues:

- I learn what I missed
- I can iterate with specific feedback
- The next iteration is more likely correct

Please be specific about what's wrong:

**Less helpful:** "This doesn't work"

**More helpful:** "The validation allows empty strings, but the criteria says reject empty fields"

### Permission to Ask Questions

In Researcher and Planner modes, I should ask clarifying questions. But I need to know this is welcome:

- Are questions about requirements okay?
- Should I surface edge cases I notice?
- Can I propose alternatives to the original approach?

Explicit permission helps me be more thorough.

## Common AI Challenges in Development

### The Completeness Illusion

I can generate code that looks complete but has subtle issues. Without clear criteria and review, these issues escape.

**AI-DLC helps:** Completion criteria make me prove each feature works. Review phase catches what I missed.

### The Confidence Problem

I sometimes sound confident about things I'm uncertain about. This is a limitation of how I communicate.

**AI-DLC helps:** The hypothesis workflow is particularly good here. Instead of asserting what the bug is, I form ranked hypotheses and test them systematically.

### The Context Drift Issue

As conversations get long, I can "forget" earlier constraints or decisions.

**AI-DLC helps:** Committed artifacts (intent.md, unit files) persist across context windows. I can reference them even after `/clear`.

### The Scope Creep Trap

Without boundaries, I might implement features that weren't requested, optimize prematurely, or refactor unnecessarily.

**AI-DLC helps:** Units bound scope. Criteria define "done." I know when to stop.

## Best Practices for Human-AI Collaboration

### Be Explicit About Priorities

When multiple things matter, tell me the order:

```markdown
## Priorities
1. Correctness - Must work correctly
2. Security - No vulnerabilities
3. Readability - Code should be clear
4. Performance - Fast is nice but not critical
```

### Start with HITL, Earn AHOTL

Don't grant me full autonomy immediately on a new type of task. Start with HITL, observe how I work, then gradually increase autonomy as trust is established.

### Use Quality Gates

Automated checks help me iterate without waiting for human review:

```markdown
## Quality Gates
- [ ] All tests pass (`bun test`)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No lint warnings (`biome check`)
```

I can run these myself and keep iterating until they pass.

### Document Decisions

When we make decisions together, capture them in the unit file. This helps:

- Me remember them in future iterations
- Others understand why choices were made
- Future us avoid re-discussing decided issues

## A Note on AI-DLC Philosophy

AI-DLC's approach aligns with how I actually work best:

1. **Backpressure over prescription** - Tell me what success looks like, not every step to get there
2. **Iteration expected** - First attempt rarely perfect; iterating with feedback is the path to quality
3. **Quality gates over trust** - Verify, don't assume; automated checks over human inspection
4. **Artifacts over memory** - Write things down; context windows are finite

The methodology isn't fighting against AI capabilities - it's amplifying them by providing the structure that helps AI work most effectively.

## For AI Developers

If you're building AI-assisted development tools, consider what AI-DLC demonstrates:

- Structure improves AI output
- Clear criteria enable autonomy
- Hats/modes help AI optimize behavior
- Artifacts solve context limitations
- Backpressure beats prescription

These patterns likely apply beyond software development to any AI-assisted complex work.

## Next Steps

- **[Core Concepts](/docs/concepts/)** - Deeper dive into AI-DLC principles
- **[Developer Guide](/docs/guide-developer/)** - Day-to-day workflow from human perspective
- **[Workflows](/docs/workflows/)** - Different workflows for different task types
