---
description: Analyze a completed AI-DLC intent cycle and produce reflection artifacts with learnings, metrics, and recommendations
argument-hint: "[intent-slug]"
---

## Name

`ai-dlc:reflect` - Reflection phase for analyzing outcomes and capturing learnings.

## Synopsis

```
/reflect [intent-slug]
```

## Description

**User-facing command** - Analyze a completed (or nearly completed) AI-DLC execution cycle.

The reflect skill:
1. Reads all unit specs, execution state, and operational outcomes for the intent
2. Analyzes the full cycle: execution metrics, what worked, what didn't, patterns
3. Analyzes session transcripts for tool failures, retries, and process friction
4. Produces a `reflection.md` artifact in `.ai-dlc/{intent-slug}/`
5. Produces `settings-recommendations.md` with concrete project config changes
6. Presents findings for user validation and augmentation
7. Offers paths: **Iterate** (create intent v2 with learnings), **Close** (capture org memory and archive), or **Apply** (auto-apply settings recommendations)

## Implementation

### Step 0: Load State

```bash
# Load AI-DLC state using han keep (git-first storage)
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/haiku.sh"

INTENT_SLUG="${1:-$(han keep load intent-slug --quiet 2>/dev/null || echo "")}"
```

If no intent slug found:
```
No AI-DLC intent found.
Run /elaborate to start a new task, or provide an intent slug: /reflect my-intent
```

### Step 1: Load Intent and Unit Data

```bash
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
INTENT_FILE="$INTENT_DIR/intent.md"
```

Read the following artifacts:
- `intent.md` - Intent definition, success criteria, scope
- All `unit-*.md` files - Unit specs with statuses and completion criteria
- `operations.md` - Operational plan (if exists)
- `completion-criteria.md` - Consolidated criteria list (if exists)

If `intent.md` does not exist:
```
No intent found at .ai-dlc/{intent-slug}/intent.md

Run /elaborate to create a new intent.
```

### Step 2: Gather Execution Metrics

Collect data from han keep storage and artifacts:

```bash
# Load iteration state
STATE=$(han keep load iteration.json --quiet 2>/dev/null || echo "")
OP_STATUS=$(han keep load operation-status.json --quiet 2>/dev/null || echo "")

# Get DAG summary
SUMMARY=$(get_dag_summary "$INTENT_DIR")

# Parse per-unit data
for unit_file in "$INTENT_DIR"/unit-*.md; do
  UNIT_NAME=$(basename "$unit_file" .md)
  UNIT_STATUS=$(parse_unit_status "$unit_file")
  UNIT_SCRATCHPAD=$(han keep load scratchpad.md --quiet 2>/dev/null || echo "")
done
```

Metrics to extract:
- **Units completed** vs total
- **Total iterations** (from iteration.json)
- **Workflow used** (from iteration.json)
- **Blockers encountered** (from unit scratchpads and state)
- **Quality gate pass/fail history** (from state if recorded)
- **Operational task status** (from operation-status.json)

### Step 2b: Analyze Session Transcripts

Session transcripts are stored as JSONL files. Find sessions associated with this intent:

```bash
# Claude Code session logs location
PROJECT_HASH_DIR="$HOME/.claude/projects/"

# Find the project hash directory for the current repo
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
# Project dirs are named with path hashes - search for sessions that reference our intent
SESSION_DIR=$(find "$PROJECT_HASH_DIR" -maxdepth 1 -type d | head -20)
```

For each session transcript (JSONL), extract:

1. **Tool failure patterns** - Read the JSONL and look for tool calls that returned errors:
   - Which tools failed most often? (tests, lint, build, git operations)
   - What error patterns repeat? (permission issues, missing deps, type errors)
   - Were failures systemic (bad config) or transient (race conditions)?

2. **Retry loops** - Identify sequences where the same action was attempted multiple times:
   - How many retries per failure? (indicates unclear error messages or brittle gates)
   - Did retries eventually succeed? (transient) or require a different approach? (systemic)

3. **Context loss indicators** - Sessions that restarted or compacted:
   - How many sessions were used for this intent?
   - Did compaction lose critical context? (same questions asked repeatedly)
   - Were artifacts sufficient to restore context? (or did work get repeated)

4. **Hat effectiveness** - Analyze per-hat patterns:
   - Planner plans that were immediately abandoned by the builder
   - Reviewer rejections that led to productive fixes vs circular rework
   - Time/tokens spent per hat relative to value produced

5. **Hook and gate friction** - Identify enforcement patterns:
   - Which hooks blocked progress? Were the blocks justified?
   - Quality gate pass rates per unit
   - Gates that always pass (useless) or always fail (misconfigured)

**Important:** Read session files with the Read tool. Parse JSONL line by line. Focus on the most recent sessions first. If sessions are large, sample representative sections rather than reading entire files.

Produce a structured analysis:

```markdown
## Session Analysis

### Sessions Analyzed
- {N} sessions, {M} total tool calls

### Tool Failure Patterns
| Tool/Gate | Failures | Pattern | Recommendation |
|-----------|----------|---------|----------------|
| {tool} | {count} | {what went wrong} | {config change} |

### Retry Hotspots
- {unit}: {N} retries on {action} - {root cause}

### Context Continuity
- Sessions used: {N}
- Context compactions: {M}
- Repeated work detected: {yes/no, details}

### Hat Effectiveness
| Hat | Units | Avg Iterations | Notes |
|-----|-------|----------------|-------|
| planner | {N} | {avg} | {observations} |
| builder | {N} | {avg} | {observations} |
| reviewer | {N} | {avg} | {observations} |

### Gate Analysis
| Gate | Pass Rate | Notes |
|------|-----------|-------|
| {gate} | {%} | {useful/noisy/misconfigured} |
```

### Step 3: Don the Reflector Hat

Load and follow the Reflector hat instructions from `hats/reflector.md`.

As the Reflector, analyze:

1. **Execution patterns** - Which units went smoothly? Which required retries?
2. **Criteria satisfaction** - How well were success criteria met? Any partial satisfaction?
3. **Process observations** - What approaches worked? What was painful?
4. **Operational outcomes** - How did operational tasks perform? Any gaps?
5. **Blocker analysis** - Were blockers systemic or one-off? Could they be prevented?
6. **Session patterns** - What does the session analysis reveal about process friction?

Ground all analysis in evidence from the artifacts and session data. Do not speculate without data.

### Step 4: Produce reflection.md

Write the reflection artifact to `.ai-dlc/{intent-slug}/reflection.md`:

```markdown
---
intent: {intent-slug}
version: 1
created: {ISO date}
status: complete
---

# Reflection: {Intent Title}

## Execution Summary
- Units completed: N/M
- Total iterations: X
- Workflow: {workflow name}
- Sessions used: N
- Blockers encountered: Z

## What Worked
- {Specific thing with evidence from execution}

## What Didn't Work
- {Specific thing with proposed improvement}

## Session Insights
- {Key finding from session transcript analysis}
- {Tool/gate friction patterns}

## Operational Outcomes
- {How operational tasks performed, if applicable}

## Key Learnings
- {Distilled actionable insight}

## Recommendations
- [ ] {Specific recommendation}

## Next Iteration Seed
{What v2 should focus on, if the user chooses to iterate}
```

### Step 4b: Produce settings-recommendations.md

Based on session analysis and execution patterns, produce concrete settings changes. Write to `.ai-dlc/{intent-slug}/settings-recommendations.md`:

```markdown
# Settings Recommendations

Based on reflection analysis of intent: {intent-slug}

## CLAUDE.md Updates
{Specific rules to add/modify/remove, with rationale}

Example:
- ADD: "When running tests, use --bail to fail fast on first error" (reduces retry loops observed in units 3,5)
- REMOVE: "Always run full test suite before committing" (gate handles this; instruction caused duplicate runs)

## .ai-dlc/settings.yml Changes
{Quality gate configuration changes}

Example:
```yaml
quality_gates:
  typecheck: false  # Disable: 0% failure rate across 8 units, adds latency without catching issues
  tests: true
  lint: true
```

## Hat Instruction Updates
{Specific changes to hat files in .ai-dlc/hats/}

Example:
- builder.md: Add "Check existing test patterns before writing new tests" (units 2,4 wrote tests that duplicated fixtures)
- reviewer.md: Add "Verify import paths resolve before flagging missing modules" (3 false rejections in unit-06)

## Workflow Adjustments
{Changes to .ai-dlc/workflows.yml or intent-level workflow choice}

Example:
- For documentation-heavy intents, use workflow: "default" (planner was skipped 6/8 times with adversarial workflow)

## Elaboration Template Improvements
{How to write better intents/criteria next time}

Example:
- Success criteria should specify test coverage thresholds numerically (units with "adequate coverage" criteria caused 2x reviewer cycles vs units with "80% line coverage")
```

### Step 5: Present Findings for Validation

Output the reflection summary and settings recommendations. Ask the user to:
1. Validate the findings - are they accurate?
2. Add human observations the agent may have missed
3. Correct any mischaracterizations
4. Review settings recommendations before applying

Use `AskUserQuestion` to gather user input.

Update `reflection.md` with any user corrections or additions.

### Step 6: Update State

```bash
# Update reflection status in han keep
REFLECTION_STATE='{"phase":"reflection","reflectionStatus":"awaiting-input","version":1,"previousVersions":[]}'
han keep save reflection-status.json "$REFLECTION_STATE"
```

After user validates:
```bash
REFLECTION_STATE=$(echo "$REFLECTION_STATE" | jq '.reflectionStatus = "complete"')
han keep save reflection-status.json "$REFLECTION_STATE"
```

### Step 7: Offer Next Steps

Present the paths:

```markdown
## Next Steps

The reflection is complete. Choose your path(s):

### Option A: Apply Settings
Auto-apply the settings recommendations to your project.
- Updates CLAUDE.md, settings.yml, hat files, workflows
- Creates a commit with all changes
- You can review the diff before confirming

### Option B: Iterate
Create a new version of this intent with learnings pre-loaded.
- Archives current intent as v1
- Creates new elaboration with reflection context
- Pre-loads recommendations as constraints

### Option C: Close
Capture organizational learnings and archive this intent.
- Distills key learnings into project memory (.claude/memory/)
- Syncs to HAIKU organizational memory (if workspace configured)
- Archives the intent
```

Use `AskUserQuestion` to get the user's choice. Multiple options can be selected (e.g., Apply + Close).

### Step 7a: Apply Settings Path

If user chooses to apply settings:

1. **Read `settings-recommendations.md`** and parse each section
2. **Apply CLAUDE.md changes**: Edit the project's CLAUDE.md file
3. **Apply settings.yml changes**: Update `.ai-dlc/settings.yml`
4. **Apply hat changes**: Edit files in `.ai-dlc/hats/`
5. **Apply workflow changes**: Update `.ai-dlc/workflows.yml`
6. **Show the diff** before committing:
```bash
git diff --stat
git diff
```
7. **Ask user to confirm** before committing
8. **Commit**:
```bash
git add CLAUDE.md .ai-dlc/settings.yml .ai-dlc/hats/ .ai-dlc/workflows.yml
git commit -m "refine: apply reflection recommendations from ${INTENT_SLUG}"
```

### Step 7b: Iterate Path

If user chooses to iterate:

1. **Archive current intent** by tagging:
```bash
git tag "ai-dlc/${INTENT_SLUG}/v${CURRENT_VERSION}" 2>/dev/null || true
```

2. **Seed new intent** with reflection learnings pre-loaded

3. **Output**:
```markdown
## Intent Archived and Ready for v{NEXT_VERSION}

**Archived:** tag ai-dlc/{intent-slug}/v{CURRENT_VERSION}
**New intent:** .ai-dlc/{intent-slug}/

The new intent has been seeded with learnings from the reflection.
Run `/elaborate` to begin the next iteration with pre-loaded context.
```

### Step 7c: Close Path

If user chooses to close:

1. **Distill learnings** into concise, reusable patterns.

2. **Write to project memory** (`.claude/memory/learnings.md`):
```markdown
## {Intent Title} ({ISO date})

### Patterns
- {Reusable pattern from this intent}

### Anti-Patterns
- {What to avoid, with context}

### Process Insights
- {Process improvement that applies broadly}
```

3. **Sync to HAIKU organizational memory** (if workspace configured):

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/haiku.sh"

if haiku_is_configured; then
  HAIKU_WS=$(haiku_resolve_workspace)

  # Write project-level learnings to org memory
  # Distill to org-applicable insights only (not project-specific details)
  haiku_memory_write "learnings" "$ORG_LEARNINGS_CONTENT" "append"

  # Write domain-specific patterns if applicable
  # e.g., software development patterns go to memory/software/
  mkdir -p "$HAIKU_WS/memory/software"
  haiku_memory_write "software/patterns" "$SOFTWARE_PATTERNS" "append"

  echo "Organizational memory synced to HAIKU workspace: $HAIKU_WS"
fi
```

The org memory content should be:
- **Distilled** - not raw project details, but reusable patterns
- **Attributed** - reference the source project and date
- **Actionable** - each learning should change future behavior
- **Deduplicated** - read existing memory first, don't repeat what's already there

Format for org memory entries:
```markdown
### {Pattern Name} (from: {project}, {date})
{Concise description of the pattern or anti-pattern}
**Evidence:** {What happened that surfaced this learning}
**Recommendation:** {What to do differently}
```

4. **Archive intent** by setting status to archived:
```bash
# Update intent.md frontmatter
sed -i.bak 's/^status:.*$/status: archived/' "$INTENT_DIR/intent.md"
rm -f "$INTENT_DIR/intent.md.bak"
```

5. **Output**:
```markdown
## Intent Closed

**Intent:** {title}
**Status:** archived
**Project learnings saved to:** .claude/memory/learnings.md
{if HAIKU configured: **Org learnings synced to:** {workspace}/memory/}

### Key Learnings Captured
{summary of what was written to memory}

### Settings Applied
{summary of settings changes, if Option A was also selected}

The intent has been archived. Learnings are available for future intents.
```
