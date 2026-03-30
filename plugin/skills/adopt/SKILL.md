---
description: Reverse-engineer an existing feature into AI-DLC intent artifacts for /operate and /followup
user-invocable: true
argument-hint: "[feature-description]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Skill
  - AskUserQuestion
  - WebSearch
  - ToolSearch
  - Glob
  - Grep
  - Agent
---

## Name

`ai-dlc:adopt` - Reverse-engineer an existing feature into AI-DLC intent artifacts.

## Synopsis

```
/adopt [feature-description]
```

## Description

**User-facing command** - Adopt an existing, already-built feature into the AI-DLC artifact system. Instead of building something new (like `/elaborate`), this skill analyzes code that already exists and produces `intent.md`, `unit-NN-*.md`, `discovery.md`, and `operations/` files that describe it retroactively.

This addresses scenarios where:
- A feature was built before AI-DLC was adopted and now needs operational management via `/operate`
- A feature needs a follow-up iteration via `/followup` but has no intent artifacts to iterate on
- The team wants to document an existing system's architecture in a structured, machine-readable format
- A complex feature needs to be understood by new team members through its AI-DLC artifacts

**What this produces:**
- An `intent.md` with `status: completed` describing the problem, solution, and domain model
- One or more `unit-NN-*.md` files with `status: completed` reconstructing the logical work units
- A `discovery.md` with exploration findings about the codebase
- Optional `operations/` directory with operation spec files for `/operate`

**What this does NOT do:**
- Modify any existing code
- Create worktrees or branches for construction
- Run tests or builds
- Deploy anything

**Key behavior:** All generated artifacts have `status: completed` since the feature already exists. The adopted intent is fully compatible with `/followup` (to iterate on it) and `/operate` (to manage its operations).

**User Flow:**
```
User: /adopt
AI: What existing feature would you like to adopt into AI-DLC?
User: The authentication system — it's in src/auth/ and was built over the last few months
AI: I'll explore the codebase to understand the auth system...
    [spawns 5 parallel Explore subagents]

    Here's what I found. Does this intent capture the feature accurately?
    [presents proposed intent and unit breakdown]
User: Yes, but split the OAuth unit into two — one for Google, one for GitHub
AI: Updated. Here are the reconstructed success criteria from your tests...
    [presents criteria with test file references]
User: Looks good
AI: Artifacts written to .ai-dlc/auth-system/. What would you like to do next?
    1. Run /operate auth-system
    2. Open PR for review
    3. Show file paths
```

---

## Phase 0: Pre-checks

### Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /adopt cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately. Do NOT proceed.

### Verify Git Repository

```bash
IN_REPO=$(git rev-parse --git-dir 2>/dev/null && echo "true" || echo "false")
if [ "$IN_REPO" != "true" ]; then
  echo "ERROR: /adopt must be run inside a git repository."
  exit 1
fi
```

### Source Library Functions

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/parse.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/state.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/dag.sh"

REPO_ROOT=$(find_repo_root)
```

### Parse Arguments

If an argument was provided, store it as the initial feature description for Phase 1.

```bash
FEATURE_DESCRIPTION="${1:-}"
```

### Check for Slug Conflicts

If a slug can be derived from the argument, verify it doesn't conflict with an existing intent:

```bash
if [ -n "$FEATURE_DESCRIPTION" ]; then
  # Generate candidate slug from description (apply same truncation as Phase 1)
  CANDIDATE_SLUG=$(echo "$FEATURE_DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-50)
  if [ -d "$REPO_ROOT/.ai-dlc/$CANDIDATE_SLUG" ]; then
    echo "WARNING: Intent directory .ai-dlc/$CANDIDATE_SLUG already exists."
    echo "Phase 1 will prompt for how to handle this conflict."
  fi
fi
```

---

## Phase 1: Gather Feature Description

### Get Feature Description

If no argument was provided, ask the user:

```json
{
  "questions": [{
    "question": "What existing feature would you like to adopt into AI-DLC?",
    "header": "Feature Description",
    "options": [],
    "multiSelect": false
  }]
}
```

The user types their feature description directly into the free-text field. If the argument was provided on the command line, use it directly and skip this question.

### Ask for Code Paths

```json
{
  "questions": [{
    "question": "Where does this feature live in the codebase? Provide directories, file patterns, or module names to focus exploration.",
    "header": "Code Paths",
    "options": [
      {"label": "I'll specify paths", "description": "I know the key directories and files"},
      {"label": "Search the whole repo", "description": "Explore the entire codebase to find it"}
    ],
    "multiSelect": false
  }]
}
```

If they choose "I'll specify paths", ask for the paths via free-text input.

### Ask for Git References

```json
{
  "questions": [{
    "question": "Are there specific PRs, branches, or commit ranges that built this feature?",
    "header": "Git History",
    "options": [
      {"label": "Specific PRs/branches", "description": "I can point to the PRs or branches"},
      {"label": "Date range", "description": "It was built between specific dates"},
      {"label": "No specific references", "description": "Just search git history by the code paths"}
    ],
    "multiSelect": false
  }]
}
```

If they provide specific references, record them for Phase 2 exploration.

### Generate Slug

Generate a slug from the feature description:

```bash
SLUG=$(echo "$FEATURE_DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//' | cut -c1-50)
```

Validate the slug doesn't conflict with existing intents:

```bash
if [ -d "$REPO_ROOT/.ai-dlc/$SLUG" ]; then
  # Conflict detected — ask user how to proceed
fi
```

If a conflict is detected, use `AskUserQuestion` to resolve it:

```json
{
  "questions": [{
    "question": "An intent already exists at .ai-dlc/{SLUG}/. How would you like to proceed?",
    "header": "Slug Conflict",
    "options": [
      {"label": "Enter a different slug", "description": "I'll provide an alternative name for this adoption"},
      {"label": "Append to existing", "description": "Add units to the existing intent rather than creating a new one"}
    ],
    "multiSelect": false
  }]
}
```

If the user chooses "Enter a different slug", prompt for the replacement:

```json
{
  "questions": [{
    "question": "Enter a slug for this adoption (alphanumeric and hyphens only, max 50 characters):",
    "header": "Custom Slug",
    "options": [],
    "multiSelect": false
  }]
}
```

Set `SLUG` to the user-provided value (sanitized: lowercase, spaces to hyphens, max 50 chars) before proceeding.

---

## Phase 2: Feature Exploration (Delegated)

Spawn 5 parallel Explore subagents via the `Agent` tool to analyze the existing feature from multiple angles. Each agent runs with `subagent_type: "Explore"`.

### Subagent 1: Code Path Analysis

```
Agent({
  subagent_type: "Explore",
  description: "Explore code paths for adopt",
  prompt: "Analyze the following code paths for the feature '{FEATURE_DESCRIPTION}':
    Paths: {USER_PROVIDED_PATHS or 'search the whole repo'}

    Find and report:
    1. All source files that implement the feature (group by module/directory)
    2. Key entry points (API endpoints, CLI commands, event handlers, UI routes)
    3. Internal dependencies between modules
    4. External dependencies (packages, services, APIs called)
    5. Configuration files related to the feature

    Return a structured summary with file paths and brief descriptions."
})
```

### Subagent 2: Git History Analysis

```
Agent({
  subagent_type: "Explore",
  description: "Explore git history for adopt",
  prompt: "Analyze the git history for the feature '{FEATURE_DESCRIPTION}':
    {If specific PRs/branches provided: 'Focus on: {references}'}
    {If date range provided: 'Focus on commits between {start} and {end}'}
    {If code paths provided: 'Filter git log by paths: {paths}'}

    Find and report:
    1. Logical commit groups (related commits that form a coherent change)
    2. PR/merge commit boundaries if visible in history
    3. Key authors and their contribution areas
    4. The chronological order features were built
    5. Any notable refactors or rewrites visible in history

    Return a structured timeline of how the feature was built."
})
```

### Subagent 3: Test Analysis

```
Agent({
  subagent_type: "Explore",
  description: "Explore tests for adopt",
  prompt: "Find and analyze all tests related to the feature '{FEATURE_DESCRIPTION}':
    {If code paths provided: 'Focus on tests for: {paths}'}

    Find and report:
    1. Test files (unit tests, integration tests, e2e tests)
    2. Test descriptions/names that document verified behaviors
    3. Test fixtures and test utilities specific to this feature
    4. Test coverage patterns (what's well-tested, what's not)
    5. Any test configuration (jest config, pytest config, test helpers)

    Return a structured list of test files with their test case descriptions."
})
```

### Subagent 4: CI Configuration Analysis

```
Agent({
  subagent_type: "Explore",
  description: "Explore CI config for adopt",
  prompt: "Analyze CI/CD configuration relevant to the feature '{FEATURE_DESCRIPTION}':

    Find and report:
    1. CI pipeline files (GitHub Actions, GitLab CI, Jenkins, etc.)
    2. Quality gate commands (lint, type-check, build, test commands)
    3. Feature-specific CI jobs or steps
    4. Environment variables or secrets referenced
    5. Build and deployment scripts

    Return a structured summary of CI checks that validate this feature."
})
```

### Subagent 5: Deployment Surface Analysis

```
Agent({
  subagent_type: "Explore",
  description: "Explore deployment for adopt",
  prompt: "Map the deployment and operational surface for the feature '{FEATURE_DESCRIPTION}':
    {If code paths provided: 'Focus on deployment artifacts near: {paths}'}

    Find and report:
    1. Dockerfiles, container configs, k8s manifests
    2. Deploy scripts, Makefiles, or CI deploy steps
    3. Monitoring config (dashboards, alerts, SLOs, metrics emission)
    4. Scheduled tasks (cron jobs, recurring scripts, scheduled workflows)
    5. Infrastructure as code (Terraform, CloudFormation, Pulumi)
    6. Runbooks or operational documentation

    Return a structured inventory of the deployment and operational surface."
})
```

### Synthesize Results

As subagent results return, synthesize findings into discovery content:

1. **Merge code paths** from Subagent 1 into a module map
2. **Merge git history** from Subagent 2 into a chronological feature timeline
3. **Merge test analysis** from Subagent 3 into a test coverage map
4. **Merge CI analysis** from Subagent 4 into a quality gate inventory
5. **Merge deployment surface** from Subagent 5 into an operational inventory

Build the **Domain Model** from the synthesized results:

```markdown
## Domain Model

### Entities
- **{Entity1}**: {description} — Key fields: {fields}
- **{Entity2}**: {description} — Key fields: {fields}

### Relationships
- {Entity1} has many {Entity2}
- {Entity2} belongs to {Entity3}

### Data Sources
- **{Source1}** ({type}): {what it provides}

### Data Gaps
- {Any gaps discovered during exploration}
```

Present a brief exploration summary to the user before proceeding.

---

## Phase 3: Propose Intent and Units

### Present Proposed Intent

Present the proposed intent derived from exploration:

```markdown
## Proposed Intent: {Title}

### Problem
{What problem does this feature solve? Derived from exploration — code comments,
README sections, PR descriptions, commit messages.}

### Solution
{What the existing code does at a high level. Derived from the module map and
entry points discovered in Phase 2.}

### Domain Model
{The domain model built during Phase 2 synthesis.}
```

### Decompose into Units

Decompose the feature into units using a pragmatic blend:

1. **Start from git history**: Use the logical commit groups and PR boundaries from Subagent 2
2. **Restructure into clean boundaries**: Each unit should own one domain area with one discipline
3. **Mark all units as `status: completed`**: The feature already exists

Present the proposed unit breakdown:

```markdown
## Proposed Units

| # | Unit | Discipline | Description |
|---|------|-----------|-------------|
| 01 | {slug} | {discipline} | {description} |
| 02 | {slug} | {discipline} | {description} |
| ... | ... | ... | ... |
```

### User Confirmation Gate

Use `AskUserQuestion` for confirmation:

```json
{
  "questions": [{
    "question": "Does this intent and unit breakdown accurately capture the feature? You can add, remove, rename, or reorder units.",
    "header": "Intent & Unit Review",
    "options": [
      {"label": "Looks good", "description": "Proceed with this breakdown"},
      {"label": "Adjust units", "description": "I want to add, remove, or rename units"},
      {"label": "Revise intent", "description": "The problem or solution statement needs changes"},
      {"label": "Start over", "description": "Re-explore with different parameters"}
    ],
    "multiSelect": false
  }]
}
```

**Wait for user confirmation.** If they choose "Adjust units" or "Revise intent", engage in dialogue to make the requested changes and re-present. If "Start over", return to Phase 1. Only proceed to Phase 4 when the user approves.

---

## Phase 4: Reverse-Engineer Success Criteria

### Analyze Test Files

For each proposed unit, reconstruct success criteria from the test analysis (Subagent 3 results):

1. **Identify associated test files** by path proximity, import analysis, and naming conventions
2. **Read test descriptions/names** to understand what behaviors are verified
3. **Group related tests** into high-level success criteria
4. **Reference specific test files** as traceable evidence

```markdown
### Unit: unit-01-{slug}

**Success Criteria:**
- [ ] {High-level criterion derived from test group}
  - Verified by: `tests/auth/test_login.py::TestLogin`
- [ ] {Another criterion}
  - Verified by: `tests/auth/test_session.py::TestSessionExpiry`
- [ ] {Criterion without test coverage}
  - Evidence: Code review of `src/auth/middleware.ts` (no test found)
```

### Analyze CI Configuration

For intent-level criteria, extract CI quality gates from Subagent 4 results:

```markdown
### Intent-Level Success Criteria

- [ ] All lint checks pass
  - Verified by: `.github/workflows/ci.yml` step `Run ESLint`
- [ ] Type checking passes
  - Verified by: `.github/workflows/ci.yml` step `Type Check`
- [ ] All tests pass
  - Verified by: `.github/workflows/ci.yml` step `Run Tests`
- [ ] Build succeeds
  - Verified by: `.github/workflows/ci.yml` step `Build`
```

### User Confirmation Gate

Present all criteria to the user:

```json
{
  "questions": [{
    "question": "Do these success criteria accurately reflect what the feature does? Each criterion references traceable evidence (test files or CI checks).",
    "header": "Success Criteria Review",
    "options": [
      {"label": "Approve criteria", "description": "These criteria are accurate"},
      {"label": "Add criteria", "description": "There are additional criteria to include"},
      {"label": "Remove criteria", "description": "Some criteria are incorrect or redundant"},
      {"label": "Revise evidence", "description": "The test file references need correction"}
    ],
    "multiSelect": false
  }]
}
```

**Wait for user confirmation.** Iterate on feedback until approved. All criteria must reference traceable evidence (test files, CI checks, or code review notes).

---

## Phase 5: Generate Operational Plan

### Analyze Deployment Surface

Using the deployment surface analysis from Subagent 5, identify operational concerns:

- **Scheduled tasks**: Cron jobs, recurring scripts, CI-scheduled workflows
- **Monitoring**: Metrics, dashboards, alerts, SLOs
- **Deployment**: Deploy scripts, rollback procedures, scaling config
- **Maintenance**: Migrations, cache invalidation, secret rotation, dependency updates

### Check for Operational Surface

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
STACK_COMPUTE=$(get_stack_layer "compute")
STACK_MONITORING=$(get_stack_layer "monitoring")
STACK_OPS=$(get_stack_layer "operations")
```

If no operational surface is detected (no scheduled tasks, no monitoring, no deploy scripts, and all stack layers are empty), inform the user:

```markdown
No operational surface detected for this feature. Skipping operation generation.
This is normal for libraries, utilities, or features without runtime operational needs.
```

Use `AskUserQuestion` to confirm skipping:

```json
{
  "questions": [{
    "question": "No operational surface was detected. Would you like to skip operation generation or define operations manually?",
    "header": "Operations",
    "options": [
      {"label": "Skip operations", "description": "No operational tasks needed"},
      {"label": "Define manually", "description": "I want to add operational tasks anyway"}
    ],
    "multiSelect": false
  }]
}
```

If skipping, proceed to Phase 6 without operations.

### Generate Operation Spec Files

For each detected operational concern, generate a spec file matching the `operate/SKILL.md` format:

```yaml
---
name: {operation-identifier}
type: scheduled | reactive | process
owner: agent | human
schedule: "0 0 * * *"       # cron expression (for scheduled type)
trigger: "error_rate > 5%"   # condition (for reactive type)
frequency: "quarterly"       # human-readable (for process type)
runtime: node | python | go | shell
---

{Markdown body: description, runbook steps, or checklist}

## Steps
1. {Step description}
2. {Step description}

## Rollback
{How to reverse this operation if it fails}
```

- **Agent-owned operations** (automated scripts): Generate companion scripts (`.sh`, `.ts`, `.py`) alongside the spec
- **Human-owned operations** (manual processes): Generate markdown checklists in the spec body

### User Confirmation Gate

Present the proposed operations:

```json
{
  "questions": [{
    "question": "Here are the operational tasks I've identified. Review and approve, or adjust as needed.",
    "header": "Operations Review",
    "options": [
      {"label": "Approve operations", "description": "These operations are correct"},
      {"label": "Add operations", "description": "There are additional operations to include"},
      {"label": "Remove operations", "description": "Some operations are unnecessary"},
      {"label": "Change ownership", "description": "Some agent/human assignments need changing"}
    ],
    "multiSelect": false
  }]
}
```

**Wait for user confirmation.** Iterate on feedback until approved.

### Synthesize Approved Operations

After user approval, build the `OPERATIONS` array from the confirmed operation specs:

```bash
# Build an array of JSON objects representing each approved operation
# Each element contains the operation name and whether it is agent-owned
OPERATIONS=()
for each approved_op in confirmed_operations; do
  OPERATIONS+=("$(cat <<JSON
{
  "name": "${op_identifier}",
  "type": "${op_type}",
  "owner": "${op_owner}",
  "schedule": "${op_schedule_or_empty}",
  "trigger": "${op_trigger_or_empty}",
  "frequency": "${op_frequency_or_empty}",
  "runtime": "${op_runtime}"
}
JSON
)")
done

# Counts used in Phase 6 state save
OP_COUNT=${#OPERATIONS[@]}
```

If operations were skipped (user chose "Skip operations"), set:
```bash
OPERATIONS=()
OP_COUNT=0
```

---

## Phase 6: Write Artifacts

### Create Intent Directory

```bash
INTENT_DIR="$REPO_ROOT/.ai-dlc/${SLUG}"
mkdir -p "$INTENT_DIR"
mkdir -p "$INTENT_DIR/operations"
```

### Write `intent.md`

Write the intent file with `status: completed`:

```markdown
---
workflow: default
git:
  change_strategy: unit
  auto_merge: false
  auto_squash: false
created: {ISO date}
status: completed
---

# {Intent Title}

## Problem
{Problem statement refined through Phase 3 user confirmation}

## Solution
{Solution description refined through Phase 3 user confirmation}

## Domain Model

### Entities
{Entities from Phase 2 synthesis}

### Relationships
{Relationships from Phase 2 synthesis}

### Data Sources
{Data sources from Phase 2 synthesis}

### Data Gaps
{Data gaps if any, or "None identified."}

## Success Criteria
{Intent-level criteria from Phase 4, with traceable evidence}
- [x] {Criterion} — Verified by: {evidence}
- [x] {Criterion} — Verified by: {evidence}

## Context
{Background, constraints, and decisions from the adoption process.
Note that this intent was created via /adopt to retroactively document
an existing feature.}

Adopted on {ISO date} via `/adopt`.
```

Use `dlc_frontmatter_set` to ensure frontmatter is correctly written:

```bash
dlc_frontmatter_set "status" "completed" "$INTENT_DIR/intent.md"
dlc_frontmatter_set "created" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$INTENT_DIR/intent.md"
```

### Write Unit Files

For each unit approved in Phase 3, write `unit-NN-{slug}.md` with `status: completed`:

```markdown
---
status: completed
last_updated: {ISO date}
depends_on: []
branch: ""
discipline: {discipline}
---

# unit-NN-{slug}

## Description
{Unit description from Phase 3}

## Discipline
{discipline}

## Domain Entities
{Which entities from the domain model this unit works with}

## Data Sources
{Specific APIs, files, or endpoints this unit interacts with}

## Technical Specification
{What the existing code does — specific components, modules, endpoints.
Describes the implementation as-built, not as-planned.}

## Success Criteria
{Criteria from Phase 4, with traceable evidence}
- [x] {Criterion} — Verified by: {test-file-path}
- [x] {Criterion} — Verified by: {test-file-path}

## Risks
- **{Risk}**: {impact}. Mitigation: {current mitigation in place}.

## Boundaries
{What this unit does NOT handle. References to other units.}

## Notes
{Additional context — e.g., "Adopted from existing code in src/auth/".}
```

Use `dlc_frontmatter_set` for each unit:

```bash
dlc_frontmatter_set "status" "completed" "$INTENT_DIR/unit-NN-${UNIT_SLUG}.md"
dlc_frontmatter_set "last_updated" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$INTENT_DIR/unit-NN-${UNIT_SLUG}.md"
```

### Write `discovery.md`

Write the discovery log with exploration findings from Phase 2:

```markdown
---
intent: {slug}
created: {ISO date}
status: completed
---

# Discovery Log: {Intent Title}

Exploration findings from /adopt reverse-engineering process.

## Module Map
{Synthesized code path analysis from Subagent 1}

## Feature Timeline
{Chronological build history from Subagent 2}

## Test Coverage
{Test analysis from Subagent 3}

## CI Quality Gates
{CI configuration analysis from Subagent 4}

## Deployment Surface
{Operational surface analysis from Subagent 5}

## Domain Model
{Final domain model as validated by user in Phase 3}
```

### Write Operation Spec Files

If operations were approved in Phase 5, write each spec to `$INTENT_DIR/operations/`:

```bash
for op in "${OPERATIONS[@]}"; do
  OP_NAME=$(echo "$op" | dlc_json_get "name")
  OP_TYPE=$(echo "$op" | dlc_json_get "type")
  OP_OWNER=$(echo "$op" | dlc_json_get "owner")
  OP_RUNTIME=$(echo "$op" | dlc_json_get "runtime")
  OP_SCHEDULE=$(echo "$op" | dlc_json_get "schedule")
  OP_TRIGGER=$(echo "$op" | dlc_json_get "trigger")
  OP_FREQUENCY=$(echo "$op" | dlc_json_get "frequency")
  OP_FILE="$INTENT_DIR/operations/${OP_NAME}.md"

  # Write the spec file with frontmatter and body
  cat > "$OP_FILE" <<OPEOF
---
name: ${OP_NAME}
type: ${OP_TYPE}
owner: ${OP_OWNER}
$([ -n "$OP_SCHEDULE" ] && echo "schedule: \"${OP_SCHEDULE}\"")
$([ -n "$OP_TRIGGER" ] && echo "trigger: \"${OP_TRIGGER}\"")
$([ -n "$OP_FREQUENCY" ] && echo "frequency: \"${OP_FREQUENCY}\"")
$([ -n "$OP_RUNTIME" ] && echo "runtime: ${OP_RUNTIME}")
---

## Description

Reverse-engineered operational task for \`${SLUG}\`.

## Steps

1. <!-- Describe the steps for this operation based on codebase analysis -->

## Rollback

<!-- Describe how to reverse this operation if it fails -->
OPEOF

  # Write companion script if owner is "agent" (automated operation)
  if [ "$OP_OWNER" = "agent" ] && [ -n "$OP_RUNTIME" ]; then
    case "$OP_RUNTIME" in
      node)       SCRIPT_EXT="ts" ;;
      python)     SCRIPT_EXT="py" ;;
      go)         SCRIPT_EXT="go" ;;
      *)          SCRIPT_EXT="sh" ;;
    esac
    SCRIPT_FILE="$INTENT_DIR/operations/${OP_NAME}.${SCRIPT_EXT}"
    cat > "$SCRIPT_FILE" <<SCRIPTEOF
#!/usr/bin/env ${OP_RUNTIME}
# Companion script for operation: ${OP_NAME}
# Generated by /adopt — fill in implementation from codebase analysis
SCRIPTEOF
  fi
done
```

Each operation spec file follows the format specified in Phase 5 with valid frontmatter matching `operate/SKILL.md`.

### Commit All Artifacts

```bash
git add .ai-dlc/${SLUG}/
git commit -m "adopt(${SLUG}): reverse-engineer existing feature into AI-DLC artifacts"
```

### Record Telemetry

After committing, emit telemetry so intent creation and completion are visible to dashboards:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
aidlc_record_intent_created "${SLUG}" "adopt"
aidlc_record_intent_completed "${SLUG}" "${UNIT_COUNT}"
```

### Save State

Derive counts from the approved artifacts before saving state:

```bash
# Count unit files written in this phase
UNIT_COUNT=$(find "$INTENT_DIR" -maxdepth 1 -name "unit-*.md" | wc -l | tr -d ' ')

# OP_COUNT is already set from the Phase 5 synthesis step (0 if operations were skipped)
dlc_state_save "$INTENT_DIR" "adopt-metadata.json" "{
  \"adopted_on\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"feature_description\": \"${FEATURE_DESCRIPTION}\",
  \"unit_count\": ${UNIT_COUNT},
  \"operation_count\": ${OP_COUNT}
}"
```

---

## Phase 7: Handoff

### Present Summary

```markdown
## Adoption Complete: {Intent Title}

**Slug:** {slug}
**Status:** completed
**Units:** {N} (all completed)
**Operations:** {M} generated
**Discovery:** Written to .ai-dlc/{slug}/discovery.md

### Artifacts Created
| File | Description |
|------|-------------|
| `.ai-dlc/{slug}/intent.md` | Intent definition with domain model |
| `.ai-dlc/{slug}/unit-01-{name}.md` | {brief description} |
| `.ai-dlc/{slug}/unit-02-{name}.md` | {brief description} |
| ... | ... |
| `.ai-dlc/{slug}/discovery.md` | Exploration findings |
| `.ai-dlc/{slug}/operations/{name}.md` | {operation description} |
| ... | ... |

This intent is now compatible with:
- `/followup {slug}` — to iterate on this feature
- `/operate {slug}` — to manage its operational tasks
```

### Offer Next Steps

```json
{
  "questions": [{
    "question": "What would you like to do next?",
    "header": "Next Steps",
    "options": [
      {"label": "Run /operate", "description": "Manage operational tasks for {slug}"},
      {"label": "Open PR", "description": "Create a pull request with the adoption artifacts for review"},
      {"label": "Show file paths", "description": "Just show me the file paths — I'll take it from here"}
    ],
    "multiSelect": false
  }]
}
```

Execute the chosen option:

- **Run /operate**: Invoke `/operate {slug}` via the Skill tool
- **Open PR**: The adoption artifacts are already committed to the current branch. Create a dedicated adoption branch, push it, and open a PR against the default branch:

  ```bash
  # Determine default branch
  source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
  CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
  DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

  # Create and push a dedicated branch for review
  ADOPT_BRANCH="ai-dlc/${SLUG}/main"
  git checkout -b "$ADOPT_BRANCH"
  git push -u origin "$ADOPT_BRANCH"

  gh pr create \
    --title "[AI-DLC Adopt] ${INTENT_TITLE}" \
    --base "$DEFAULT_BRANCH" \
    --head "$ADOPT_BRANCH" \
    --body "$(cat <<EOF
  ## Adoption: ${INTENT_TITLE}

  Reverse-engineered from existing codebase via \`/adopt\`.

  **Slug:** \`${SLUG}\`
  **Units:** ${UNIT_COUNT}
  **Operations:** ${OP_COUNT}

  ### Artifacts
  - \`.ai-dlc/${SLUG}/intent.md\`
  - \`.ai-dlc/${SLUG}/unit-NN-{name}.md\` (${UNIT_COUNT} files)
  - \`.ai-dlc/${SLUG}/discovery.md\`
  $([ "${OP_COUNT}" -gt 0 ] && echo "- \`.ai-dlc/${SLUG}/operations/\` (${OP_COUNT} files)")

  ---
  *Generated by \`/adopt\`. Run \`/followup ${SLUG}\` or \`/operate ${SLUG}\` after merge.*
  EOF
  )"
  ```
- **Show file paths**: List all created file paths and exit

## Examples

### Adopting an Authentication System

```
User: /adopt authentication system
AI: I'll explore the codebase to understand the authentication system.

    Where does this feature live in the codebase?
User: src/auth/ and src/middleware/auth.ts
AI: Are there specific PRs or branches?
User: No, just search the history for those paths

AI: [Spawns 5 Explore subagents in parallel]

    ## Exploration Summary

    Found 23 source files across src/auth/ and src/middleware/.
    Key entry points: POST /api/auth/login, POST /api/auth/register,
    middleware chain in src/middleware/auth.ts.
    12 test files with 47 test cases covering login, registration,
    session management, and OAuth flows.

    ## Proposed Intent: Authentication System

    ### Problem
    Users need secure authentication with multiple providers...

    ### Units
    | # | Unit | Discipline | Description |
    |---|------|-----------|-------------|
    | 01 | auth-models | backend | User and session data models |
    | 02 | jwt-middleware | backend | JWT verification middleware |
    | 03 | oauth-providers | backend | Google and GitHub OAuth integration |
    | 04 | session-management | backend | Session lifecycle and invalidation |

    Does this capture the feature accurately?
User: Looks good

AI: ## Success Criteria (reconstructed from tests)

    ### unit-01-auth-models
    - [x] User model validates email format
      - Verified by: tests/auth/models/test_user.py::TestUserValidation
    - [x] Session model tracks expiry timestamps
      - Verified by: tests/auth/models/test_session.py::TestSessionExpiry
    ...

    Approve these criteria?
User: Approve criteria

AI: No operational surface detected — skipping operations.

    ## Adoption Complete: Authentication System

    **Slug:** authentication-system
    **Units:** 4 (all completed)
    **Operations:** 0

    What would you like to do next?
User: Show file paths

AI: .ai-dlc/authentication-system/intent.md
    .ai-dlc/authentication-system/unit-01-auth-models.md
    .ai-dlc/authentication-system/unit-02-jwt-middleware.md
    .ai-dlc/authentication-system/unit-03-oauth-providers.md
    .ai-dlc/authentication-system/unit-04-session-management.md
    .ai-dlc/authentication-system/discovery.md
```

### Adopting a Feature with Operations

```
User: /adopt billing pipeline
AI: Where does this feature live?
User: src/billing/, and there are cron jobs in scripts/billing/

AI: [Explores codebase]

    ## Proposed Operations
    | Operation | Type | Owner | Schedule |
    |-----------|------|-------|----------|
    | invoice-generation | scheduled | agent | 0 0 1 * * |
    | failed-payment-retry | reactive | agent | payment_failed event |
    | quarterly-reconciliation | process | human | quarterly |

    Approve these operations?
User: Approve operations

AI: Artifacts written to .ai-dlc/billing-pipeline/.
    Includes 3 operation specs in .ai-dlc/billing-pipeline/operations/.

    What would you like to do next?
User: Run /operate
AI: [Invokes /operate billing-pipeline]
```
