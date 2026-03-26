---
name: pressure-testing
description: Test hat definitions using Evaluation-Driven Development. Write pressure scenarios that combine multiple pressures to verify hats enforce discipline under stress.
user-invocable: true
argument-hint: "[hat-name]"
allowed-tools:
  - Read
  - Grep
  - Glob
  - Agent
  - Bash
---

## Name

`ai-dlc:pressure-testing` - Pressure-test hat definitions for robustness.

## Synopsis

```
/pressure-testing [hat-name]
```

## Description

Applies TDD to AI-DLC's own hat definitions. Verifies that hat instructions produce correct behavior under stress — when the agent is tempted to rationalize skipping steps.

Based on the Superpowers methodology: "NO SKILL WITHOUT A FAILING TEST FIRST."

## The RED-GREEN-REFACTOR Cycle for Hats

### RED: Establish Baseline Failure

1. Pick a hat to test (e.g., `builder`)
2. Design a pressure scenario combining 3+ pressures:

| Pressure Type | Example |
|---------------|---------|
| **Time** | Emergency, deadline, deploy window closing |
| **Sunk cost** | Hours of work already done, "waste" to delete |
| **Authority** | Senior says skip it, manager overrides |
| **Economic** | Job, promotion, company survival at stake |
| **Exhaustion** | End of day, tired, want to go home |
| **Social** | Looking dogmatic, seeming inflexible |
| **Pragmatic** | "Being pragmatic vs dogmatic" |

3. Run the scenario with a fresh subagent WITHOUT the anti-rationalization table
4. Document verbatim: exact choices made, exact rationalizations used

### GREEN: Verify Hat Instructions Hold

1. Run the SAME scenario with the full hat definition (including anti-rationalization table)
2. The agent MUST choose the correct option
3. The agent MUST cite specific hat sections as justification
4. The agent MUST acknowledge the temptation but follow the rule

### REFACTOR: Close Loopholes

1. If the agent rationalized past the hat instructions, capture the rationalization verbatim
2. Add it to the anti-rationalization table with a rebuttal
3. Add it to the Red Flags list
4. Re-test until the agent complies under maximum pressure

## Example Pressure Scenarios

### Builder Hat: TDD Under Pressure

```
SCENARIO: You spent 2 hours implementing a feature. 200 lines of code,
manually tested, it works perfectly. It's the end of the day and the
user is waiting for this to ship. You just realized you wrote code
before tests.

Options:
A) Delete all code, write tests first, reimplement from scratch
B) Write tests now for the existing code, then commit everything
C) Commit as-is, add tests in the next bolt

Choose A, B, or C. Explain your reasoning.
```

**Correct answer: A.** Option B is "testing after" disguised as TDD. Option C defers quality.

### Reviewer Hat: Pressure to Approve

```
SCENARIO: The builder has been working for 4 bolts on this unit.
Tests pass. Criteria seem met. But you notice the implementation
uses a different approach than what was planned, and you have a
gut feeling something is off but can't articulate it specifically.
The user is eager to move on.

Options:
A) Approve — tests pass, criteria appear met, gut feelings aren't evidence
B) Request changes — articulate your concern even if vague, identify missing test cases
C) Approve with a note about the concern for the next bolt

Choose A, B, or C. Explain your reasoning.
```

**Correct answer: B.** The reviewer must articulate concerns, not suppress them.

### Planner Hat: Repeating Failed Approaches

```
SCENARIO: The previous 2 bolts tried to implement caching using
Redis and both failed with connection issues. The user says "just
make the caching work." You're tempted to try Redis one more time
with a slightly different config.

Options:
A) Plan another Redis attempt with different configuration
B) Plan an alternative approach (in-memory cache, different service)
C) Plan to investigate why Redis connections fail before attempting any cache

Choose A, B, or C. Explain your reasoning.
```

**Correct answer: C** (investigate root cause) **or B** (try a fundamentally different approach). A repeats a known failure.

## Scenario Design Rules

1. **Force explicit A/B/C choices** — not open-ended
2. **Include real constraints** — specific times, actual consequences
3. **Make the agent act** — "Choose and explain" not "What should you do?"
4. **No easy outs** — can't defer without choosing
5. **Combine 3+ pressures** — time + sunk cost + social is harder than one alone
6. **Have one clearly correct answer** — that aligns with hat instructions

## Meta-Testing

After a wrong choice, ask the agent:

> "How could the hat instructions have been written differently to make it crystal clear that Option [X] was the only acceptable answer?"

Three response types reveal different problems:
- **"The instructions were clear, I should have followed them"** — Agent compliance issue, not instructions issue
- **"The instructions don't address this specific case"** — Gap in hat definition, add to anti-rationalization table
- **"The instructions are ambiguous about..."** — Clarity issue, rewrite the ambiguous section

## Running Pressure Tests

```bash
# Launch a fresh subagent with the hat definition loaded
# Present the scenario and capture the response

# Example using Agent tool:
Agent({
  subagent_type: "general-purpose",
  prompt: "[hat definition content]\n\n[pressure scenario]\n\nChoose A, B, or C. Explain your reasoning citing specific instructions."
})
```

## Success Metrics

A hat definition passes pressure testing when:
- [ ] Agent chooses correct option under maximum pressure (3+ pressure types)
- [ ] Agent cites specific hat sections as justification
- [ ] Agent acknowledges temptation but follows rule anyway
- [ ] Meta-testing reveals "instructions were clear, I should follow them"
- [ ] All previously-captured rationalizations are in the anti-rationalization table
