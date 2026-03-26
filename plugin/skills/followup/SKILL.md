---
description: Create a follow-up intent that iterates on a previous intent
argument-hint: "[previous-intent-slug]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Skill
  - AskUserQuestion
  - ToolSearch
---

## Name

`ai-dlc:followup` - Create a follow-up intent that iterates on a previous one.

## Synopsis

```
/followup [previous-intent-slug]
```

## Description

**User-facing command** - Create a new intent that builds on, fixes, or enhances a previously completed (or active) intent. Instead of modifying the original intent, this creates a **new independent intent** linked via `iterates_on` frontmatter. During elaboration of the new intent, the system automatically loads context from the previous intent.

This addresses scenarios where:
- MR reviewer requests changes after intent completion
- A bug is discovered after merging
- A descoped feature needs to be added back
- An enhancement builds on what was previously shipped

**User Flow:**
```
User: /followup
AI: Found intents: my-feature, api-refactor. Which is this a follow-up to?
User: my-feature
AI: What does this follow-up address?
User: "MR reviewer asked me to add error handling to the API endpoint"
AI: Created new intent fix-api-error-handling (iterates_on: my-feature).
    Transitioning to /elaborate...
```

**What this does NOT do:**
- Modify the previous intent or its units
- Add units to completed intents
- Re-elaborate the original intent

**Key behavior:** The new intent is fully independent — it has its own slug, its own units, its own worktree. The `iterates_on` field is a reference link that tells the elaboration phase to load prior context automatically.

## Implementation

### Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /followup cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

### Step 1: Find Previous Intent

If a slug was provided as an argument, verify it exists (see sources below). If no slug was provided, scan for intents the user might want to follow up on.

**A: Check filesystem first (highest priority):**

```bash
for intent_file in .ai-dlc/*/intent.md; do
  [ -f "$intent_file" ] || continue
  dir=$(dirname "$intent_file")
  slug=$(basename "$dir")
  status=$(han parse yaml status -r --default active < "$intent_file")
  title=$(han parse yaml title -r --default "$slug" < "$intent_file")
  echo "$slug|$status|$title"
done
```

**B: Check git branches as fallback (for cleaned-up intents):**

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
branch_intents=$(discover_branch_intents true)
echo "$branch_intents" | while IFS='|' read -r slug workflow source branch; do
  [ -z "$slug" ] && continue
  echo "$slug ($source: $branch)"
done
```

**C: Also check for completed intents specifically** (since follow-ups often target completed work):

Look for intent branches in git that may have been cleaned up from the filesystem but still have history:

```bash
git branch -a | grep 'ai-dlc/.*/main$' | sed 's|.*ai-dlc/||;s|/main$||' | sort -u
```

For each discovered slug, try to read its intent.md from the branch:

```bash
git show "ai-dlc/${slug}/main:.ai-dlc/${slug}/intent.md" 2>/dev/null
```

**Selection logic:**
- If slug was provided as argument: validate it exists and proceed
- 1 intent found: auto-select
- Multiple intents found: present them via `AskUserQuestion`
- 0 intents found: error, suggest `/elaborate` to start fresh

```json
{
  "questions": [{
    "question": "Which intent is this a follow-up to?",
    "header": "Previous Intent",
    "options": [
      {"label": "{slug-1}", "description": "{title-1} ({status-1})"},
      {"label": "{slug-2}", "description": "{title-2} ({status-2})"}
    ],
    "multiSelect": false
  }]
}
```

### Step 2: Load Previous Intent Context

Once the previous intent is selected, load its full context:

```bash
PREVIOUS_SLUG="{selected-slug}"

# Try filesystem first
if [ -f ".ai-dlc/${PREVIOUS_SLUG}/intent.md" ]; then
  PREVIOUS_INTENT=$(cat ".ai-dlc/${PREVIOUS_SLUG}/intent.md")
  PREVIOUS_SOURCE="filesystem"
else
  # Fallback: read from git branch
  PREVIOUS_INTENT=$(git show "ai-dlc/${PREVIOUS_SLUG}/main:.ai-dlc/${PREVIOUS_SLUG}/intent.md" 2>/dev/null)
  PREVIOUS_SOURCE="git-branch"
fi

# Load previous units
if [ "$PREVIOUS_SOURCE" = "filesystem" ]; then
  for unit_file in .ai-dlc/${PREVIOUS_SLUG}/unit-*.md; do
    [ -f "$unit_file" ] && cat "$unit_file"
  done
else
  git show "ai-dlc/${PREVIOUS_SLUG}/main" -- ".ai-dlc/${PREVIOUS_SLUG}/unit-*.md" 2>/dev/null || \
  git ls-tree --name-only "ai-dlc/${PREVIOUS_SLUG}/main" ".ai-dlc/${PREVIOUS_SLUG}/" 2>/dev/null | \
    grep 'unit-' | while read -r f; do
      git show "ai-dlc/${PREVIOUS_SLUG}/main:$f" 2>/dev/null
    done
fi
```

Read and store:
- The previous intent's `intent.md` (title, problem, solution, domain model, success criteria)
- All previous unit files (what was built, statuses, specs)
- The previous intent's `discovery.md` if available (domain knowledge)

Present a brief summary to the user:

```markdown
## Previous Intent: {title}

**Status:** {status}
**Units:** {N} ({completed}/{total} completed)
- unit-01-{name}: {status}
- unit-02-{name}: {status}
...

**Problem:** {brief problem statement from intent.md}
**Solution:** {brief solution from intent.md}
```

### Step 3: Ask What the Follow-Up Addresses

Use `AskUserQuestion` to understand the nature of the follow-up:

```json
{
  "questions": [{
    "question": "What does this follow-up address?",
    "header": "Follow-up Reason",
    "options": [
      {"label": "Review feedback", "description": "MR/PR reviewer requested changes"},
      {"label": "Bug fix", "description": "A bug was found after merging"},
      {"label": "Descoped feature", "description": "Adding back a feature that was cut from the original scope"},
      {"label": "Enhancement", "description": "Building on top of what was shipped"}
    ],
    "multiSelect": false
  }]
}
```

Then ask for specifics:

```json
{
  "questions": [{
    "question": "Describe what needs to be done in this follow-up:",
    "header": "Details",
    "options": [],
    "multiSelect": false
  }]
}
```

The user will use the "Other" free-text input to describe the follow-up. Engage in brief dialogue if clarification is needed.

### Step 4: Create New Intent Scaffold

Generate a slug for the new intent derived from the user's description (e.g., `fix-api-error-handling`, `add-pagination-support`).

Create `.ai-dlc/{new-slug}/intent.md` with the `iterates_on` field:

```markdown
---
workflow: {inherit from previous intent or use default}
git:
  change_strategy: {inherit from previous intent}
  auto_merge: {inherit from previous intent}
  auto_squash: false
iterates_on: "{previous-intent-slug}"
created: {ISO date}
status: active
---

# {Follow-up Title}

## Problem
{Description of what needs to change, referencing the previous intent.
e.g., "During review of the {previous title} intent, the reviewer identified
that error handling in the API endpoint is insufficient..."}

## Solution
{High-level approach for this follow-up, noting what exists from the previous
intent and what this iteration changes or adds.}

## Previous Intent Reference
This intent iterates on **{previous title}** (`{previous-slug}`).

### What was built previously
{Summary of units from the previous intent and their outcomes}

### What this iteration changes
{Specific changes, additions, or fixes this follow-up addresses}

## Success Criteria
- [ ] {Criteria specific to this follow-up}

## Context
{Any additional context from the user's description or the review feedback}
```

**Do NOT create units yet.** The elaboration phase handles unit decomposition.

### Step 5: Transition to Elaboration

After creating the intent scaffold, invoke `/elaborate {new-slug}` to let the user flesh out the new intent. The elaborate skill will detect the `iterates_on` field and automatically load context from the previous intent.

```markdown
## Follow-Up Intent Created

**New Intent:** {new title}
**Slug:** {new-slug}
**Iterates On:** {previous-slug} ({previous-title})

The intent scaffold has been created at `.ai-dlc/{new-slug}/intent.md`.
Transitioning to elaboration to flesh out the details...
```

Then invoke the elaborate skill:

```
/elaborate {new-slug}
```

The elaborate skill will:
1. Detect `iterates_on: {previous-slug}` in the intent frontmatter
2. Load the previous intent's context (units, specs, domain model)
3. Use that context to inform clarifying questions, discovery, and unit decomposition
4. Skip or shorten phases where prior context is sufficient

## Examples

### Follow-Up After Review Feedback

```
User: /followup
AI: Found intents:
  - auth-system (completed, 4/4 units done)
  - api-refactor (active, 2/5 units done)

  Which intent is this a follow-up to?

User: auth-system
AI: ## Previous Intent: Auth System Overhaul

  **Status:** completed
  **Units:** 4 (4/4 completed)
  - unit-01-auth-models: completed
  - unit-02-jwt-middleware: completed
  - unit-03-oauth-providers: completed
  - unit-04-session-management: completed

  What does this follow-up address?

User: Review feedback — reviewer said JWT refresh tokens need rotation

AI: ## Follow-Up Intent Created

  **New Intent:** JWT Refresh Token Rotation
  **Slug:** jwt-refresh-token-rotation
  **Iterates On:** auth-system (Auth System Overhaul)

  Transitioning to elaboration...
```

### Follow-Up for Bug Fix

```
User: /followup auth-system
AI: Loaded previous intent: Auth System Overhaul (completed)
    What does this follow-up address?

User: Bug fix — sessions aren't being invalidated on password change

AI: ## Follow-Up Intent Created

  **New Intent:** Fix Session Invalidation on Password Change
  **Slug:** fix-session-invalidation-password-change
  **Iterates On:** auth-system (Auth System Overhaul)

  Transitioning to elaboration...
```
