---
description: Capture learnings from the current session as structured solution files
user-invocable: true
argument-hint: "[topic]"
---

## Name

`ai-dlc:compound` - Capture session learnings as structured solution files.

## Synopsis

```
/compound [topic]
```

## Description

**User-facing command** - Extract learnings from the current session and persist them as structured YAML-frontmatter markdown files in `docs/solutions/`.

The compound skill implements a learning-capture loop: after a session of building, debugging, or designing, the developer (or agent) runs `/compound` to crystallize what was learned into a reusable, searchable knowledge base. This prevents the same problems from being solved twice and builds institutional memory over time.

## Implementation

### Step 1: Analyze Context

Gather the current session's work to understand what happened.

```bash
# Recent commits on this branch
git log --oneline -20

# Files modified in the session
git diff --name-only HEAD~5..HEAD 2>/dev/null || git diff --name-only HEAD

# Current working tree changes
git diff --stat
```

Read any relevant artifacts:
- Recent commit messages for problem/solution signals
- Modified files for context on what area was worked on
- Any `.ai-dlc/` state files for intent/unit context
- Scratchpads and blockers if present

If a `[topic]` argument was provided, use it to focus the analysis on that specific area rather than the full session.

### Step 2: Extract Learnings

Launch **parallel subagents** to analyze the session from four perspectives simultaneously:

#### Subagent A: Context Analyzer

Determine what the situation was:
- What problem or challenge was being addressed?
- What was the starting state?
- What constraints or requirements existed?
- What was the broader context (feature work, bug fix, refactor, incident)?

#### Subagent B: Solution Extractor

Determine what solution was applied:
- What approach was taken?
- What specific changes fixed the problem or achieved the goal?
- Were there false starts or abandoned approaches?
- What worked and why?

#### Subagent C: Prevention Strategist

Determine how to prevent this problem in the future:
- Was this a systemic issue or a one-off?
- What guardrails, tests, or checks would catch this earlier?
- Are there configuration or tooling changes that would help?
- What should a future developer know before touching this area?

#### Subagent D: Category Classifier

Classify the learning:
- **Category**: architecture, debugging, testing, performance, security, patterns, tooling, configuration, integration, deployment, documentation
- **Severity**: low (nice-to-know), medium (saves meaningful time), high (prevents outages or major rework)
- **Tags**: relevant technologies, libraries, frameworks
- **Module/Component**: what part of the codebase this applies to

### Step 3: Synthesize and Write Learning File

Combine the outputs from all four subagents into a single structured file.

**File path**: `docs/solutions/{category}/{problem-slug}.md`

Where:
- `{category}` is the classified category from Subagent D (lowercase, hyphenated)
- `{problem-slug}` is a concise, URL-safe slug describing the problem (e.g., `circular-import-in-hooks`, `flaky-test-race-condition`)

```bash
mkdir -p "docs/solutions/${CATEGORY}"
```

**File format**:

```markdown
---
title: "{Problem Title}"
tags: ["{tech1}", "{tech2}"]
module: "{module-or-area}"
component: "{component}"
category: "{category}"
severity: "{low|medium|high}"
date: "{ISO date}"
---

## Problem
{What went wrong or what was the challenge}

## Root Cause
{Why it happened — the underlying cause, not just the symptom}

## Solution
{What fixed it — specific, actionable, reproducible}

## Prevention
{How to avoid this in the future — guardrails, tests, checks, patterns}

## Key Insight
{The one-sentence takeaway that a future developer should internalize}
```

**Writing guidelines**:
- Be specific and concrete. Reference actual file paths, function names, and error messages.
- The Problem section should be understandable by someone who has never seen this codebase.
- The Solution section should be actionable — someone should be able to follow it step by step.
- The Key Insight should be a single sentence that captures the transferable wisdom.
- Avoid vague language like "be careful with" or "make sure to check". State the specific check.

### Step 4: Validate and Deduplicate

Before committing, check for existing solutions that cover the same ground:

```bash
# Search existing solutions for overlap
ls docs/solutions/${CATEGORY}/ 2>/dev/null
```

If a closely related solution already exists:
- **Same problem, better solution**: Update the existing file instead of creating a new one.
- **Related but distinct**: Create the new file and add a `## See Also` section linking to the related file.
- **Duplicate**: Skip creation and inform the user.

### Step 5: Commit

```bash
git add docs/solutions/ && git commit -m "compound: ${PROBLEM_SLUG}"
```

### Step 6: Report

Output a summary to the user:

```markdown
## Learning Captured

**File:** docs/solutions/{category}/{problem-slug}.md
**Category:** {category}
**Severity:** {severity}

### Key Insight
{The one-sentence takeaway}

### Tags
{comma-separated tags}
```

If the topic argument was not provided and the session contained multiple distinct learnings, offer to run again for additional topics:

```markdown
Other potential learnings detected in this session:
- {brief description of another learning}
- {brief description of another learning}

Run `/compound {topic}` to capture a specific one.
```
