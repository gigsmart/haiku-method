---
description: Proactively surface high-impact improvement ideas from the codebase with adversarial filtering
disable-model-invocation: true
user-invocable: true
argument-hint: "[area]"
---

## Name

`ai-dlc:ideate` - Surface adversarially-filtered improvement ideas from the codebase.

## Synopsis

```
/ideate [area]
```

## Description

**User-facing command** - Analyze the codebase (or a specific area) and surface high-impact improvement ideas that survive adversarial scrutiny.

Inspired by Compound Engineering: every idea must withstand its own counter-argument before being presented. This prevents suggestion bloat and ensures only genuinely valuable improvements reach the user.

The skill operates in five stages:
1. **Analyze** the codebase or specified area
2. **Identify** improvement opportunities across multiple dimensions
3. **Adversarially filter** each idea by arguing against it
4. **Curate** only ideas that survive the filter
5. **Present** with effort/impact assessment

## Implementation

### Step 1: Determine Scope

If the user provides an `[area]` argument, scope the analysis to that area. The area can be:
- A directory path (e.g., `src/api`, `plugin/skills`)
- A conceptual area (e.g., `testing`, `deployment`, `auth`)
- A file pattern (e.g., `*.ts`, `hooks/`)

If no area is provided, analyze the full codebase. For large codebases, focus on:
- Recently changed files (last 20 commits)
- Files with the most churn (frequent changes suggest instability)
- Entry points and critical paths

```bash
AREA="${1:-}"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

if [ -n "$AREA" ]; then
  # Scoped analysis
  TARGET="$REPO_ROOT/$AREA"
  if [ ! -e "$TARGET" ]; then
    # Treat as conceptual area — search for related files
    echo "Searching for files related to: $AREA"
  fi
else
  # Full codebase — prioritize high-churn files
  echo "Analyzing full codebase (prioritizing high-churn areas)"
fi
```

### Step 2: Identify Improvement Opportunities

Scan across five dimensions. For each, look for concrete, specific opportunities — not generic advice.

#### 2a. Performance
- N+1 queries or redundant I/O
- Missing caching where repeated computation occurs
- Synchronous operations that could be parallel
- Oversized bundles or unnecessary dependencies

#### 2b. Security
- Hardcoded secrets or credentials
- Missing input validation or sanitization
- Overly permissive permissions or CORS
- Dependencies with known vulnerabilities

#### 2c. Maintainability
- Code duplication across files
- Functions exceeding reasonable complexity
- Missing or misleading abstractions
- Tight coupling between modules that should be independent

#### 2d. Test Coverage
- Critical paths with no tests
- Tests that pass regardless of implementation (false confidence)
- Missing edge case coverage
- Integration test gaps

#### 2e. Developer Experience
- Confusing naming or inconsistent conventions
- Missing or stale documentation
- Slow feedback loops (build, test, lint)
- Error messages that don't help debugging

### Step 3: Adversarial Filter

This is the critical step. For **every** idea identified in Step 2, argue against it:

1. **Cost**: What's the implementation effort? Does it justify the benefit?
2. **Prematurity**: Is this optimizing before there's a real problem? Is there evidence of actual pain?
3. **Complexity**: Does this add moving parts? Could it introduce new failure modes?
4. **Alternatives**: Is there a simpler way to achieve the same outcome?
5. **Risk**: Could this break existing functionality? What's the blast radius?

Apply a strict filter:
- If the counter-argument is stronger than the argument, **discard the idea**
- If the idea is sound but premature, mark it as **park it**
- If the idea survives all objections, mark it as **do it**
- If the cost clearly outweighs the benefit, mark it as **skip it**

**Be ruthless.** A good ideation session discards more ideas than it keeps. The goal is signal, not volume.

### Step 4: Classify Surviving Ideas

Group surviving ideas by impact:

- **High Impact** — Addresses a real, measurable problem. Clear improvement to reliability, security, or developer velocity.
- **Medium Impact** — Genuine improvement but not urgent. Would make things better over time.
- **Low Impact** — Nice to have. Worth doing if someone is already in the area.

Assign effort ratings (no time estimates):
- **Low** — A focused session. Minimal risk of scope creep.
- **Medium** — Requires design thought. May touch multiple files or systems.
- **High** — Significant undertaking. Needs its own intent/unit planning.

### Step 5: Present Results

Output the results in the following format:

```markdown
## Improvement Ideas for {area|"Full Codebase"}

> Analyzed {N} files across {dimensions examined}. Generated {M} candidate ideas, {K} survived adversarial filtering.

### High Impact

1. **{idea}** — {one-line description}
   - Impact: {what specifically improves and why it matters}
   - Effort: {low|medium|high}
   - Adversarial: {the strongest argument against doing this}
   - Verdict: {do it | park it}

### Medium Impact

1. **{idea}** — {one-line description}
   - Impact: {what specifically improves}
   - Effort: {low|medium|high}
   - Adversarial: {counter-argument}
   - Verdict: {do it | park it}

### Low Impact

1. **{idea}** — {one-line description}
   - Impact: {what improves}
   - Effort: {low|medium|high}
   - Adversarial: {counter-argument}
   - Verdict: {do it | park it}

### Discarded Ideas

> These ideas were considered but did not survive the adversarial filter.

- **{idea}** — Discarded because: {reason}
```

If no area was specified and the codebase is large, append a suggestion:

```markdown
---

**Tip:** Run `/ideate {area}` to deep-dive into a specific area for more targeted ideas.
```

### Step 6: Offer Next Steps

After presenting results, offer:

```markdown
### Next Steps

- **Elaborate**: Pick an idea and run `/elaborate` to plan it as an AI-DLC intent
- **Deep-dive**: Run `/ideate {sub-area}` to explore a specific area further
- **Discard**: If none of these resonate, that's a valid outcome — the adversarial filter may have been too lenient
```

## Design Principles

- **Evidence over intuition**: Every idea must point to specific code, patterns, or metrics. No generic "you should add more tests" suggestions.
- **Adversarial honesty**: The counter-argument must be genuine, not a straw man. If you can't argue against an idea convincingly, it's probably a good idea.
- **Effort realism**: Effort ratings should account for testing, migration, and documentation — not just the happy-path implementation.
- **No time estimates**: Use low/medium/high effort only. Never estimate hours, days, or weeks.
- **Signal over volume**: Five strong ideas beat twenty weak ones. It is acceptable to return zero ideas if nothing survives the filter.
