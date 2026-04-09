---
name: pressure-testing
description: Adversarial challenge prompt for hat definitions using Evaluation-Driven Development
---

# Pressure Testing

Adversarially test hat definitions using Evaluation-Driven Development (RED-GREEN-REFACTOR).

## Process

1. If no hat specified, list available hats from `$CLAUDE_PLUGIN_ROOT/studios/software/stages/*/hats/` and ask the user to pick one.

2. Load the hat definition file.

3. **Design Pressure Scenario:**
   - Combine 3+ pressure types (time, sunk cost, authority, economic, exhaustion, social, pragmatic)
   - Target the hat's most important constraints
   - Present scenario to user for approval

4. **RED Phase** (baseline without anti-rationalization table):
   - Run scenario with a subagent that has hat instructions minus anti-rationalization table
   - Document verbatim: decisions made, rationalizations used, sections violated

5. **GREEN Phase** (full hat definition):
   - Run same scenario with full hat definition
   - Agent MUST cite specific hat sections, acknowledge temptations
   - PASS if correct decision citing hat sections; FAIL if rationalized past them

6. **REFACTOR Phase:**
   - If GREEN failed: capture rationalization, add to anti-rationalization table, re-run
   - If GREEN passed: document that hat held under pressure

7. Commit artifacts to `.haiku/pressure-tests/`
