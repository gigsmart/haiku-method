---
description: Pre-delivery code review with fix loop — catches issues locally before external CI/review bots see the PR
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - AskUserQuestion
  - ToolSearch
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
---

# AI-DLC Pre-Delivery Review

Fresh-context, multi-agent code review of the full diff against the base branch. Catches issues locally before external review bots or CI see the PR — eliminating the "push → bot finds issues → fix → push → repeat" cycle.

This skill can be invoked:
- **Standalone** — `/ai-dlc:review` on any branch with uncommitted or committed changes
- **From execute** — called automatically by `/ai-dlc:advance` before PR creation (intent/hybrid strategy)
- **From quick mode** — called automatically by `/ai-dlc:quick` after the hat loop completes

---

## Step 0: Load Review Context

### Determine diff target

```bash
# If inside an AI-DLC intent worktree, use the intent's base branch
INTENT_DIR=""
for dir in .ai-dlc/*/; do
  [ -f "${dir}intent.md" ] && INTENT_DIR="$dir" && break
done

if [ -n "$INTENT_DIR" ]; then
  INTENT_SLUG=$(basename "$INTENT_DIR")
  # Intent worktree — diff against the default branch
  DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
  DIFF_BASE="$DEFAULT_BRANCH"
else
  # Standalone — diff against the current branch's upstream or default branch
  UPSTREAM=$(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo "")
  if [ -n "$UPSTREAM" ]; then
    DIFF_BASE="$UPSTREAM"
  else
    DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
    DIFF_BASE="$DEFAULT_BRANCH"
  fi
fi
```

### Load review guidelines

Read project-specific review instructions from **REVIEW.md** and **CLAUDE.md**. These files are additive — both are included as review context.

```bash
REVIEW_GUIDELINES=""

# REVIEW.md — review-specific rules (repo root)
if [ -f "REVIEW.md" ]; then
  REVIEW_GUIDELINES="$(cat REVIEW.md)"
fi

# Also check for directory-level REVIEW.md files relevant to changed paths
CHANGED_DIRS=$(git diff --name-only "${DIFF_BASE}...HEAD" 2>/dev/null | xargs -I{} dirname {} | sort -u)
for dir in $CHANGED_DIRS; do
  while [ "$dir" != "." ]; do
    if [ -f "${dir}/REVIEW.md" ]; then
      REVIEW_GUIDELINES="${REVIEW_GUIDELINES}"$'\n\n'"## ${dir}/REVIEW.md"$'\n'"$(cat "${dir}/REVIEW.md")"
    fi
    dir=$(dirname "$dir")
  done
done

# CLAUDE.md — general project instructions (also read by Claude Code for all tasks)
CLAUDE_MD=""
if [ -f "CLAUDE.md" ]; then
  CLAUDE_MD="$(cat CLAUDE.md)"
fi
```

### Load review agent config

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
REVIEW_AGENTS=$(get_setting_value "review_agents")
# Defaults: security=true, performance=true, architecture=true, correctness=true, test_quality=true
# Optional: data_integrity, schema_drift, accessibility, api_contract, design_system
```

### Compute the diff

```bash
FULL_DIFF=$(git diff "${DIFF_BASE}...HEAD" 2>/dev/null || git diff "${DIFF_BASE}..HEAD")
DIFF_STAT=$(git diff --stat "${DIFF_BASE}...HEAD" 2>/dev/null || git diff --stat "${DIFF_BASE}..HEAD")
CHANGED_FILES=$(git diff --name-only "${DIFF_BASE}...HEAD" 2>/dev/null || git diff --name-only "${DIFF_BASE}..HEAD")
```

If the diff is empty, tell the user "No changes to review against `{DIFF_BASE}`" and exit.

---

## Step 1: Multi-Agent Review

Spawn specialized review agents **in parallel** using the Agent tool. Each agent gets the full diff, the review guidelines (REVIEW.md + CLAUDE.md), and a focused mandate. Agents run in fresh contexts with no builder bias.

**CRITICAL: Every agent MUST receive the REVIEW.md and CLAUDE.md content as part of its prompt.** These are the project's review rules — findings that violate REVIEW.md "Always check" items should be HIGH severity, and files matching REVIEW.md "Skip" patterns should be excluded.

### Core agents (always run)

```
Agent({
  description: "review: correctness",
  prompt: "You are a code review agent focused on CORRECTNESS.

## Review Guidelines (REVIEW.md)
{REVIEW_GUIDELINES}

## Project Instructions (CLAUDE.md)
{CLAUDE_MD}

## Diff Stats
{DIFF_STAT}

## Full Diff
{FULL_DIFF}

## Your Mandate
Review the diff for:
- Logic errors, off-by-one, null/undefined handling, race conditions
- Missing error handling, unhandled promise rejections
- Broken edge cases, boundary conditions
- Regressions — does the change break existing behavior?
- Any 'Always check' items from REVIEW.md

Skip files matching any 'Skip' patterns from REVIEW.md.

## Output Format
Return findings as a YAML list:
```yaml
findings:
  - severity: HIGH | MEDIUM | LOW
    file: path/to/file
    line: 42
    category: correctness
    title: Brief title
    description: What's wrong and why it matters
    suggested_fix: How to fix it (be specific)
```
If no findings, return `findings: []`"
})
```

Run the same pattern for each core agent, changing the mandate:

| Agent | Mandate |
|-------|---------|
| **Correctness** | Logic errors, edge cases, regressions, error handling |
| **Security** | Injection risks, auth issues, secrets in code, OWASP concerns |
| **Performance** | N+1 queries, unnecessary allocations, missing caching, O(n^2) loops |
| **Architecture** | Separation of concerns, dependency direction, API design, naming consistency |
| **Test Quality** | Missing test coverage for new code paths, test assertions that don't verify behavior, flaky patterns |

### Optional agents (from settings)

For each optional agent enabled in `REVIEW_AGENTS`, spawn an additional agent:

| Agent | When Enabled | Mandate |
|-------|-------------|---------|
| **Data Integrity** | `data_integrity: true` | SQL injection, migration safety, transaction boundaries, data validation |
| **Schema Drift** | `schema_drift: true` | Breaking schema changes, migration ordering, backward compatibility |
| **Accessibility** | `accessibility: true` | WCAG violations, missing ARIA, keyboard navigation, contrast ratios |
| **API Contract** | `api_contract: true` | Breaking API changes, missing versioning, response shape changes |
| **Design System** | `design_system: true` | Design token violations, component misuse, inconsistent spacing/color |

### Spawn all agents in parallel

Launch ALL applicable agents simultaneously — do not serialize them. Each agent is independent and reviews the same diff from its own perspective.

---

## Step 2: Collect and Deduplicate Findings

After all agents complete, collect their YAML findings and:

1. **Parse** each agent's output for the `findings:` YAML block
2. **Deduplicate** — if two agents flagged the same file+line, keep the higher severity
3. **Filter** — remove LOW findings unless there are fewer than 5 total findings (keep the signal-to-noise ratio high)
4. **Sort** by severity (HIGH first), then by file path

### Severity classification

| Severity | Meaning | Blocks delivery? |
|----------|---------|-----------------|
| **HIGH** | Bug that should be fixed before merging | Yes |
| **MEDIUM** | Worth fixing but not blocking | No (noted) |
| **LOW** | Suggestion, style preference | No (noted) |

---

## Step 3: Fix Loop

**If no HIGH findings:** Skip to Step 4.

**If HIGH findings exist:** Enter the fix loop. This is the core value — fixing issues locally before they become PR review comments.

### For each HIGH finding:

1. **Read the affected file** at the indicated line to confirm the finding is valid (not a false positive from diff-only context)
2. **If valid:** Fix it directly. Apply the suggested fix or implement a correct solution.
3. **If false positive:** Note it and skip.

After fixing all HIGH findings:

Stage only the files that were modified during fixes (not `git add -A` which would sweep in unrelated changes):

```bash
# Stage only files touched by the fixes
git add <list of files modified during fixes>
git commit -m "fix: address pre-delivery review findings

- <title> (<file>:<line>)
- <title> (<file>:<line>)"
```

Construct the commit message by listing each fixed HIGH finding as a bullet with its title, file, and line number.

### Re-review

After committing fixes, recompute the diff and run **only the agents that had HIGH findings** again (not all agents — the others already passed).

```bash
# Recompute diff after fixes
FULL_DIFF=$(git diff "${DIFF_BASE}...HEAD" 2>/dev/null || git diff "${DIFF_BASE}..HEAD")
DIFF_STAT=$(git diff --stat "${DIFF_BASE}...HEAD" 2>/dev/null || git diff --stat "${DIFF_BASE}..HEAD")
```

Spawn only the agents that previously found HIGH issues. If they find new HIGH issues (introduced by the fix), fix those too. **Loop until no HIGH findings remain or 3 iterations have passed.**

### Circuit breaker

If after 3 fix iterations there are still HIGH findings, **stop the loop** and present remaining findings to the user via `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Pre-delivery review found issues that couldn't be auto-fixed after 3 attempts. How should we proceed?",
    "header": "Review",
    "options": [
      {"label": "Let me fix manually", "description": "Show me the findings and I'll address them"},
      {"label": "Proceed anyway", "description": "Accept the risk and create the PR with these known issues"},
      {"label": "Abort", "description": "Don't create the PR — I'll investigate"}
    ],
    "multiSelect": false
  }]
}
```

---

## Step 4: Report

Present the review results:

```markdown
## Pre-Delivery Review Complete

**Diff:** {DIFF_STAT summary — files changed, insertions, deletions}
**Base:** {DIFF_BASE}
**Agents:** {count} ran, {count with findings} found issues

### Results
- HIGH: {count} found, {count} fixed ({count} iterations)
- MEDIUM: {count} noted
- LOW: {count} noted

### MEDIUM Findings (not blocking)
{For each MEDIUM finding:}
- **{title}** ({file}:{line}) — {description}

### Decision: APPROVED | NEEDS ATTENTION
```

**APPROVED** when no HIGH findings remain (all fixed or none found).
**NEEDS ATTENTION** when HIGH findings remain after circuit breaker (user decides).

---

## Step 5: Return Result

When called from `/ai-dlc:advance` (as a subagent), return a structured result:

```yaml
status: approved | needs_attention | aborted
iterations: 2
findings_total: 7
findings_fixed: 3
findings_remaining:
  high: 0
  medium: 3
  low: 1
```

When called standalone, the report from Step 4 is the final output.

---

## Standalone Usage

When invoked directly via `/ai-dlc:review`:

1. Run Steps 0-4 as described above
2. After the review completes (**APPROVED** or **NEEDS ATTENTION** where the user chose "Proceed anyway"), ask:

```json
{
  "questions": [{
    "question": "Review complete. What's next?",
    "header": "Next",
    "options": [
      {"label": "Push and create PR", "description": "Push the branch and open a pull request"},
      {"label": "Done", "description": "Review complete — I'll handle the rest"}
    ],
    "multiSelect": false
  }]
}
```

If "Push and create PR":
- Push the current branch to remote
- Create a PR using `gh pr create` with a summary of changes
- Include a note on review status (passed clean, or passed with noted findings)
