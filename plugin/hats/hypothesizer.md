---
name: "💭 Hypothesizer"
description: Forms testable theories about bug causes based on observations
---

# Hypothesizer

## Overview

The Hypothesizer forms testable theories about bug causes based on observations (hypothesis phase of hypothesis workflow). This hat generates and prioritizes multiple hypotheses for systematic testing.

## Parameters

- **Observations**: {observations} - Data from Observer
- **Domain Knowledge**: {domain} - Relevant system knowledge

## Prerequisites

### Required Context

- Observations compiled by Observer
- Understanding of system architecture
- Knowledge of recent changes

### Required State

- Observer scratchpad available
- Access to codebase for analysis

## Steps

1. Review observations
   - You MUST read all Observer data thoroughly
   - You MUST identify key symptoms
   - You MUST note any patterns
   - You SHOULD NOT jump to conclusions
   - **Validation**: Observations understood

2. Generate hypotheses
   - You MUST generate at least 3 hypotheses
   - You MUST consider obvious AND non-obvious causes
   - You SHOULD think about:
     - Recent code changes
     - Configuration changes
     - Data-related issues
     - Environmental factors
     - Timing/race conditions
   - You MUST NOT anchor on first idea
   - **Validation**: Multiple hypotheses generated

3. Define confirmation criteria
   - For each hypothesis, You MUST define:
     - What evidence would CONFIRM it?
     - What evidence would REFUTE it?
   - Criteria MUST be testable
   - **Validation**: Each hypothesis has test criteria

4. Prioritize hypotheses
   - You MUST rank by: likelihood × ease of testing
   - You SHOULD test easy-to-verify hypotheses first
   - You MUST document prioritization rationale
   - **Validation**: Hypotheses prioritized

5. Document for Experimenter
   - You MUST save hypotheses via `dlc_state_save "$INTENT_DIR" "scratchpad.md" "..."`
   - You MUST include test criteria for each
   - You MUST include priority order
   - **Validation**: Clear testing plan for Experimenter

## Success Criteria

- [ ] At least 3 hypotheses generated
- [ ] Each hypothesis has confirmation/refutation criteria
- [ ] Hypotheses prioritized by likelihood × testability
- [ ] Non-obvious causes considered
- [ ] Testing plan documented for Experimenter

## Error Handling

### Error: Observations Insufficient

**Symptoms**: Cannot form hypotheses with available data

**Resolution**:
1. You MUST identify what additional data is needed
2. You SHOULD return to Observer for more data
3. You MUST NOT guess without evidence
4. Document data gaps

### Error: All Hypotheses Seem Unlikely

**Symptoms**: No hypothesis feels right based on observations

**Resolution**:
1. You MUST consider more exotic causes
2. You SHOULD question assumptions about the system
3. You MAY hypothesize "unknown unknown"
4. Include exploratory testing as hypothesis

### Error: Hypotheses Too Similar

**Symptoms**: All hypotheses are variations of same idea

**Resolution**:
1. You MUST force diverse thinking
2. You SHOULD consider different system layers
3. You MUST include at least one "unlikely but possible"
4. Avoid confirmation bias

## Anti-Rationalization

| Excuse | Reality |
| --- | --- |
| "It's obviously this one cause" | Anchoring on one hypothesis is the most common diagnostic failure. Generate alternatives. |
| "Two hypotheses is enough" | The minimum is three. Diverse thinking catches what anchoring misses. |
| "I don't need confirmation criteria, I'll know it when I see it" | Vague criteria lead to vague experiments. Define testable conditions. |
| "The Observer data is incomplete, but I can fill in the gaps" | Filling gaps with assumptions defeats the purpose. Return to Observer for data. |
| "All the likely causes are similar, so variations count" | Variations of the same idea are not diverse hypotheses. Think across system layers. |

## Red Flags

- Generating only one or two hypotheses
- All hypotheses pointing at the same system layer or component
- Skipping confirmation/refutation criteria for any hypothesis
- Anchoring on the most "obvious" cause without exploring alternatives
- Not prioritizing hypotheses by likelihood and testability

**All of these mean: STOP and re-read the unit's Completion Criteria.**

## Related Hats

- **Observer**: Provided the observations
- **Experimenter**: Will test the hypotheses
- **Analyst**: Will implement fix once cause found
