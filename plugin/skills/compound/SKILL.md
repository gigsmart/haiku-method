---
name: compound
description: Capture learnings after bolt completion to improve future cycles. Use when a non-trivial problem was solved, a pattern was discovered, or a workaround was found.
user-invocable: true
argument-hint: "[title]"
---

## Name

`ai-dlc:compound` - Capture learnings from the current bolt.

## Synopsis

```
/compound [title]
```

## Description

Captures non-trivial learnings from the current work cycle so future bolts start smarter. Inspired by the Compound Engineering methodology where each cycle improves the next.

**When to use:**
- After solving a non-trivial debugging problem
- After discovering a project-specific pattern or convention
- After finding a workaround for a framework limitation
- After making an architectural decision with non-obvious rationale

**When NOT to use:**
- For trivial fixes (typos, missing imports)
- For information already in project documentation
- For one-off issues unlikely to recur

## Auto-Trigger

This skill auto-triggers when the agent detects phrases like:
- "that worked", "it's fixed", "working now", "problem solved", "that did it"
- "figured it out", "found the issue", "root cause was"

When auto-triggered, the agent should ask: "Would you like me to capture this as a learning for future bolts?"

## Implementation

### Step 1: Identify the Learning

Classify the learning:

| Category | When to Use |
|----------|-------------|
| `performance-issues` | Query optimization, caching, rendering |
| `database-issues` | Migrations, schema, queries, connections |
| `security-issues` | Auth, injection, CORS, tokens |
| `ui-bugs` | Layout, rendering, state management |
| `integration-issues` | API, third-party, webhook |
| `logic-errors` | Business logic, edge cases, off-by-one |
| `developer-experience` | Tooling, config, workflow |
| `workflow-issues` | CI/CD, deployment, testing |
| `best-practices` | Patterns, conventions, idioms |
| `documentation-gaps` | Missing/outdated docs |

### Step 2: Write the Learning

Create a markdown file with YAML frontmatter:

```markdown
---
title: "N+1 Query in User Listing"
category: performance-issues
tags: [activerecord, eager-loading, api, n-plus-one]
module: Users
symptom: "Slow API response, 50+ queries in logs for user list endpoint"
root_cause: "Missing .includes(:profile, :roles) on User.all query"
severity: high
---

## Problem

The `/api/users` endpoint was taking 3+ seconds due to N+1 queries.
Each user's profile and roles were loaded individually.

## Solution

Added eager loading:
```ruby
User.includes(:profile, :roles).where(active: true)
```

## Key Insight

Always check query count in development logs when listing associations.
Rails' `bullet` gem catches these automatically — consider adding it.
```

### Step 3: Save the Learning

```bash
# Create directory if needed
mkdir -p docs/solutions/{category}

# Filename format: {slug}-{module}-{date}.md
# Example: n-plus-one-user-listing-Users-20260325.md
FILENAME="docs/solutions/${CATEGORY}/${SLUG}-${MODULE}-$(date +%Y%m%d).md"

# Write the file
# (use Write tool)

# Commit
git add "$FILENAME"
git commit -m "learning: ${TITLE}"
```

### Step 4: Confirm

Output:
```
## Learning Captured

**Title:** {title}
**Category:** {category}
**Severity:** {severity}
**Saved to:** docs/solutions/{category}/{filename}

This learning will be surfaced in future bolt planning when relevant keywords match.
```

## Retrieval (During Planning)

When the Planner hat runs, it should search for relevant learnings:

```bash
# Search by tags matching current unit's technology
grep -rl "tags:.*{keyword}" docs/solutions/ 2>/dev/null

# Search by module matching current unit
grep -rl "module: {module}" docs/solutions/ 2>/dev/null

# Search by symptom matching current blocker
grep -rl "symptom:.*{symptom-keyword}" docs/solutions/ 2>/dev/null
```

Only read frontmatter first (~30 lines) to assess relevance. Full-read only strongly relevant files.

## Integration with inject-context.sh

The SessionStart hook already loads learnings from `.claude/memory/learnings.md`. The compound skill stores richer, structured learnings in `docs/solutions/` that can be searched programmatically during planning.

Both systems complement each other:
- `.claude/memory/learnings.md` — high-level intent reflections (from /reflect)
- `docs/solutions/` — specific problem/solution pairs (from /compound)

## Integration with /reflect

When `/reflect` runs, it aggregates all compound learnings captured during the intent:

1. **During reflection** — `/reflect` scans `docs/solutions/` for learnings related to the intent's units, identifies cross-cutting patterns, and includes them in the reflection artifact
2. **On Close** — Compound learnings are summarized in `.claude/memory/learnings.md` alongside the high-level intent reflection
3. **Feedback loop** — Patterns identified across multiple compound learnings may surface recommendations for hat instruction changes or workflow adjustments

**The compound cycle:**
```
Build → Solve problem → /compound → Learning saved
                                         ↓
Plan next bolt → Planner searches docs/solutions/ → Learning surfaced
                                         ↓
Reflect on intent → /reflect aggregates compound learnings → Patterns identified
                                         ↓
Close intent → Learnings distilled to project memory → Future intents start smarter
```
