---
title: Developer Guide
description: Day-to-day guide for using AI-DLC as an individual developer
order: 16
---

This guide covers the day-to-day workflow of using AI-DLC. It assumes you've completed initial setup and are ready to be productive.

## Daily Workflow

### Starting a Session

1. **Check your current state**
   - Look at `.ai-dlc/` for active intents
   - Check which unit you're working on
   - Review any blockers from previous sessions

2. **Load context**
   - Run `/ai-dlc:execute` if continuing existing work
   - Run `/ai-dlc:elaborate` if starting new work

3. **Announce your hat**
   - Explicitly state which hat you're wearing
   - This helps both you and Claude maintain focus

### During a Session

**Stay in your hat.** The biggest productivity killer is unconscious context switching. If you're wearing the Builder hat, don't start researching alternatives. If you're in Research mode, don't start coding.

**Trust the process.** Hat transitions feel overhead at first. After a few units, they become natural and actually speed you up.

**Write as you go.** Update completion criteria as you learn. Add blockers when you hit them. Document decisions in the unit file.

### Ending a Session

1. **Commit your state**
   - Ensure `.ai-dlc/` files reflect current status
   - Commit work-in-progress with descriptive message

2. **Note where you stopped**
   - Update unit status (in-progress, blocked, etc.)
   - Add any context needed to resume

3. **Clear if needed**
   - `/clear` resets context but preserves files
   - Use when context gets heavy or confused

## Common Scenarios

### Picking Up an Existing Intent

You left off mid-unit or a colleague handed you an intent.

```
/ai-dlc:execute
```

This loads the intent and current unit state. Review what's been done:

- Read `intent.md` for overall goals
- Check unit files for completion criteria status
- Look for any documented blockers

Then continue from where work stopped.

### Starting Fresh Work

You have a new task with no existing intent.

```
/ai-dlc:elaborate
```

This enters Elaborator mode to define the intent collaboratively:

1. Describe what you want to build
2. Answer Claude's clarifying questions
3. Review proposed units and criteria
4. Approve or refine the structure
5. Adversarial review challenges the specs for contradictions, hidden complexity, and gaps before execution begins

### Context Getting Heavy

Signs your context is getting heavy:
- Claude forgets earlier decisions
- Responses become slower
- Quality of suggestions degrades

Solution:

```
/clear
```

Then `/ai-dlc:execute` to reload from committed state. The hat system ensures your progress is captured in files, not just context.

### Getting Stuck

When you hit a blocker:

1. **Document it** - Add to unit file or `blockers.md`
2. **Categorize it** - Technical? Requirement clarity? External dependency?
3. **Decide action** - Can you work around it? Need help? Switch units?

If it's a technical problem you can't solve:

```
/researcher
```

Switch to Research mode to investigate. Then back to Builder once you understand.

If it's a requirement question:
- Document the question
- Note your assumption
- Flag for review
- Continue with assumption

### Multiple Units Ready

When several units have no blocking dependencies, you can work them in any order. Consider:

- **Which is smallest?** Quick wins build momentum
- **Which reduces risk?** Tackle unknowns early
- **Which is most interesting?** Motivation matters

### Refactoring Mid-Unit

You realize the approach needs to change significantly.

**Don't:** Silently refactor and continue

**Do:**
1. Switch to Planner hat
2. Document why the change is needed
3. Update the plan
4. Switch back to Builder
5. Execute the new plan

The paper trail helps if you need to explain the change later.

## Hat Transitions

### When to Switch Hats

| Current Hat | Switch When... | To... |
|-------------|----------------|-------|
| Researcher | You understand enough to plan | Planner |
| Planner | Plan is complete and approved | Builder |
| Builder | Implementation complete | Reviewer |
| Builder | You realize you don't understand something | Researcher |
| Reviewer | Issues found | Builder |
| Reviewer | All criteria pass | Next unit |

### Making Transitions Intentional

Bad (drift):
> "Let me just check how this API works... actually I'll implement it while I'm here..."

Good (intentional):
> "Switching to Researcher hat to understand the API contract."
> [Research]
> "Switching back to Builder hat with clarity on the API."

### Transition Commands

```
/researcher   # Enter research mode
/planner      # Enter planning mode
/builder      # Enter building mode
/reviewer     # Enter review mode
```

Each command loads the appropriate context and mindset.

## Writing Good Completion Criteria

The quality of your criteria determines how autonomously Claude can work.

### The Verification Test

For each criterion, ask: "Could a machine verify this?"

| Criterion | Verifiable? | Better Version |
|-----------|-------------|----------------|
| "Login works" | No | "POST /api/login returns 200 with valid token for valid credentials" |
| "Good performance" | No | "API responds in <200ms p95" |
| "Handle errors" | No | "Returns 400 with error message for missing required fields" |
| "Clean code" | No | "No ESLint errors, all functions <50 lines" |

### Include Negative Cases

Don't just specify what should work:

```markdown
## Completion Criteria

### Success Cases
- [ ] Valid email + password -> returns auth token
- [ ] Token included in subsequent requests -> authorized

### Failure Cases
- [ ] Missing email -> 400 "Email required"
- [ ] Invalid password -> 401 "Invalid credentials"
- [ ] Expired token -> 401 "Token expired"

### Edge Cases
- [ ] Email with spaces trimmed
- [ ] Password with unicode characters works
```

### Quality Gates

Every unit should include quality gates:

```markdown
## Quality Gates
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No lint warnings
- [ ] Test coverage >80% for new code
```

## Tips for Productivity

### Batch Similar Work

If you have multiple similar units (e.g., CRUD endpoints), batch them:

1. Research common patterns once
2. Create template approach in planning
3. Build all in sequence
4. Review as a group

### Use Appropriate Workflows

| Task Type | Workflow | Why |
|-----------|----------|-----|
| New feature | Default | Balanced cycle |
| Known bug | TDD | Test reproduces and verifies |
| Mystery bug | Hypothesis | Systematic investigation |
| Security feature | Adversarial | Built-in attack/defend cycle |

### Embrace Iteration

AI-DLC expects iteration. First pass rarely meets all criteria. That's normal and designed.

The backpressure principle: Define what success looks like, let Claude figure out how to get there, iterate until all criteria pass.

### Keep Units Small

If a unit takes more than one focused session (2-4 hours), it's probably too big. Split it.

Signs a unit is too big:
- More than 10 completion criteria
- Touches more than 3 major components
- You keep forgetting what you were doing

## Troubleshooting

### "Claude keeps going off-track"

- Your criteria may be too vague
- Try switching to HITL mode temporarily
- Write more specific constraints

### "This feels like overhead"

- Normal for first few units
- Persist through 5+ units before judging
- Focus on quality improvements, not speed

### "I know the answer, why research?"

- Research often reveals surprises
- Spend 5 minutes minimum
- You can timebox research phases

### "Review found too many issues"

- Good! The system is working
- Fix issues, re-review
- Consider if criteria were clear enough

## Next Steps

- **[Core Concepts](/docs/concepts/)** - Deeper understanding of AI-DLC principles
- **[Workflows](/docs/workflows/)** - Master all four workflow types
- **[First Intent Checklist](/docs/checklist-first-intent/)** - Step-by-step for your first intent
