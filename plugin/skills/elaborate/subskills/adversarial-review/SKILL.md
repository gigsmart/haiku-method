---
description: (Internal) Autonomous adversarial spec review for H·AI·K·U elaboration
context: fork
agent: general-purpose
user-invocable: false
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
---

# Elaborate: Adversarial Spec Review

Autonomous adversarial review of intent and unit specifications for H·AI·K·U elaboration. This skill runs as a forked subagent -- it reads a brief file from disk, performs systematic adversarial analysis of spec artifacts, and writes structured findings to disk.

**You have NO access to `AskUserQuestion`.** All work is fully autonomous. Write findings to disk -- the main elaboration skill will present results to the user.

---

## Step 1: Read Brief

Read the brief file passed as the first argument. The brief is at the path provided (e.g., `.haiku/intents/{intent-slug}/.briefs/elaborate-adversarial-review.md`).

Parse YAML frontmatter for structured inputs:

```yaml
intent_slug: my-feature
worktree_path: /path/to/.haiku/worktrees/my-feature
```

The markdown body contains:
- Full `intent.md` content (frontmatter + body)
- Full content of every `unit-*.md` file
- Full `discovery.md` content (for validating specs against discovered reality)

**Change directory to the worktree** before any file operations:

```bash
cd "{worktree_path}"
```

### Verify Inputs

After reading the brief, verify the spec artifacts exist on disk. Use `Glob` to find all unit files:

```bash
glob(".haiku/intents/{intent_slug}/stages/*/units/unit-*.md")
glob(".haiku/intents/{intent_slug}/intent.md")
glob(".haiku/intents/{intent_slug}/discovery.md")
```

Read each file via the `Read` tool. The brief body provides a fallback if filesystem reads fail, but **always prefer reading from disk** -- the brief may be stale if specs were edited after the brief was written.

---

## Step 2: Analyze Specs -- Seven Passes

Run all 7 analysis passes against the spec artifacts. Each pass targets a specific category of defect. You MUST complete every pass and record findings for each.

| Pass | Category | What to check |
|---|---|---|
| 1 | `contradiction` | Cross-unit conflicting claims about the same entity, API, behavior, or data source |
| 2 | `hidden-complexity` | Units that appear simple but hide significant technical challenge (e.g., "implement real-time sync" with no conflict resolution mentioned) |
| 3 | `assumption` | Unvalidated assumptions that could invalidate a unit if wrong (cross-reference against discovery.md findings) |
| 4 | `dependency` | Missing `depends_on` edges (unit uses output of another without declaring dependency), unnecessary edges, circular risks |
| 5 | `scope` | YAGNI violations, scope creep beyond the intent's problem statement, gold-plating |
| 6 | `completeness` | Missing success criteria, missing error paths, gaps in technical specification, vague or unverifiable criteria |
| 7 | `boundary` | Unit boundary violations -- work described in one unit that belongs in another, overlapping responsibilities |

### Pass 1: Contradiction

Look for conflicting claims across spec files:

- Same entity described differently in two units (different field names, different types, different lifecycle)
- Intent says one thing, unit says another (e.g., intent says "REST API", unit says "GraphQL")
- Two units both claim to create/own the same artifact or endpoint
- Contradictory completion criteria (one unit requires X, another requires not-X)
- Technology or pattern choices that conflict across units

**Method:** Read each unit and build a map of entities, APIs, data sources, and behaviors mentioned. Cross-reference the maps looking for conflicts.

### Pass 2: Hidden Complexity

Identify units that underestimate the work involved:

- "Simple" CRUD that requires complex validation rules not mentioned
- Real-time features without sync/conflict/retry strategy
- "Just call the API" without error handling, rate limiting, or pagination
- Data migration described as a single step without rollback plan
- Integration with external systems without auth, retry, or failure modes
- UI work without mention of loading states, error states, empty states, or edge cases
- Performance-sensitive operations without benchmarks or optimization criteria

**Method:** For each unit, ask "What could go wrong during implementation that isn't addressed in the spec?" If the answer is non-trivial, that is a finding.

### Pass 3: Assumption

Surface unvalidated assumptions:

- Unit assumes an API endpoint exists that isn't verified in discovery.md
- Unit assumes a data field is always populated (check discovery for evidence)
- Unit assumes a library or framework supports a specific feature
- Unit assumes user behavior without validation
- Unit assumes network reliability, data consistency, or environment configuration
- Intent-level assumptions about project scope or timeline that affect unit viability

**Method:** For each claim in a unit spec, ask "Is this verified in discovery.md?" If the answer is "no" or "partially," that is a finding.

### Pass 4: Dependency

Validate the dependency graph:

- Unit A produces an artifact that Unit B consumes, but B does not list A in `depends_on`
- Unit declares `depends_on` for a unit it does not actually depend on (unnecessary coupling)
- Circular dependency chains (A depends on B, B depends on C, C depends on A)
- Implicit ordering requirements not captured in `depends_on`
- Units that should share a common dependency but declare different approaches

**Method:** Build the dependency graph from `depends_on` frontmatter. Trace data flow and artifact creation across units. Compare the explicit graph to the implicit graph.

### Pass 5: Scope

Check for YAGNI violations and scope creep:

- Features in units that are not required by the intent's problem statement
- Over-engineered solutions when simpler alternatives satisfy the criteria
- "Nice to have" features mixed in with core requirements
- Units that solve problems not mentioned in the intent
- Premature optimization or unnecessary abstraction layers
- Features that extend beyond the intent's stated boundaries

**Method:** For each unit, trace its purpose back to the intent's problem statement. If a unit or criterion cannot be traced, it may be scope creep.

### Pass 6: Completeness

Identify gaps in the specifications:

- Units with vague or unverifiable completion criteria (e.g., "works well", "handles errors", "is performant")
- Missing error handling paths (what happens when the external API is down?)
- Missing edge cases (what about empty data? concurrent access? large payloads?)
- Technical specification gaps (what library? what pattern? what data format?)
- Missing units -- intent describes work that no unit covers
- Criteria that cannot be verified programmatically

**Method:** For each unit's completion criteria, ask "Can an automated reviewer verify this is done by reading code and running tests?" If the answer is "no," the criterion is vague. For each technical claim, ask "Is enough detail specified for a builder to implement without guessing?"

### Pass 7: Boundary

Check that work is correctly assigned to units:

- Work described in one unit that belongs in another (based on domain, discipline, or dependency)
- Two units with overlapping responsibilities (both describe creating the same component)
- Work in a unit that should be split into separate units (too large, too many concerns)
- Work spanning multiple domains packed into a single unit without justification
- Shared concerns (logging, auth, error handling) duplicated across units instead of centralized

**Method:** For each unit, identify its primary domain and responsibility. Check if any described work falls outside that domain. Check if any two units describe overlapping work.

---

## Step 3: Anti-Rationalization Rules

You MUST follow these rules. They exist because agents systematically under-report spec issues.

| Excuse | Reality |
|---|---|
| "The specs look clean, I can't find any issues" | Every spec has at least one area for improvement. If you found zero issues, you did not look hard enough. Re-run passes 2, 3, and 6 more carefully. |
| "I'll rate all findings as low-confidence to avoid blocking" | Artificially deflating confidence defeats the purpose of the review. Rate honestly -- high-confidence findings are the most valuable. |
| "This criterion is a bit vague, but the builder will figure it out" | Vague criteria are the #1 cause of builder/reviewer disagreement. Flag every criterion that cannot be verified programmatically. |
| "There's only one unit, so cross-unit analysis doesn't apply" | Single-unit intents still need intent-to-unit consistency checks, discovery cross-referencing, and scope validation. |

### Red Flags

If you catch yourself doing any of the following, STOP and re-run the relevant pass:

- Completing a pass without examining any specific cross-references between files (e.g., checking fewer than 3 specific claims against discovery.md or cross-unit references)
- Describing a finding but then talking yourself out of reporting it
- Writing a finding and then immediately downgrading its confidence without new evidence
- Skipping a pass because "it doesn't seem relevant to this intent"
- Writing the results file before completing all 7 passes
- Producing fewer than 3 findings total across all passes

**All of these mean: STOP and re-read the spec artifacts more carefully.**

---

## Step 4: Finding Format

Each finding MUST use this exact structure. All 11 fields are required.

```yaml
- id: F001
  category: contradiction
  confidence: high
  severity: blocking
  affected_units: [unit-01-auth-api, unit-03-user-profile]
  title: "Conflicting user ID format between auth and profile units"
  description: >
    unit-01 defines user IDs as UUIDs (completion criterion 3: "user ID is a
    UUID v4"), but unit-03 references user IDs as integer auto-increment IDs
    (technical spec section: "query users by integer ID"). A builder implementing
    unit-03 would create incompatible queries.
  evidence: >
    unit-01-auth-api.md line 42: "user_id: UUID v4 format"
    unit-03-user-profile.md line 28: "SELECT * FROM users WHERE id = {integer}"
  suggested_fix: >
    Align both units on UUID v4 for user IDs. Update unit-03's technical spec
    to use UUID-based queries and update its completion criteria accordingly.
  fix_type: spec_edit
  fix_target: unit-03-user-profile.md
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier, format `F{NNN}` starting from F001 |
| `category` | enum | One of: `contradiction`, `hidden-complexity`, `assumption`, `dependency`, `scope`, `completeness`, `boundary` |
| `confidence` | enum | One of: `high`, `medium`, `low` (see Confidence Assignment Rules below) |
| `severity` | enum | One of: `blocking`, `warning`, `suggestion` |
| `affected_units` | list | Unit slugs affected by this finding (may include `intent.md` for intent-level issues) |
| `title` | string | Short description (one line) |
| `description` | string | Detailed explanation with reasoning -- why is this a problem? |
| `evidence` | string | Specific text from spec files that demonstrates the issue (include file name and approximate location) |
| `suggested_fix` | string | Concrete suggestion for how to resolve the finding |
| `fix_type` | enum | One of: `spec_edit`, `add_dependency`, `remove_unit`, `add_criterion`, `reorder`, `manual` |
| `fix_target` | string | Filename to edit (e.g., `unit-02-data-model.md`), or empty string for `manual` fix_type |

### Severity Rules

- **blocking**: The spec cannot be safely built as-is. A builder would produce incorrect or conflicting output.
- **warning**: The spec has a likely issue that should be addressed but a builder could work around it.
- **suggestion**: The spec could be improved but is functional as-is.

### fix_type Values

| Value | When to use |
|---|---|
| `spec_edit` | The fix requires editing an existing spec file (unit or intent) |
| `add_dependency` | The fix requires adding a `depends_on` entry to a unit |
| `remove_unit` | The fix requires removing or merging a unit (scope/boundary issue) |
| `add_criterion` | The fix requires adding a missing completion criterion |
| `reorder` | The fix requires changing the execution order of units |
| `manual` | The fix requires human judgment or domain expertise to resolve |

---

## Step 5: Confidence Assignment Rules

Confidence indicates how certain you are that the finding is a real issue, not how severe it is (severity handles that separately).

### High Confidence

**Deterministic** -- the finding can be proven from the text of the spec files alone.

Examples:
- Unit A says "user ID is UUID", Unit B says "user ID is integer" -- provable contradiction
- Unit B references "the auth token from unit A" but does not list unit A in `depends_on` -- provable missing dependency
- Completion criterion says "works well" -- provably vague (no programmatic verification possible)
- Discovery.md says "API does not support pagination", but a unit assumes paginated responses -- provable unvalidated assumption

High-confidence findings are the most actionable. They can often be auto-fixed.

### Medium Confidence

**Likely correct but context-dependent** -- the finding requires domain knowledge or judgment to confirm.

Examples:
- "Implement real-time sync" probably hides conflict resolution complexity, but the project may have a simple use case where conflicts cannot occur
- A unit assumes users will always have an email address -- likely true for most apps, but depends on the domain
- Two units overlap slightly in scope -- probably a boundary issue, but could be intentional shared responsibility

Medium-confidence findings should be reviewed by a human but should not be auto-fixed.

### Low Confidence

**Subjective** -- the finding reflects a preference or alternative approach, not an objective defect.

Examples:
- "This unit could be split into two smaller units for cleaner separation" -- valid suggestion but the current split is also reasonable
- "Consider adding a caching layer" -- nice-to-have, not required by the intent
- "The naming convention in unit-03 differs slightly from unit-01" -- stylistic inconsistency

Low-confidence findings are informational. They MUST NOT block spec approval.

---

## Step 6: Write Results

After completing ALL 7 passes and collecting ALL findings, write the results file.

### Results File Path

`.haiku/intents/{intent_slug}/.briefs/elaborate-adversarial-review-results.md`

### Results File Format

````markdown
---
status: success
error_message: ""
findings_count: {total number of findings}
auto_fixable_count: {number of high-confidence findings with non-manual fix_type}
categories_found: [list of categories that had at least one finding]
---

# Adversarial Review Results

## Summary

- **Total findings:** {N}
- **Blocking:** {N}
- **Warning:** {N}
- **Suggestion:** {N}
- **Auto-fixable:** {N} (high-confidence with automatable fix_type)

## Categories

- **contradiction:** {N} findings
- **hidden-complexity:** {N} findings
- **assumption:** {N} findings
- **dependency:** {N} findings
- **scope:** {N} findings
- **completeness:** {N} findings
- **boundary:** {N} findings

## Findings

```yaml
{full YAML array of all findings, using the format from Step 4}
```
````

### Commit Results

After writing the results file, commit it:

```bash
git add .haiku/intents/${INTENT_SLUG}/.briefs/elaborate-adversarial-review-results.md && git commit -m "elaborate(${INTENT_SLUG}): adversarial review results"
```

---

## Error Handling

If any critical error occurs (worktree path does not exist, brief file not found, spec artifacts missing):

1. Write the results file with `status: error` and a descriptive `error_message`:

```markdown
---
status: error
error_message: "{description of what went wrong}"
findings_count: 0
auto_fixable_count: 0
categories_found: []
---

# Adversarial Review Results

## Error

{detailed error description}

## Partial Findings

{any findings gathered before the error occurred, or "None" if the error occurred before analysis began}
```

2. Commit the error results file:

```bash
git add .haiku/intents/${INTENT_SLUG}/.briefs/elaborate-adversarial-review-results.md && git commit -m "elaborate(${INTENT_SLUG}): adversarial review results (error)"
```

3. Include any partial findings gathered before the error.
4. Exit -- the main elaborate skill will read the error status and handle it.
