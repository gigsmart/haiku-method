---
status: completed
last_updated: "2026-03-30T21:44:43Z"
depends_on: []
branch: ai-dlc/adversarial-review-phase/01-adversarial-review-skill
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
---

# unit-01-adversarial-review-skill

## Description
Create the adversarial review subagent skill that reads elaboration spec artifacts and produces structured findings challenging the spec's quality, consistency, and completeness.

## Discipline
backend - This unit will be executed by general-purpose agents.

## Domain Entities
- **AdversarialReviewSkill**: The skill definition file with YAML frontmatter and structured markdown body
- **AdversarialReviewBrief**: Input brief the subagent reads (written by the orchestrator in unit-02)
- **AdversarialReviewResults**: Output results the subagent writes with YAML frontmatter and finding array
- **Finding**: Structured finding object with 7 categories and confidence scoring

## Data Sources
- **Existing subagent skills** (filesystem): Read `plugin/skills/elaborate/subskills/discover/SKILL.md`, `plugin/skills/elaborate/subskills/wireframes/SKILL.md`, and `plugin/skills/elaborate/subskills/ticket-sync/SKILL.md` to match the established pattern (frontmatter structure, brief/results format, section layout, allowed-tools pattern)
- **Reviewer hat confidence scoring** (filesystem): Read `plugin/hats/reviewer.md` for the high/medium/low confidence pattern and how it gates decisions
- **Red Team hat adversarial mindset** (filesystem): Read `plugin/hats/red-team.md` for the adversarial mindset and systematic enumeration approach (note: the anti-rationalization rules in this skill are original, not borrowed from the red-team hat)

## Technical Specification

Create `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` with:

### Frontmatter
```yaml
---
description: (Internal) Autonomous adversarial spec review for AI-DLC elaboration
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
```

### Skill Body Structure

1. **Brief Loading**: Read `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md` to get:
   - `intent_slug` and `worktree_path` from frontmatter
   - Full intent.md content (frontmatter + body)
   - Full content of every unit-*.md file
   - Discovery.md content (full — for validating specs against discovered reality)

2. **Analysis Passes**: The subagent runs 7 analysis passes, one per finding category:

   | Pass | Category | What to check |
   |---|---|---|
   | 1 | `contradiction` | Cross-unit conflicting claims about same entity, API, behavior, or data source |
   | 2 | `hidden-complexity` | Units that appear simple but hide significant technical challenge (e.g., "implement real-time sync" with no conflict resolution mentioned) |
   | 3 | `assumption` | Unvalidated assumptions that could invalidate a unit if wrong (cross-reference against discovery.md findings) |
   | 4 | `dependency` | Missing depends_on edges (unit uses output of another without declaring dependency), unnecessary edges, circular risks |
   | 5 | `scope` | YAGNI violations, scope creep beyond the intent's problem statement, gold-plating |
   | 6 | `completeness` | Missing success criteria, missing error paths, gaps in technical specification, vague or unverifiable criteria |
   | 7 | `boundary` | Unit boundary violations — work described in one unit that belongs in another, overlapping responsibilities |

3. **Anti-Rationalization Rules**: The subagent MUST NOT:
   - Declare specs "clean" without finding at least one issue (even clean specs have opportunities for improvement)
   - Rate all findings as low-confidence to avoid blocking
   - Accept vague criteria ("works well") without flagging them
   - Skip cross-unit analysis for single-unit intents (still check intent ↔ unit consistency)

4. **Finding Format**: Each finding written as:
   ```yaml
   - id: F{NNN}
     category: {one of 7 categories}
     confidence: {high|medium|low}
     severity: {blocking|warning|suggestion}
     affected_units: [{unit slugs}]
     title: "{short description}"
     description: "{detailed explanation with reasoning}"
     evidence: "{specific text from spec files that demonstrates the issue}"
     suggested_fix: "{concrete suggestion for how to fix}"
     fix_type: {spec_edit|add_dependency|remove_unit|add_criterion|reorder|manual}
     fix_target: {filename to edit, or empty for manual}
   ```

5. **Results File**: Write `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`:
   ```yaml
   ---
   status: success  # or error
   error_message: ""
   findings_count: {N}
   auto_fixable_count: {N}  # high-confidence + auto-fixable fix_type
   categories_found: [list of categories with findings]
   ---
   ```
   Followed by the full findings array in a YAML code block.

6. **Confidence Assignment Rules**:
   - **High**: Deterministic — contradictory field references across files, missing depends_on when unit explicitly references another, provably vague criterion ("works well")
   - **Medium**: Likely correct but context-dependent — hidden complexity assessments, assumption challenges, scope judgments
   - **Low**: Subjective — alternative approaches, nice-to-have criteria, stylistic boundary preferences

## Success Criteria
- [ ] Skill file exists at `plugin/skills/elaborate/subskills/adversarial-review/SKILL.md` with correct frontmatter (`context: fork`, `agent: general-purpose`, `user-invocable: false`)
- [ ] Allowed tools are Read, Write, Glob, Grep, Bash only (no AskUserQuestion, no web tools, no MCP)
- [ ] Skill defines all 7 analysis passes (contradiction, hidden-complexity, assumption, dependency, scope, completeness, boundary)
- [ ] Skill defines the structured finding format with all required fields (id, category, confidence, severity, affected_units, title, description, evidence, suggested_fix, fix_type, fix_target)
- [ ] Skill includes anti-rationalization rules preventing premature "all clear" conclusions
- [ ] Skill writes results to `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md` with YAML frontmatter (status, findings_count, auto_fixable_count)
- [ ] Confidence assignment rules are documented (high=deterministic, medium=context-dependent, low=subjective)

## Risks
- **Subagent produces low-quality findings**: Impact: noise in the review process, user loses trust. Mitigation: anti-rationalization rules + clear confidence definitions prevent both false "all clear" and false alarm flooding.
- **Finding format drift from other subagent patterns**: Impact: orchestrator parsing breaks. Mitigation: follow the exact brief/results frontmatter pattern from existing subagent skills.

## Boundaries
This unit creates ONLY the subagent skill file. It does NOT:
- Modify `plugin/skills/elaborate/SKILL.md` (that's unit-02)
- Implement the orchestrator's auto-fix logic (that's unit-02)
- Add settings or configuration options
- Modify any existing hats or workflows

## Notes
- Study the elaborate-discover SKILL.md carefully — it's the closest analog (reads specs, writes structured results, runs autonomously)
- The skill should read spec files via filesystem (Read/Glob), not assume they're in the brief body — but the brief SHOULD include the full content as a fallback
- Keep the skill focused on analysis and finding generation — the orchestrator handles all fix application and user interaction
- The narrower allowed-tools list (Read, Write, Glob, Grep, Bash only — no web, MCP, or Agent) is intentional: this subagent only analyzes local spec files
