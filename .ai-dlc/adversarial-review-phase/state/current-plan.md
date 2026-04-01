# Tactical Plan: unit-01-adversarial-review-skill

## Bolt 1 — First Iteration

### Unit Summary
Create `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` — a forked subagent skill that reads elaboration spec artifacts and produces structured findings challenging spec quality, consistency, and completeness.

### Completion Criteria (7 total, 0 satisfied)
1. [ ] Skill file exists at `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` with correct frontmatter (`context: fork`, `agent: general-purpose`, `user-invocable: false`)
2. [ ] Allowed tools are Read, Write, Glob, Grep, Bash only (no AskUserQuestion, no web tools, no MCP)
3. [ ] Skill defines all 7 analysis passes (contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary)
4. [ ] Skill defines the structured finding format with all required fields (id, category, confidence, severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target)
5. [ ] Skill includes anti-rationalization rules preventing premature "all clear" conclusions
6. [ ] Skill writes results to `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md` with YAML frontmatter (status, findings_count, auto_fixable_count)
7. [ ] Confidence assignment rules are documented (high=deterministic, medium=context-dependent, low=subjective)

### Pattern Analysis

Studied three existing subagent skills to extract the canonical pattern:

**Common structure across elaborate-discover, elaborate-wireframes, elaborate-ticket-sync:**
- YAML frontmatter with: `description`, `context: fork`, `agent: general-purpose`, `user-invocable: false`, `allowed-tools` list
- Opening paragraph explaining the skill's purpose and that it runs as a forked subagent
- Bold notice: "You have NO access to \`AskUserQuestion\`. All work is fully autonomous."
- Step-by-step structure (Step 1: Read Brief, Step 2-N: work, final step: Write Results)
- Brief reading: parse YAML frontmatter for structured inputs, read markdown body for context
- `cd "{worktree_path}"` before any file operations
- Results file with YAML frontmatter (`status`, `error_message`) + markdown body
- Error handling section at the end
- Git commits after writing artifacts

**Key differences for this skill:**
- Narrower allowed-tools: only Read, Write, Glob, Grep, Bash (no Agent, WebSearch, WebFetch, MCP tools) — intentional isolation for objective review
- Results include additional frontmatter: `findings_count`, `auto_fixable_count`, `categories_found`
- Output is a YAML code block of structured findings, not free-form markdown

**Confidence scoring pattern (from reviewer.md):**
- High: Deterministic — test fails, type error, missing import, criterion unmet. Auto-fixable.
- Medium: Likely correct but context-dependent — naming, structure, design choices.
- Low: Subjective or uncertain — style preferences, alternative approaches, nice-to-haves.

**Anti-rationalization pattern (from red-team.md):**
- Table format with "Excuse" and "Reality" columns
- Each row challenges a common rationalization with a concrete counterpoint
- Red Flags section listing behavioral indicators of rationalization

### Tasks

#### Task 1: Create skill directory and SKILL.md with frontmatter
**Targets criteria:** 1, 2
**Files to create:** `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md`
**Steps:**
1. Create directory `plugin/skills/elaborate/subskills/adversarial-review/`
2. Write SKILL.md with YAML frontmatter:
   - `description: (Internal) Autonomous adversarial spec review for AI-DLC elaboration`
   - `context: fork`
   - `agent: general-purpose`
   - `user-invocable: false`
   - `allowed-tools: [Read, Write, Glob, Grep, Bash]` — exactly 5 tools, no MCP patterns, no Agent, no web tools
3. Write opening paragraph and "no AskUserQuestion" notice matching the pattern from elaborate-discover

**Verification:** Read frontmatter, confirm all 5 fields present with correct values. Confirm allowed-tools has exactly 5 entries.

#### Task 2: Write Step 1 — Brief Loading
**Targets criteria:** (supports 3-7 indirectly — the brief provides inputs for all passes)
**Steps:**
1. Write Step 1 section matching the brief-reading pattern from elaborate-discover
2. Frontmatter fields to parse: `intent_slug`, `worktree_path`
3. Markdown body contains: full intent.md content, full unit-*.md content, discovery.md content
4. Include `cd "{worktree_path}"` instruction
5. Note: the skill should read spec files via filesystem (Read/Glob) as primary, with brief body as fallback

**Verification:** Step 1 reads brief, parses frontmatter, and describes expected body content.

#### Task 3: Write Step 2 — Seven Analysis Passes
**Targets criteria:** 3
**Steps:**
1. Write Step 2 section defining all 7 analysis passes in a table
2. Each pass gets:
   - Pass number (1-7)
   - Category name (contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary)
   - "What to check" description with concrete examples
3. Follow the table format from the unit spec exactly
4. Add prose after the table expanding on each pass with specific things to look for

**Verification:** Count passes — must be exactly 7. Verify all category names match the spec.

#### Task 4: Write Anti-Rationalization Rules
**Targets criteria:** 5
**Steps:**
1. Write anti-rationalization section following the table pattern from red-team.md
2. Include the 4 specific rules from the unit spec:
   - Must NOT declare specs "clean" without finding at least one issue
   - Must NOT rate all findings as low-confidence to avoid blocking
   - Must NOT accept vague criteria without flagging them
   - Must NOT skip cross-unit analysis for single-unit intents
3. Add Red Flags section listing behavioral indicators

**Verification:** All 4 rules present. Table format matches red-team.md pattern.

#### Task 5: Write Finding Format
**Targets criteria:** 4
**Steps:**
1. Write finding format section with YAML code block showing the template
2. Include ALL 11 required fields: id, category, confidence, severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target
3. Document valid values for enum fields:
   - category: 7 values
   - confidence: high, medium, low
   - severity: blocking, warning, suggestion
   - fix_type: spec_edit, add_dependency, remove_unit, add_criterion, reorder, manual

**Verification:** Count fields in the template — must be exactly 11. All enum values documented.

#### Task 6: Write Confidence Assignment Rules
**Targets criteria:** 7
**Steps:**
1. Write confidence rules section with the three levels
2. Match the definitions from the unit spec:
   - High: Deterministic — contradictory field references across files, missing depends_on when unit explicitly references another, provably vague criterion
   - Medium: Likely correct but context-dependent — hidden complexity assessments, assumption challenges, scope judgments
   - Low: Subjective — alternative approaches, nice-to-have criteria, stylistic boundary preferences
3. Include examples for each level

**Verification:** Three levels defined with descriptions and examples matching the spec.

#### Task 7: Write Results File Format and Error Handling
**Targets criteria:** 6
**Steps:**
1. Write results section describing the output file format
2. Path: `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`
3. YAML frontmatter: status, error_message, findings_count, auto_fixable_count, categories_found
4. Body: full findings array in a YAML code block
5. Write error handling section following the pattern from elaborate-discover
6. Include git commit instructions for the results file

**Verification:** Results path matches spec. Frontmatter has all 5 fields. Error handling covers status: error case.

### Execution Order
Tasks 1-7 are sequential parts of a single file creation. The Builder should create the entire SKILL.md in one pass, following the task breakdown as a section-by-section guide.

### Risks

1. **Finding format complexity may confuse subagent execution**: The 11-field finding format is more complex than any existing subagent output. Mitigation: provide a complete example finding in the skill body, not just the template.

2. **Anti-rationalization rules may be too vague to enforce**: Rules like "must find at least one issue" could lead to low-quality filler findings. Mitigation: tie the rule to the confidence system — the subagent must produce findings but can rate uncertain ones as low-confidence/suggestion, which the orchestrator can safely discard.

3. **Brief format not yet defined**: The brief content (what the orchestrator writes) is defined in unit-02, not unit-01. This unit only needs to document what the skill expects to receive. Mitigation: define the expected brief format clearly in Step 1 so unit-02 can match it.

### Key Decisions

- **Follow elaborate-discover pattern most closely**: It is the most analogous (reads specs, writes structured results, runs autonomously). Use it as the primary template.
- **Keep allowed-tools list minimal**: Exactly 5 tools. No MCP, no Agent, no web. This is intentional isolation for objective review.
- **Include a complete example finding**: Reduces ambiguity for the subagent at execution time.
- **Structure as numbered Steps**: Match the Step 1/2/3/N pattern from other subagent skills for consistency.
