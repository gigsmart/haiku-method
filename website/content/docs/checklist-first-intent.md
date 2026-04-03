---
title: First Intent Checklist
description: Step-by-step checklist for completing your first AI-DLC intent
order: 20
---

This checklist walks you through completing your first intent with AI-DLC. Follow each section in order.

## Before You Start

Complete these steps before beginning your first intent:

### Environment Setup
- [ ] Claude Code installed and working
- [ ] AI-DLC plugin installed (`/plugin marketplace add thebushidocollective/ai-dlc` then `/plugin install ai-dlc@thebushidocollective-ai-dlc --scope project`)
- [ ] Verified plugin is active (commands like `/ai-dlc:elaborate` are recognized)

### Project Selection
- [ ] Chosen a real project (not a toy project)
- [ ] Project has clear goals (you know what you want to build)
- [ ] Low time pressure (room for learning)
- [ ] You're familiar with the codebase (one new thing at a time)

### Mental Preparation
- [ ] Blocked 2-4 hours of focused time
- [ ] Prepared to follow the process even if it feels slow
- [ ] Ready to complete at least one full unit

---

## Phase 1: Elaboration

Use `/ai-dlc:elaborate` to define your intent collaboratively with Claude.

### Start Elaboration
- [ ] Run `/ai-dlc:elaborate`
- [ ] Describe what you want to build in 2-3 sentences

### Define the Intent
- [ ] Review Claude's clarifying questions
- [ ] Answer questions about scope, constraints, and requirements
- [ ] Refine the description until it's clear

### Write Completion Criteria
- [ ] Review proposed completion criteria
- [ ] Ensure each criterion is:
  - [ ] Specific (not vague)
  - [ ] Measurable (can be verified)
  - [ ] Atomic (tests one thing)
- [ ] Add any missing criteria
- [ ] Remove any out-of-scope criteria

### Define Units
- [ ] Review proposed unit breakdown
- [ ] Verify units are:
  - [ ] Cohesive (related stories grouped together)
  - [ ] Loosely coupled (minimal dependencies between units)
  - [ ] Independently completable (each can be finished and tested)
- [ ] Adjust unit boundaries if needed
- [ ] Confirm unit ordering and dependencies

### Verify Artifacts
- [ ] `intent.md` created with overall description
- [ ] `unit-01-*.md` (and subsequent units) created
- [ ] Each unit file has:
  - [ ] Description
  - [ ] Completion criteria
  - [ ] Dependencies (if any)

### Elaboration Complete
- [ ] Intent is clear and well-defined
- [ ] Units are appropriately scoped
- [ ] Ready to begin execution

---

## Phase 2: First Unit

Work through your first unit using `/ai-dlc:execute`.

### Start Execution
- [ ] Run `/ai-dlc:execute`
- [ ] Verify Claude loaded the correct unit

### Planner Hat

- [ ] Claude proposes an approach
- [ ] Review the plan for:
  - [ ] Technical feasibility
  - [ ] Coverage of all criteria
  - [ ] Appropriate scope
- [ ] Ask clarifying questions if needed
- [ ] Approve the plan (or request modifications)

### Builder Hat

- [ ] Claude begins implementation
- [ ] Monitor progress (you're in OHOTL mode by default)
- [ ] Redirect if going off-track
- [ ] Answer questions if Claude asks

**Quality Gate Checks:**
- [ ] Tests written for new functionality
- [ ] No TypeScript/lint errors introduced
- [ ] Code follows project conventions

### Reviewer Hat

- [ ] Claude performs self-review
- [ ] Review completion criteria status:

```markdown
## Completion Criteria Status
- [x] Criterion 1 - verified by [method]
- [x] Criterion 2 - verified by [method]
- [ ] Criterion 3 - FAILED: [reason]
```

- [ ] If criteria failed:
  - [ ] Claude proposes fixes
  - [ ] Back to Builder to implement fixes
  - [ ] Re-review until all pass

### First Unit Complete

- [ ] All completion criteria satisfied
- [ ] Quality gates pass (tests, types, lint)
- [ ] Unit file updated with status: `complete`
- [ ] Changes committed with unit reference
- [ ] Ready for next unit or intent completion

---

## Phase 3: Iteration

Continue with remaining units.

### For Each Remaining Unit

- [ ] Run `/ai-dlc:execute` to load next unit
- [ ] Review any dependencies are satisfied
- [ ] Complete Planner → Builder → Reviewer cycle
- [ ] Commit with unit reference
- [ ] Update unit status

### Between Units

- [ ] Check if context is getting heavy
- [ ] `/clear` if needed, then `/ai-dlc:execute` to continue
- [ ] Verify committed artifacts reflect current state

### Handling Blockers

If you hit a blocker during any unit:

- [ ] Document the blocker in unit file
- [ ] Categorize: Technical / Requirement / External
- [ ] Decide: Can work around / Need help / Block unit
- [ ] If blocking: Move to next available unit
- [ ] If workable: Document assumption, continue

---

## Phase 4: Completion

Wrap up the intent.

### Final Review

- [ ] All units marked complete
- [ ] `intent.md` overall criteria satisfied
- [ ] All quality gates pass across all units
- [ ] No outstanding blockers

### Documentation

- [ ] README updated if needed
- [ ] API documentation current (if applicable)
- [ ] Any new patterns documented

### Commit and PR

- [ ] Final commit with completion message
- [ ] PR created (if applicable)
- [ ] PR description references intent and units
- [ ] Ready for team review

### Cleanup

- [ ] Remove any scratch/debug code
- [ ] Verify no console.log/debug statements left
- [ ] Clean up any temporary files

---

## Phase 5: Reflection

Learn from the experience.

### Self-Assessment

Answer these questions honestly:

**Process:**
- [ ] Did the hat transitions feel natural?
- [ ] Did you stay in your hat or drift?
- [ ] Was the Researcher phase valuable?
- [ ] Did Review catch any issues?

**Criteria Quality:**
- [ ] Were criteria specific enough?
- [ ] Any criteria that were unclear in hindsight?
- [ ] Any important criteria that were missing?

**Tooling:**
- [ ] Any friction with the commands?
- [ ] Did `/clear` + `/ai-dlc:execute` work smoothly?
- [ ] Were artifacts helpful?

### Metrics to Note

Record for future comparison:
- Time to complete intent: ____
- Number of units: ____
- Blocker count: ____
- Criteria changes during work: ____

### Improvements for Next Time

Based on this experience:
- [ ] What would you do differently?
- [ ] What worked well to repeat?
- [ ] Any conventions to establish?

---

## Quick Reference

### Commands
| Command | When to Use |
|---------|-------------|
| `/ai-dlc:elaborate` | Start new intent |
| `/ai-dlc:execute` | Continue/start unit work |
| `/researcher` | Need more understanding |
| `/planner` | Need to redesign approach |
| `/builder` | Ready to implement |
| `/reviewer` | Ready to verify |
| `/clear` | Context too heavy |

### Criteria Checklist
- [ ] Specific (not vague)
- [ ] Measurable (can verify)
- [ ] Atomic (one thing)
- [ ] Includes positive cases
- [ ] Includes negative cases
- [ ] Includes edge cases
- [ ] Has quality gates

### Hat Flow
```
Researcher → Planner → Builder → Reviewer → Next Unit
     ↑           ↑         ↓         ↓
     └───────────┴─────────┘         │
           (when needed)             │
                                     ↓
                               Unit Complete
```

---

## Congratulations!

You've completed your first AI-DLC intent. The process likely felt slower than "just coding," but consider:

- How many issues were caught before they became bugs?
- How clear is the documentation of what was built?
- How easy would it be for someone else to understand this work?

The next intent will be faster. By your fifth intent, the process will feel natural.

**Next steps:**
- Complete 2-3 more intents to build fluency
- Try a different workflow (TDD, Hypothesis)
- Share your experience with teammates
