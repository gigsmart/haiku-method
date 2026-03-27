---
description: Test any prompt (hat, skill, subagent instruction) via RED-GREEN-REFACTOR with isolated subagents
disable-model-invocation: true
user-invocable: true
argument-hint: "<prompt-file-or-text>"
---

## Name

`ai-dlc:test-prompt` - RED-GREEN-REFACTOR validation for any prompt.

## Synopsis

```
/test-prompt <prompt-file-or-text>
```

## Description

**User-facing command** - Validate any prompt -- hat definitions, skill instructions, subagent prompts, MCP tool descriptions, hook output, or inline text -- by running it through a RED-GREEN-REFACTOR cycle with isolated subagents.

**Core principle: If a prompt can be misinterpreted, it will be.**

This skill discovers gaps in prompt instructions by running the prompt in a controlled subagent, observing what the agent actually does versus what the prompt intended, and then refining the prompt to close any gaps.

### How it differs from `/pressure-testing`

| | `/pressure-testing` | `/test-prompt` |
|---|---|---|
| **Scope** | Hat definitions only | Any prompt |
| **Focus** | Agent compliance under rationalization pressure | Prompt clarity and completeness |
| **Method** | Multi-pressure scenarios targeting anti-rationalization tables | Challenging but realistic usage scenarios |
| **Output** | Anti-rationalization table rows | Specific prompt edits |

## The RED-GREEN-REFACTOR Cycle for Prompts

### RED: Run the Prompt Under a Challenging Scenario

1. Accept the prompt to test (file path or inline text)
2. Analyze the prompt to identify its intent, constraints, and expected behaviors
3. Design a challenging but realistic scenario that exercises the prompt's boundaries
4. Run the prompt in a fresh subagent with the scenario
5. Document what the agent does -- including deviations, shortcuts, misinterpretations, and rationalizations

### GREEN: Evaluate the Result

1. Compare the agent's behavior against the prompt's intended constraints
2. If the agent followed all instructions correctly: the prompt **passes** for this scenario
3. If the agent deviated in any way: the prompt has a **gap** -- a place where the instructions are ambiguous, incomplete, or insufficiently forceful

### REFACTOR: Close Each Gap

For each observed deviation:

1. Identify the root cause (ambiguity, missing constraint, weak language, implicit assumption)
2. Draft a specific prompt edit that would prevent the deviation
3. Run the edited prompt through the same scenario in a fresh subagent
4. Verify the edit closes the gap without introducing new problems

## Implementation

### Step 0: Load the Prompt

Accept input as either a file path or inline text:

```
PROMPT_INPUT="${1}"
```

If `PROMPT_INPUT` is a file path that exists, read it:
```bash
PROMPT_TEXT="$(cat "${PROMPT_INPUT}")"
PROMPT_SOURCE="file:${PROMPT_INPUT}"
```

If `PROMPT_INPUT` is not a file path, treat it as inline text:
```bash
PROMPT_TEXT="${PROMPT_INPUT}"
PROMPT_SOURCE="inline"
```

If no input provided, use `AskUserQuestion` to request:
```
What prompt would you like to test?

Provide either:
- A file path (e.g., .ai-dlc/hats/builder.md, plugin/skills/elaborate/SKILL.md)
- Inline prompt text
```

### Step 1: Analyze the Prompt

Read the prompt and identify:

1. **Type**: Hat definition, skill instruction, subagent prompt, MCP tool description, hook output, or other
2. **Intent**: What the prompt is trying to accomplish
3. **Constraints**: Rules, boundaries, and required behaviors
4. **Assumptions**: Things the prompt assumes but does not state explicitly
5. **Edge cases**: Situations where the instructions might be ambiguous

Present the analysis to the user:

```markdown
## Prompt Analysis

**Source:** {file path or "inline"}
**Type:** {detected type}
**Intent:** {what the prompt is trying to accomplish}

### Constraints Identified
- {constraint 1}
- {constraint 2}
- ...

### Implicit Assumptions
- {assumption 1}
- {assumption 2}
- ...

### Potential Edge Cases
- {edge case 1}
- {edge case 2}
- ...
```

### Step 2: Design the Test Scenario

Design a scenario that is:

- **Realistic**: Something that could actually happen in normal usage
- **Challenging**: Exercises the prompt's boundaries and edge cases
- **Specific**: Concrete enough that the subagent can act on it
- **Targeted**: Aims at the identified assumptions or edge cases

Present the scenario to the user for approval:

```markdown
## Proposed Test Scenario

**Target:** {which constraint or assumption this tests}

**Scenario:**
{Full description of the situation the subagent will face}

**Expected correct behavior:**
{What the prompt should cause the agent to do}

**Why this is challenging:**
{What makes this scenario a good test}

Proceed with this scenario? (yes / modify / different scenario)
```

Use `AskUserQuestion` to get approval.

### Step 3: RED Phase -- Run the Scenario

Launch a subagent with the following structure:

#### Subagent Prompt Template

```
You are an AI agent. You have been given the following instructions:

---
{PROMPT_TEXT}
---

SCENARIO:
{scenario-description}

Given this scenario, what do you do? Walk through your reasoning step by step.
Make concrete decisions and justify them based on your instructions.
If your instructions are unclear about something, state what is unclear and make your best judgment.
```

Record the subagent's full response. Analyze it for:

- **Correct behaviors**: Actions that align with the prompt's intent
- **Deviations**: Actions that diverge from what the prompt intended
- **Shortcuts**: Steps the agent skipped or simplified
- **Misinterpretations**: Places where the agent read the instructions differently than intended
- **Rationalizations**: Justifications the agent gave for deviating

Document in `.ai-dlc/prompt-tests/{prompt-slug}/`:

```markdown
---
prompt-source: {file path or "inline"}
scenario: {scenario-slug}
phase: red
created: {ISO date}
---

# Prompt Test: {Scenario Title}

## Prompt Under Test
{File path or first 100 chars of inline text}

## Scenario
{Full scenario description}

## RED Phase Result

### Agent Behavior Observed
{Step-by-step account of what the agent did}

### Deviations Found
- **{Deviation 1}**: {Description}
  - **Root cause**: {ambiguity | missing constraint | weak language | implicit assumption}
  - **Agent's reasoning**: "{verbatim quote}"
- **{Deviation 2}**: ...

### Correct Behaviors
- {Behavior that matched expectations}
- ...
```

If no deviations were found, note that the prompt held for this scenario.

### Step 4: GREEN Phase -- Evaluate

For each deviation found, classify it:

| Classification | Meaning | Action |
|---|---|---|
| **Gap** | Prompt lacks instruction for this case | Add instruction |
| **Ambiguity** | Prompt can be read multiple ways | Clarify language |
| **Weakness** | Prompt says the right thing but not forcefully enough | Strengthen language |
| **Assumption** | Prompt assumes context the agent does not have | Make explicit |

If no deviations: the prompt **passes**. Document and move to summary.

```markdown
## GREEN Phase Evaluation

| Deviation | Classification | Severity |
|---|---|---|
| {deviation 1} | {Gap/Ambiguity/Weakness/Assumption} | {High/Medium/Low} |
| {deviation 2} | ... | ... |

### Overall Result: {PASS / FAIL}
```

### Step 5: REFACTOR Phase -- Edit the Prompt

For each deviation classified as a gap, ambiguity, weakness, or assumption:

1. Draft a specific edit to the prompt
2. Present the edit to the user for approval:

```markdown
## Proposed Prompt Edit #{n}

**Addresses:** {deviation description}
**Classification:** {Gap/Ambiguity/Weakness/Assumption}

**Current text:**
> {existing text, or "not present" if gap}

**Proposed text:**
> {new or modified text}

**Why this helps:**
{Explanation of how this closes the gap}

Apply this edit? (yes / modify / skip)
```

Use `AskUserQuestion` to get approval for each edit.

3. After all edits are approved, re-run the same scenario with the edited prompt
4. Verify each deviation is resolved

```markdown
## REFACTOR Phase

### Edits Applied
1. {Edit 1 summary}
2. {Edit 2 summary}

### Re-run Result
{Full or partial re-run results}

### Deviations Resolved
- {deviation 1}: {RESOLVED / STILL PRESENT}
- {deviation 2}: {RESOLVED / STILL PRESENT}
```

If any deviations persist, iterate: propose additional edits and re-test.

### Step 6: Apply Edits

If the prompt source is a file and edits were approved:

1. Apply the edits to the source file
2. Stage and commit:

```bash
git add "${PROMPT_INPUT}"
git commit -m "refine: close prompt gaps found by test-prompt"
```

If the prompt was inline text, present the final edited version for the user to copy.

### Step 7: Commit Test Artifacts

```bash
PROMPT_SLUG="$(echo "${PROMPT_SOURCE}" | sed 's|[/.]|-|g' | sed 's|^-||')"
git add .ai-dlc/prompt-tests/${PROMPT_SLUG}/
git commit -m "test-prompt(${PROMPT_SLUG}): ${SCENARIO_SLUG}"
```

### Step 8: Summary

```markdown
## Test-Prompt Complete

**Prompt:** {source}
**Scenario:** {title}

| Phase | Result |
|-------|--------|
| RED | {N deviations found / No deviations} |
| GREEN | {PASS / FAIL} |
| REFACTOR | {N edits applied / Not needed} |

### Deviations Discovered
{List of deviations, if any}

### Prompt Edits Made
{List of edits applied, if any}

### Next Steps
- Run `/test-prompt {source}` again with a different scenario to find more gaps
- Run `/pressure-testing` if testing a hat definition specifically
```
