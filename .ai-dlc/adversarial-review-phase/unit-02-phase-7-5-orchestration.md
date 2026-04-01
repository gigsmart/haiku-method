---
status: completed
last_updated: "2026-03-30T21:52:36Z"
depends_on: [unit-01-adversarial-review-skill]
branch: ai-dlc/adversarial-review-phase/02-phase-7-5-orchestration
discipline: backend
pass: ""
workflow: ""
ticket: ""
design_ref: ""
views: []
hat: reviewer
---

# unit-02-phase-7-5-orchestration

## Description
Add Phase 7.5 (Adversarial Spec Review) to the elaborate SKILL.md, between the existing Phase 7 (Spec Review) and Phase 8 (Handoff). This phase writes the adversarial review brief, invokes the subagent skill created in unit-01, reads the results, auto-applies high-confidence fixes, and presents remaining findings to the user.

## Discipline
backend - This unit will be executed by general-purpose agents.

## Domain Entities
- **Phase7.5Orchestration**: New section in `plugin/skills/elaborate/SKILL.md` — the full orchestration logic for the adversarial review phase
- **AdversarialReviewBrief**: Brief file the orchestrator writes for the subagent (`.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`)
- **AdversarialReviewResults**: Results file the orchestrator reads after subagent completes
- **Finding**: Individual finding objects parsed from results — triaged by confidence and fix_type for auto-fix vs. user decision

## Data Sources
- **Existing delegated phases in elaborate SKILL.md** (filesystem): Read Phase 2.5 (Domain Discovery), Phase 6.25 (Wireframes), and Phase 6.5+6.75 (Ticket Sync) sections to match the established orchestration pattern (step numbering, brief writing, subagent invocation, results handling, commit pattern)
- **Phase 7 (Spec Review)** (filesystem): Read the existing Phase 7 to understand what it covers, ensuring Phase 7.5 complements rather than duplicates
- **Reviewer hat auto-fix pattern** (filesystem): Read `plugin/hats/reviewer.md` for how the existing review system applies fixes based on confidence levels

## Technical Specification

Insert a new `## Phase 7.5: Adversarial Spec Review (Delegated)` section into `plugin/skills/elaborate/SKILL.md` AFTER the Phase 7 section and BEFORE the Phase 8 section. Follow the exact structural pattern of existing delegated phases.

### Phase 7.5 Steps

#### Step 1: Gather spec context

Read all spec files that the subagent needs to analyze:

```bash
INTENT_SLUG="{intent-slug}"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
INTENT_FILE="${INTENT_DIR}/intent.md"
DISCOVERY_FILE="${INTENT_DIR}/discovery.md"

# Read intent content
INTENT_CONTENT=$(cat "$INTENT_FILE")

# Read all unit files
UNIT_CONTENTS=""
for unit_file in ${INTENT_DIR}/unit-*.md; do
  [ -f "$unit_file" ] || continue
  UNIT_CONTENTS="${UNIT_CONTENTS}\n## $(basename "$unit_file")\n\n$(cat "$unit_file")\n\n---\n"
done

# Read discovery content
DISCOVERY_CONTENT=$(cat "$DISCOVERY_FILE" 2>/dev/null || echo "No discovery log available")
```

#### Step 2: Write adversarial review brief

Write `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
---

# Intent

{Full intent.md content — frontmatter + body}

# Units

{Full content of every unit-*.md file, separated by --- dividers}

# Discovery Context

{Full discovery.md content}
```

Commit the brief:
```bash
git add .ai-dlc/${INTENT_SLUG}/.briefs/elaborate-adversarial-review.md
git commit -m "elaborate(${INTENT_SLUG}): write adversarial review brief"
```

#### Step 3: Invoke adversarial review subagent

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-adversarial-review: {INTENT_SLUG}",
  prompt: "Run the /ai-dlc:elaborate-adversarial-review skill. Read the skill definition at plugin/skills/elaborate/subskills/adversarial-review/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/elaborate-adversarial-review.md as input."
})
```

**CRITICAL — DO NOT STOP HERE.** After the subagent completes, immediately proceed to Step 4.

#### Step 4: Read results

Read `.ai-dlc/{slug}/.briefs/elaborate-adversarial-review-results.md`.

- Parse YAML frontmatter: `status`, `findings_count`, `auto_fixable_count`, `categories_found`
- If `status: error` — report error to user and proceed to Phase 8 (never block elaboration on review failure)
- If `status: success` and `findings_count: 0` — log clean result and proceed to Phase 8
- If `status: success` and `findings_count > 0` — proceed to Step 5

#### Step 5: Auto-apply high-confidence fixes

Parse the findings YAML from the results body. For each finding:

**Auto-apply when ALL of:**
- `confidence: high`
- `fix_type` is one of: `add_dependency`, `add_criterion`, or `spec_edit` (mechanical only — defined as: fixing a typo in a field name, correcting a file path, aligning a quoted reference to its source text)
- `fix_type` is NOT `remove_unit` or `manual`

When a `spec_edit` finding is high-confidence but the edit is non-mechanical (e.g., rewriting a description, restructuring a section), present to user instead of auto-applying.

For auto-applied fixes:
1. Apply the suggested fix to the target file (edit frontmatter for `add_dependency`, append to criteria for `add_criterion`, edit specific section for `spec_edit`)
2. Track which findings were auto-applied

Commit all auto-applied fixes together:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "elaborate(${INTENT_SLUG}): auto-apply adversarial review fixes

Applied {N} high-confidence fixes:
- {F001}: {title}
- {F002}: {title}
..."
```

#### Step 6: Present remaining findings to user

Group remaining findings (not auto-applied) by severity:

```markdown
## Adversarial Review Results

**{findings_count} findings** ({auto_fixable_count} auto-applied, {remaining} for your review)

### Auto-Applied Fixes
{List each auto-applied fix with finding ID, title, and what was changed}

### Findings Requiring Decision

#### Blocking
{For each blocking finding:}
- **{F003}** ({category}, {confidence} confidence): {title}
  - {description}
  - **Suggested fix**: {suggested_fix}

#### Warnings
{Similar format}

#### Suggestions
{Similar format}
```

Use `AskUserQuestion` for each blocking/warning finding (or batch them):

```json
{
  "questions": [{
    "question": "How should we handle these findings?",
    "header": "Findings",
    "options": [
      {"label": "Apply all suggested fixes", "description": "Apply all suggested fixes for the findings above"},
      {"label": "Let me choose", "description": "I'll decide per-finding which to apply"},
      {"label": "Skip all", "description": "Proceed without addressing these findings"}
    ],
    "multiSelect": false
  }]
}
```

If "Let me choose": present each finding individually with Apply/Skip options.

#### Step 7: Apply user-approved fixes

For each user-approved fix:
1. Apply the suggested fix to the target file
2. Commit:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "elaborate(${INTENT_SLUG}): apply user-approved adversarial review fixes

Applied:
- {F003}: {title}
..."
```

#### Step 8: Commit final state

Commit any remaining artifacts:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git diff --cached --quiet || git commit -m "elaborate(${INTENT_SLUG}): finalize adversarial review"
```

Then proceed to Phase 8 (Handoff).

### Integration Points

- **Phase 7 → 7.5**: Phase 7 must complete (PASS or WARN) before Phase 7.5 runs. If Phase 7 returns FAIL and user chooses to fix, those fixes should be committed before Phase 7.5 writes its brief (so the brief reflects the fixed state).
- **Phase 7.5 → 8**: Phase 7.5 always proceeds to Phase 8 regardless of findings. The adversarial review informs but does not hard-block (the user can skip findings).
- **Brief content**: Include FULL intent.md, ALL unit-*.md files, and FULL discovery.md. The subagent needs complete context to do meaningful adversarial analysis.

## Success Criteria
- [ ] Phase 7.5 section exists in `plugin/skills/elaborate/SKILL.md` between Phase 7 and Phase 8
- [ ] Phase follows the delegated phase pattern: gather context → write brief → commit → invoke subagent → read results → handle findings → commit
- [ ] Brief includes full content of intent.md, all unit-*.md files, and discovery.md
- [ ] Orchestrator auto-applies high-confidence fixes (add_dependency, mechanical spec_edit, add_criterion) without user interaction
- [ ] Orchestrator presents medium/low-confidence findings to user via AskUserQuestion with apply/skip options
- [ ] `remove_unit` and `manual` fix types are never auto-applied regardless of confidence
- [ ] All auto-applied fixes are committed with a descriptive commit message listing which findings were applied
- [ ] Phase 7.5 never hard-blocks elaboration — user can always skip findings and proceed to Phase 8
- [ ] Error handling: if subagent fails (status: error), report error and proceed to Phase 8

## Risks
- **Elaborate SKILL.md is already ~2000 lines**: Impact: adding Phase 7.5 makes it larger. Mitigation: the phase follows the established delegated pattern (brief-invoke-read), so most logic lives in the subagent skill (unit-01), not inline. The orchestration section should be ~150-200 lines.
- **Auto-fix modifies specs without user review**: Impact: could introduce errors. Mitigation: only high-confidence deterministic fixes auto-apply. The commit message lists every change. User can always revert.
- **Finding parsing fragility**: Impact: malformed YAML from subagent breaks orchestrator. Mitigation: wrap YAML parsing in error handling. If parsing fails, present raw results to user.

## Boundaries
This unit ONLY modifies `plugin/skills/elaborate/SKILL.md` to add Phase 7.5. It does NOT:
- Create the subagent skill file (that's unit-01)
- Modify any other skills, hats, or workflows
- Add configuration options or settings schema changes
- Modify Phase 7 (Spec Review) — Phase 7.5 complements it, not replaces it

## Notes
- The phase number "7.5" follows the existing convention of using decimal phases for sub-phases (2.25, 2.5, 5.5, 5.6, 5.75, etc.)
- Study Phase 2.5 (Domain Discovery) orchestration most carefully — it's the closest pattern (writes brief, invokes subagent, reads results, presents findings)
- The "CRITICAL — DO NOT STOP HERE" pattern after subagent invocation is essential — copy it from existing delegated phases
- Auto-fix logic should be conservative. When in doubt about whether a fix is "mechanical," don't auto-apply — present to user instead.
