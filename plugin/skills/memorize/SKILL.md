---
description: Curate insights from reflections and compound learnings into CLAUDE.md project memory
disable-model-invocation: true
user-invocable: true
argument-hint: "[auto]"
---

## Name

`ai-dlc:memorize` - Curate actionable insights into CLAUDE.md project memory.

## Synopsis

```
/memorize [auto]
```

## Description

**User-facing command** - Extract high-quality, actionable insights from reflection artifacts and compound learnings, then write them to the project's CLAUDE.md under a `## Learnings` section.

The memorize skill closes the feedback loop between execution and instruction. After `/reflect` captures what happened and `/compound` captures what was learned, `/memorize` curates the best insights into CLAUDE.md where they directly influence future agent behavior. This prevents knowledge from being captured but never applied.

The `/memorize auto` variant is designed to run automatically after `/reflect`, requiring no user input.

## Implementation

### Step 1: Gather Source Material

Read recent compound learnings and reflection artifacts.

```bash
# Find compound learnings
SOLUTIONS_DIR="docs/solutions"
if [ -d "$SOLUTIONS_DIR" ]; then
  find "$SOLUTIONS_DIR" -name "*.md" -type f | sort -r | head -20
fi

# Find reflection artifacts
for dir in .ai-dlc/*/; do
  REFLECTION="$dir/reflection.md"
  if [ -f "$REFLECTION" ]; then
    echo "$REFLECTION"
  fi
done
```

Read each file found. Focus on:
- `## Key Learnings` and `## Recommendations` sections from reflection artifacts
- `## Key Insight` and `## Prevention` sections from compound solution files
- `## Settings Recommendations` from `settings-recommendations.md` if present

If no source material is found:
```
No reflection artifacts or compound learnings found.

Run /reflect to analyze a completed intent, or /compound to capture session learnings first.
```

### Step 2: Extract Candidate Insights

From each source file, extract candidate insights. Each candidate must pass the **curation rules**:

#### Curation Rule 1: Relevance
Does this insight apply to future work in this project?

- **Pass**: "Always run database migrations before seeding test data" (applies to ongoing development)
- **Fail**: "The CI server was down on Tuesday" (transient event, not a pattern)

Discard insights that are specific to a single incident with no recurring pattern.

#### Curation Rule 2: Non-redundancy
Is this insight already captured in CLAUDE.md?

```bash
# Read existing CLAUDE.md content
CLAUDE_MD="CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
  cat "$CLAUDE_MD"
fi
```

Compare each candidate against existing CLAUDE.md entries. Discard candidates that are:
- Exact duplicates of existing entries
- Semantic duplicates (same advice in different words)
- Already implied by a more general existing rule

#### Curation Rule 3: Actionability
Can someone act on this insight in future work?

- **Pass**: "Use `--bail` flag when running tests during iteration to fail fast on first error"
- **Fail**: "Testing is important"

Discard insights that are vague, platitudinous, or lack a concrete action.

#### Curation Rule 4: Context Collapse Prevention
Will this insight make sense without the original context?

- **Pass**: "When adding new API endpoints, update the OpenAPI spec before implementing handlers -- the code generator depends on it"
- **Fail**: "Remember to update the thing before the other thing"

Rewrite any insight that references implicit context (specific intent names, unit numbers, session details) to be self-contained. The insight must read clearly to someone who never saw the original reflection or compound learning.

### Step 3: Quality Gates

Each candidate that passed curation rules must also pass quality gates before being written.

#### Quality Gate 1: Coherence
Does the insight read clearly on its own?

Test: Cover the source material and read only the insight. If it requires going back to the source to understand, rewrite it until it stands alone.

Rewrite patterns:
- Replace pronouns with specific nouns ("it" -> "the build pipeline")
- Replace relative references ("the issue" -> "circular import errors in hook modules")
- Add brief context where needed ("When working with X, do Y because Z")

#### Quality Gate 2: Consolidation
Can this insight merge with an existing CLAUDE.md entry?

If an existing entry covers a related topic:
- **Merge**: Combine into a single, stronger entry rather than adding a near-duplicate
- **Extend**: Add a sub-bullet to an existing entry if the new insight refines it
- **Replace**: If the new insight supersedes an old one, update the old entry in place

Prefer fewer, stronger entries over many weak ones.

### Step 4: Write to CLAUDE.md

Write curated insights to CLAUDE.md under a `## Learnings` section.

**Non-destructive rule**: Append only. Never overwrite or remove existing content in CLAUDE.md. The only exception is the consolidation case from Quality Gate 2, where an existing learning entry is strengthened in place.

```bash
CLAUDE_MD="CLAUDE.md"
```

If CLAUDE.md does not exist, create it with the Learnings section:

```markdown
## Learnings

- {insight 1}
- {insight 2}
```

If CLAUDE.md exists but has no `## Learnings` section, append the section at the end of the file.

If `## Learnings` already exists, append new insights as bullet points under the existing section. Do not duplicate the section header.

**Entry format**: Each insight is a single bullet point, concise but complete:

```markdown
## Learnings

- When adding new database migrations, always run `make db-reset` in CI before the test suite -- stale schemas cause false test failures that waste iteration cycles
- Use `--bail` with test commands during bolt iterations to fail fast; full suite runs belong in quality gates only
- API handler tests must mock the rate limiter explicitly; the default test config has no rate limiting, which masks production-only failures
```

### Step 5: Commit

```bash
git add CLAUDE.md && git commit -m "memorize: curate insights into CLAUDE.md"
```

### Step 6: Report

Output a summary to the user:

```markdown
## Insights Curated

**Destination:** CLAUDE.md (## Learnings)

### Added
- {insight 1 summary}
- {insight 2 summary}

### Consolidated
- {existing entry that was strengthened, if any}

### Discarded
- {N} candidates failed relevance filter
- {N} candidates were redundant with existing entries
- {N} candidates lacked actionability

### Sources
- {list of source files that contributed insights}
```

## Auto Mode

When invoked as `/memorize auto` (typically after `/reflect`):

1. Follow the same steps above
2. Skip the report output -- commit silently
3. If no insights pass the curation rules and quality gates, do nothing (no empty commits)

This enables the reflect -> memorize pipeline to run without user intervention while maintaining quality standards.
