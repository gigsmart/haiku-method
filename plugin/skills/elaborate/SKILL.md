---
description: Start AI-DLC mob elaboration to collaboratively define intent, success criteria, and decompose into units. Use when starting a new feature, project, or complex task.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Task
  - Skill
  - WebSearch
  - WebFetch
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only tool patterns (no create/update/delete/send/push/execute)
  - "mcp__*__read*"
  - "mcp__*__get*"
  - "mcp__*__list*"
  - "mcp__*__search*"
  - "mcp__*__query*"
  - "mcp__*__ask*"
  - "mcp__*__resolve*"
  - "mcp__*__fetch*"
  - "mcp__*__lookup*"
  - "mcp__*__analyze*"
  - "mcp__*__describe*"
  - "mcp__*__explain*"
  - "mcp__*__memory"
  # Ticketing provider write tools (epic/ticket creation during elaboration)
  - "mcp__*__create*issue*"
  - "mcp__*__create*ticket*"
  - "mcp__*__create*epic*"
  - "mcp__*__update*issue*"
  - "mcp__*__update*ticket*"
  - "mcp__*__add*comment*"
---

# AI-DLC Mob Elaboration

You are the **Elaborator** starting the AI-DLC Mob Elaboration ritual. Your job is to collaboratively define:
1. The **Intent** - What are we building and why?
2. **Domain Model** - What entities, data sources, and systems are involved?
3. **Success Criteria** - How do we know when it's done?
4. **Units** - Independent pieces of work (for complex intents), each with enough technical detail that a builder with zero prior context builds the right thing

Then you'll write these as files in `.ai-dlc/{intent-slug}/` for the construction phase.

**CRITICAL PRINCIPLE: Elaboration is not a quick phase.** The purpose of elaboration is to build such deep understanding of the domain that the resulting spec is unambiguous. If a builder could misinterpret a unit and build the wrong thing, the elaboration is not done. Do NOT close this phase until you have a clear, specific, technically-grounded spec validated by the user.

**CRITICAL: Handling "Other" / free-text responses.** Every `AskUserQuestion` has a built-in "Other" option that lets the user type free text. When a user selects "Other" and provides free-text input, you MUST treat it as a conversation request — **stop the current phase, engage in open dialogue about what they wrote, and only resume the phase once the conversation reaches a natural conclusion.** Do NOT re-ask the same question or the next question immediately. The user chose "Other" because none of the options fit — respect that by listening and discussing before continuing.

---

## Phase 0 (Pre-check): Environment Check

Before any elaboration, verify the working environment:

1. **Detect cowork mode**: Check `$CLAUDE_CODE_IS_COWORK` environment variable.
   ```bash
   IS_COWORK="${CLAUDE_CODE_IS_COWORK:-}"
   IN_REPO=$(git rev-parse --git-dir 2>/dev/null && echo "true" || echo "false")
   ```
1b. **Detect project maturity**: Read `**Project maturity:**` from the session context injected by the SessionStart hook. If not present, detect directly:
   ```bash
   source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
   PROJECT_MATURITY=$(detect_project_maturity)
   ```
   Values: `greenfield` (brand new, 0-3 commits or minimal source files), `early` (some code but still small), `established` (mature codebase). This value gates Phase 2.5 exploration behavior.
2. If **not cowork** (`IS_COWORK` is empty) **and in a repo** (`IN_REPO` is `true`): proceed to Phase 0 (Existing Intent Check) below.
3. If **cowork** (`IS_COWORK=1`) **or not in a repo**:
   a. **Ask how to access the project**:
      ```json
      {
        "questions": [{
          "question": "How would you like to connect to the project repository?",
          "header": "Repo access",
          "options": [
            {"label": "Local folder", "description": "I have the repo cloned on this machine already — I'll provide the path"},
            {"label": "Clone from URL", "description": "Clone the repository from a remote URL (GitHub, GitLab, etc.)"}
          ],
          "multiSelect": false
        }]
      }
      ```
   b. **If local folder**:
      - Ask the user: "What's the path to the project?" (free text input via "Other" or they can type it directly).
      - Verify it's a git repo: `git -C <path> rev-parse --git-dir 2>/dev/null`
      - If valid: `cd <path>` and proceed normally.
      - If not a valid git repo: tell the user and re-ask.
   c. **If clone from URL**:
      - Ask the user: "What repository should this work target?" If VCS MCP tools are available (e.g., GitHub MCP), offer discovered repos as options.
      - Clone directly — the user's home directory credentials (SSH keys, git credential helpers, `gh`/`glab` auth) are typically available:
        ```bash
        WORKSPACE="/tmp/ai-dlc-workspace-<slug>"
        git clone <url> "$WORKSPACE" 2>&1
        ```
      - **If clone fails** (authentication error, permission denied) — tell the user the clone failed and show the error output. Ask them to ensure their git credentials are configured (e.g., SSH keys in `~/.ssh`, `gh auth login`, `glab auth login`, or a git credential helper) and to grant the cowork session access to their home directory if they haven't already. Then retry once.
        - If it still fails, surface the error clearly and let the user troubleshoot. Do not loop.
      - **Enter the clone**: `cd "$WORKSPACE"`
   d. **Proceed normally** — from this point the working directory is a git repo with `.ai-dlc/settings.yml`, providers config, and all project context. No special cowork paths needed.

**Key principle:** Cloning the repo eliminates the cowork problem surface. Once cloned, all hooks, config loading, and provider discovery work identically to being in a real repo.

---

## Phase 0: Check for Existing Intent (if slug provided)

If the user invoked this with a slug argument:

1. Check if `.ai-dlc/{slug}/intent.md` exists
2. If it exists, check the intent and unit statuses:
   - **Skip if intent status is `complete`**: Tell the user "Intent `{slug}` is already completed. Run `/elaborate` without a slug to start a new intent." Then stop.
   - **Skip if ANY unit has status `in_progress` or `completed`**: Construction has already started — elaboration would conflict with in-flight work. Tell the user "Intent `{slug}` already has units in progress or completed. Use `/resume {slug}` to continue construction or `/construct` to resume the build loop." Then stop.
   - **Only proceed if ALL units have `status: pending`** (no work has begun yet):
3. If all units are pending — **assume the user wants to modify the existing intent**:
   - Read ALL files in `.ai-dlc/{slug}/` directory
   - **Display FULL file contents** to the user in markdown code blocks (never summarize or truncate):
     ```
     ## Current Intent: {slug}

     ### intent.md
     ```markdown
     {full contents of intent.md - every line}
     ```

     ### unit-01-{name}.md
     ```markdown
     {full contents - every line}
     ```

     ... (repeat for all unit files)
     ```
   - Ask with `AskUserQuestion`:
   ```json
   {
     "questions": [{
       "question": "I found an existing intent that hasn't been started. What would you like to do?",
       "header": "Action",
       "options": [
         {"label": "Modify intent", "description": "Review and update the intent definition"},
         {"label": "Modify units", "description": "Adjust the unit breakdown"},
         {"label": "Start fresh", "description": "Delete and re-elaborate from scratch"},
         {"label": "Looks good", "description": "Proceed to /construct as-is"}
       ],
       "multiSelect": false
     }]
   }
   ```
4. Based on their choice:
   - **Modify intent**: Jump to Phase 4 (Success Criteria) with current values pre-filled
   - **Modify units**: Jump to Phase 5 (Decompose) with current units shown
   - **Start fresh**: Delete `.ai-dlc/{slug}/` and proceed to Phase 1
   - **Looks good**: Tell them to run `/construct` to begin

If no slug provided, or the intent doesn't exist, proceed to Phase 1.

**Start fresh cleanup:** When the user chooses "Start fresh", remove the intent worktree and its branch (if they exist from a prior elaboration attempt), then clean up any leftover `.ai-dlc/{slug}/` directory:

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${slug}"
INTENT_BRANCH="ai-dlc/${slug}/main"

# Remove worktree if it exists
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove --force "$INTENT_WORKTREE" 2>/dev/null
fi

# Remove any unit worktrees for this intent
for wt in "${REPO_ROOT}/.ai-dlc/worktrees/${slug}-"*; do
  [ -d "$wt" ] && git worktree remove --force "$wt" 2>/dev/null
done
git worktree prune

# Delete the intent branch if it exists
git branch -D "$INTENT_BRANCH" 2>/dev/null

# Clean up any leftover directory on main (from older elaboration format)
rm -rf ".ai-dlc/${slug}"
```

Then proceed to Phase 1.

---

## Phase 1: Gather Intent

Ask the user: "What do you want to build or accomplish?"

Wait for their answer. Do not explain the process.

Before asking clarification questions, check for configured providers:
- If a spec provider (Notion, Confluence) is configured, search for related specs/documents using read-only MCP tools
- If a ticketing provider (Jira, Linear) is configured, search for related tickets/epics
- If a design provider (Figma) is configured, search for related design files
Use discovered context to inform your clarification questions in Phase 2.

---

## Phase 2: Clarify Requirements

Use `AskUserQuestion` to explore the user's intent. Ask 2-4 questions at a time, each with 2-4 options.

CRITICAL: Do NOT list questions as plain text. Always use the `AskUserQuestion` tool.

Focus your questions on understanding:
- What **specific problem** this solves (not just "build X" but "build X because Y")
- Who uses it and how (the user journey, not just "it's for developers")
- What **systems, APIs, data sources, or codebases** are involved
- Key constraints or non-obvious requirements
- What the user cares about most (what would make them say "this isn't what I wanted"?)

**Do NOT ask generic checkbox questions** like "What's the scope?" or "What's the complexity?" These produce shallow understanding. Instead, ask questions specific to what the user described. If they said "build a dashboard for X", ask about what X's domain model looks like, what data they expect to see, what the key user workflows are.

Continue asking until you can articulate back to the user, in your own words, exactly what they want built. If you can't explain the domain entities, data flows, and user experience in concrete detail, you don't understand it yet.

---

## Phase 2.25: Intent Worktree & Discovery Initialization

Before beginning technical exploration, create the intent worktree and initialize the discovery scratchpad inside it. Creating the worktree early ensures **no artifacts are left on `main`** — all files from this point forward are written on the intent branch.

**CRITICAL — Step 1: Gitignore worktrees directory (MUST run before creating any worktree)**

You MUST ensure `.ai-dlc/worktrees/` is in `.gitignore` BEFORE creating the worktree. Run this as a **separate Bash command** first:

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
mkdir -p "${REPO_ROOT}/.ai-dlc/worktrees"
if ! grep -q '\.ai-dlc/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo '.ai-dlc/worktrees/' >> "${REPO_ROOT}/.gitignore"
  git add "${REPO_ROOT}/.gitignore"
  git commit -m "chore: gitignore .ai-dlc/worktrees"
fi
```

**Step 2: Create the intent worktree**

Only after confirming the gitignore entry exists:

```bash
INTENT_SLUG="{intent-slug}"
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"

# Guard: abort if worktrees dir is not gitignored
if ! grep -q '\.ai-dlc/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo "ERROR: .ai-dlc/worktrees/ is not in .gitignore. Run Step 1 first." >&2
  exit 1
fi

git worktree add -B "$INTENT_BRANCH" "$INTENT_WORKTREE"
cd "$INTENT_WORKTREE"
```

**Tell the user the worktree location** so they know where to find it.

Now initialize the discovery scratchpad. This file persists elaboration findings to disk so they survive context compaction and are available to builders later.

```bash
DISCOVERY_DIR=".ai-dlc/${INTENT_SLUG}"
DISCOVERY_FILE="${DISCOVERY_DIR}/discovery.md"

mkdir -p "$DISCOVERY_DIR"
mkdir -p "$DISCOVERY_DIR/.briefs"

# Initialize discovery.md with frontmatter header
cat > "$DISCOVERY_FILE" << 'DISCOVERY_EOF'
---
intent: {intent-slug}
created: {ISO date}
status: active
---

# Discovery Log: {Intent Title}

Elaboration findings persisted during Phase 2.5 domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

DISCOVERY_EOF
```

This file is written directly in the intent worktree on the `ai-dlc/{intent-slug}/main` branch. No artifacts touch `main`.

Commit the initialized discovery log so the worktree setup is versioned:

```bash
git add .ai-dlc/${INTENT_SLUG}/discovery.md
git commit -m "elaborate(${INTENT_SLUG}): initialize discovery log"
```

This ensures:
- Main working directory stays on `main` for other work
- All discovery findings are written directly on the intent branch
- All subsequent `han keep` operations use the intent branch's storage
- Multiple intents can run in parallel in separate worktrees
- Clean separation between main and AI-DLC orchestration state
- Subagents spawn from the intent worktree, not the original repo

---

## Phase 2.5: Domain Discovery & Technical Exploration (Delegated)

**This phase is mandatory.** Domain discovery runs in a forked subagent to keep the main context lean. The subagent performs deep technical exploration autonomously, writing all findings to `discovery.md` on disk.

### Step 1: Load provider config

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
```

### Step 2: Write discovery brief

Serialize current state into the brief file. Include ALL context the subagent needs — it has no access to your conversation history.

Write `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-discover.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
project_maturity: {PROJECT_MATURITY}
provider_config: {JSON of PROVIDERS object}
---

# Intent Description

{The user's description of what they want to build, from Phase 1}

## Clarification Answers

{All Q&A from Phase 2 — every question asked and the user's response}

## Discovery File Path

{absolute path to discovery.md}
```

### Step 3: Invoke discovery subagent

```
Skill("elaborate-discover", args: ".ai-dlc/{INTENT_SLUG}/.briefs/elaborate-discover.md")
```

**CRITICAL — DO NOT STOP HERE.** Discovery is only one sub-step of elaboration. After the discovery subagent completes, you MUST immediately proceed to Step 4 below. There are many more phases remaining (Domain Model validation, Workflow Selection, Success Criteria, Decomposition, etc.). Stopping after discovery means the elaboration is incomplete.

### Step 4: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-discover-results.md`.

- Parse the YAML frontmatter `status` field
- If `status: error` — report the `error_message` to the user and discuss how to proceed
- If `status: success` — read the domain model summary, key findings, and open questions from the results body

### Step 5: Commit discovery findings

After reading the results (regardless of status), commit the discovery artifacts so the exploration work is versioned:

```bash
git add .ai-dlc/${INTENT_SLUG}/discovery.md .ai-dlc/${INTENT_SLUG}/.briefs/
git commit -m "elaborate(${INTENT_SLUG}): complete domain discovery"
```

### Present Domain Model to User

After exploration, present your findings to the user as a **Domain Model**:

```markdown
## Domain Model

### Entities
- **{Entity1}**: {description} — Fields: {field1}, {field2}, ...
- **{Entity2}**: {description} — Fields: ...

### Relationships
- {Entity1} has many {Entity2}
- {Entity2} belongs to {Entity3}

### Data Sources
- **{Source1}** ({type: GraphQL API / REST API / filesystem / etc.}):
  - Available: {what data can be queried}
  - Missing: {what data is NOT available from this source}
  - Real sample: {abbreviated real data showing what's populated}

### Data Gaps
- {description of any gap between what's needed and what's available}
- {proposed solution for each gap}
```

Use `AskUserQuestion` to validate:
```json
{
  "questions": [{
    "question": "Does this domain model accurately capture the system? Are there entities, relationships, or data sources I'm missing?",
    "header": "Domain Model",
    "options": [
      {"label": "Looks accurate", "description": "The domain model captures the system correctly"},
      {"label": "Missing entities", "description": "There are important entities or relationships not listed"},
      {"label": "Wrong relationships", "description": "Some relationships are incorrect"},
      {"label": "Missing data sources", "description": "There are data sources I haven't discovered"}
    ],
    "multiSelect": true
  }]
}
```

**Do NOT proceed past this phase until the user confirms the domain model is accurate.** If they identify gaps, explore more. This is the foundation everything else builds on.

---

## Phase 3: Discover Hats and Select Workflow

### Step 1: Discover Available Hats

Use `han parse yaml` to read all available hat definitions dynamically:

```bash
# List all hats from plugin directory
for hat_file in "${CLAUDE_PLUGIN_ROOT}/hats/"*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(han parse yaml name -r < "$hat_file" 2>/dev/null)
  desc=$(han parse yaml description -r < "$hat_file" 2>/dev/null)
  echo "- **${name:-$slug}** (\`$slug\`): $desc"
done

# Also check for project-local hat overrides
for hat_file in .ai-dlc/hats/*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(han parse yaml name -r < "$hat_file" 2>/dev/null)
  desc=$(han parse yaml description -r < "$hat_file" 2>/dev/null)
  echo "- **${name:-$slug}** (\`$slug\`): $desc [project override]"
done
```

Display the available hats to the user so they can see what's available for workflow composition.

### Step 2: Discover Available Workflows

Read workflows from plugin defaults and project overrides:

```bash
# Plugin workflows (defaults)
cat "${CLAUDE_PLUGIN_ROOT}/workflows.yml"

# Project workflow overrides (if any)
[ -f ".ai-dlc/workflows.yml" ] && cat ".ai-dlc/workflows.yml"
```

### Step 3: Select or Compose Workflow

This step has three parts: show what's available, make a recommendation, then let the user decide.

#### 3a. Preflight — Display Available Options

First, show the user all predefined workflows (from Step 2) and available hats (from Step 1) so they have full visibility before any recommendation:

```markdown
## Available Workflows

{List each predefined workflow with its hat sequence, from Step 2}

## Available Hats

{List each hat with its slug and one-line description, from Step 1}
```

#### 3b. Recommendation — Suggest the Best Fit

Analyze the intent against the available options. Consider:
- What phases does this intent actually need? (Not every intent needs planning — a pure refactor might skip straight to builder.)
- Does the domain suggest specialized hats? (Security-sensitive work benefits from red-team/blue-team. Bug investigations benefit from observer/hypothesizer.)
- Keep it minimal — every hat adds an iteration cycle. Don't add hats "just in case."

Present your recommendation with reasoning:

```markdown
## Recommendation

**{workflow name or "Custom"}**: {hats as arrows}

{1-2 sentences explaining why this fits the intent. Reference specific aspects of what the user described.}
```

The recommendation can be a predefined workflow or a custom composition — whichever best fits. If suggesting a custom sequence, explain what each hat contributes to this specific intent.

#### 3c. User Decides

Use `AskUserQuestion` with the predefined workflows as options. Do NOT hardcode options — use the workflows discovered in Step 2:

```json
{
  "questions": [{
    "question": "Which workflow would you like to use?",
    "header": "Workflow",
    "options": [
      {"label": "{recommended} (Recommended)", "description": "{hats as arrows}"},
      {"label": "{workflow2}", "description": "{hats as arrows}"},
      {"label": "{workflow3}", "description": "{hats as arrows}"},
      {"label": "Custom", "description": "Tell me which hats to use and in what order"}
    ],
    "multiSelect": false
  }]
}
```

If your recommendation is a custom composition, include it as the first option with "(Recommended)". The predefined workflows still appear as alternatives.

If the user selects "Custom", ask them to specify which hats to include and in what order.

---

## Phase 4: Define Success Criteria

Work with the user to define 3-7 **verifiable** success criteria. Each MUST be:
- **Specific** - Unambiguous
- **Measurable** - Programmatically verifiable
- **Testable** - Can write a test for it

Good:
```
- [ ] API endpoint returns 200 with valid auth token
- [ ] Invalid tokens return 401 with error message
- [ ] Rate limit of 100 requests/minute is enforced
- [ ] All existing tests pass
```

Bad:
```
- [ ] Code is clean
- [ ] API works well
```

### Non-Functional Requirements

Before confirming criteria, explicitly ask the user about non-functional dimensions using `AskUserQuestion`. Select the dimensions relevant to this intent:

- **Performance** — Response times, throughput, latency budgets (e.g., "p95 < 200ms")
- **Security** — Auth requirements, data protection, OWASP concerns
- **Accessibility** — WCAG level, screen reader support, keyboard navigation
- **Observability** — Logging, metrics, tracing, alerting requirements
- **Scalability** — Load expectations, concurrency limits, growth projections

Each non-functional requirement MUST be expressed as a verifiable success criterion. Do NOT accept vague NFRs — "performant" is not a criterion, "p95 response < 200ms under 1000 req/s" is.

Add confirmed NFRs to the success criteria list before presenting for final confirmation.

**Before asking for confirmation, display the full criteria list as a numbered markdown checklist so the user can see exactly what they're approving.** Do NOT ask "are these complete?" without showing what "these" are. Example:

```
## Success Criteria

1. [ ] API endpoint returns 200 with valid auth token
2. [ ] Invalid tokens return 401 with error message
3. [ ] Rate limit of 100 requests/minute is enforced
4. [ ] All existing tests pass
5. [ ] p95 response < 200ms under 1000 req/s
```

Then use `AskUserQuestion` to confirm:
```json
{
  "questions": [{
    "question": "Are these success criteria complete?",
    "header": "Criteria",
    "options": [
      {"label": "Yes, looks good", "description": "Proceed with these criteria"},
      {"label": "Need to add more", "description": "I have additional criteria"},
      {"label": "Need to revise", "description": "Some criteria need adjustment"}
    ],
    "multiSelect": false
  }]
}
```

---

## Phase 5: Decompose into Units

Decompose the intent into **Units** — independent pieces of work. This is NOT optional for complex intents. **You decide** whether decomposition is needed based on the scope:

- **Single unit**: The intent touches one concern, one area of code, one deliverable. No decomposition needed — create one unit and proceed.
- **Multiple units**: The intent spans multiple concerns, systems, layers, or deliverables. Decompose into 2-5 units.

Do NOT ask the user whether to decompose. Assess the complexity from the domain model, success criteria, and data sources — then decompose accordingly.

**Hard rules for unit boundaries:**

1. **Units MUST NOT span dependency boundaries.** If a piece of work depends on another piece being done first, those are two separate units with an explicit `depends_on` edge. This applies regardless of change strategy (`unit` or `intent`). A unit that contains both "set up the database schema" and "build the API that uses it" is a bad unit — those are two units where the API unit depends on the schema unit.

2. **Units MUST NOT span domains.** A unit has exactly one discipline (frontend, backend, api, documentation, devops, design, etc.). No unit should mix frontend and backend work, or API and documentation, etc. If a feature needs both a backend endpoint and a frontend view, those are two units — the frontend unit `depends_on` the backend unit.

3. **Design work is its own unit.** If a feature needs UI/UX design work (mockups, component design, interaction flows), create a separate unit with `discipline: design` and `workflow: design`. The design workflow runs `planner → designer → reviewer`. Frontend implementation units should `depends_on` the design unit so builders have finalized designs to implement against. This also enables a human to own the design unit while AI handles other units.

**Per-unit workflow suggestions:** Different units may benefit from different workflows based on their discipline or risk profile. When decomposing, suggest an appropriate workflow for each unit:

| Discipline / Concern | Suggested Workflow | Rationale |
|---|---|---|
| `backend`, `api`, `devops`, `documentation` | `default` (planner → builder → reviewer) | Standard implementation cycle |
| `design` | `design` (planner → designer → reviewer) | Design artifacts need design hat, not builder |
| Security-sensitive units | `adversarial` (planner → builder → red-team → blue-team → reviewer) | Adversarial testing for auth, crypto, data handling |
| Units without a clear workflow need | (omit `workflow:` field) | Inherits the intent-level workflow |

Set the `workflow:` frontmatter field on units that need a non-default workflow. Omit it (or leave empty) for units that should use the intent-level workflow.

Define each unit with **enough detail that a builder with zero prior context builds the right thing**:

- **Name and description**: What this unit accomplishes, stated in terms of the domain model
- **Domain entities**: Which entities from the domain model this unit deals with
- **Data sources**: Which APIs, queries, or data files this unit reads from or writes to. Reference specific query names, endpoint paths, or file patterns discovered during Domain Discovery.
- **Technical specification**: Specific components, views, functions, or modules to create. If it's a UI, describe what the user sees and interacts with. If it's an API, describe the endpoints and their behavior. If it's a data layer, describe the transformations.
- **Success criteria**: Specific, testable criteria that reference domain entities (not generic criteria like "displays data")
- **Dependencies on other units**: What must be built first and why. Every dependency boundary MUST be a unit boundary.
- **Risks**: What could go wrong? Security concerns, performance risks, integration fragility, data integrity issues. Each risk should note its impact and mitigation.
- **What this unit is NOT**: Explicit boundaries to prevent scope creep. If another unit handles related concerns, say so.

**Bad unit description** (too vague, builder will guess wrong):
```
## unit-02: Session Browser
Build the session browser page showing sessions from GraphQL.
```

**Good unit description** (builder knows exactly what to build):
```
## unit-02: Intent Browser and DAG View
Display all AI-DLC Intents (read from `.ai-dlc/*/intent.md` files) as cards showing:
- Intent title, status (from frontmatter), workflow type, operating mode
- Unit count and completion progress (N of M units completed)
- Created date and last activity

Clicking an intent navigates to the Intent Detail view which shows:
- The unit dependency DAG as a visual graph (units as nodes, depends_on as edges)
- Each unit node shows: name, status, current hat, discipline, retry count
- Color coding: pending=gray, in_progress=blue, completed=green, blocked=red

Data sources:
- Intent metadata: Read `.ai-dlc/{slug}/intent.md` frontmatter via filesystem API
- Unit metadata: Read `.ai-dlc/{slug}/unit-*.md` frontmatter
- Live state: Query `han keep load iteration.json` for current hat and unitStates

This unit does NOT handle: hat visualization (unit-03), live monitoring (unit-04),
or timeline replay (unit-05). It only renders the structural hierarchy.
```

Present the full unit breakdown to the user and confirm before proceeding.

---

## Phase 5.5: Cross-Cutting Concern Analysis

After units are defined, identify concerns that span multiple units. Ask:

> "Do any concerns span multiple units? Examples: authentication, error handling patterns, logging conventions, shared state, caching strategy."

For each cross-cutting concern identified, decide how to handle it using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "How should we handle the cross-cutting concern: '{concern}'?",
    "header": "Strategy",
    "options": [
      {"label": "Foundation unit", "description": "Create a new unit that others depend_on. Use when the concern requires shared code/infrastructure (e.g., auth middleware, shared component library)."},
      {"label": "Intent-level convention", "description": "Document as an intent-level success criterion that every unit's reviewer checks. Use when the concern is a pattern to follow, not code to build (e.g., 'all API errors return RFC 7807 format')."}
    ],
    "multiSelect": false
  }]
}
```

- **If foundation unit**: Add it to the unit list with appropriate `depends_on` edges from consuming units. Follow the same unit specification format from Phase 5.
- **If convention**: Add it to the intent-level success criteria. The Integrator (and each unit's Reviewer) will verify compliance.

**Skip this phase if there is only one unit.**

---

## Phase 5.75: Spec Alignment Gate

**This is a high-level alignment check before writing artifacts.** The goal is to confirm the overall direction — intent, unit breakdown, and scope — before investing effort in writing detailed unit specs. Detailed per-unit review happens in Phase 6 step 3.

Present the **elaboration summary** to the user:

```markdown
## Elaboration Summary

### Intent
{1-2 sentence problem statement}

### Domain Model
{Key entities and their relationships — abbreviated from Phase 2.5}

### Data Sources
{List each data source with what it provides}

### Units
For each unit:
- **unit-NN-{slug}**: {one-line description}
  - Discipline: {discipline}
  - Depends on: {dependencies or "none"}
  - Builds: {specific components/modules/endpoints}

### Workflow
{workflow name}
```

Then ask with `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "Does this intent and unit breakdown generally align with what you want built? (You'll review each unit in detail when we write the specs.)",
    "header": "Alignment",
    "options": [
      {"label": "Looks right", "description": "The intent, units, and scope are correct — proceed to write detailed specs"},
      {"label": "Wrong breakdown", "description": "The unit decomposition needs changes — wrong boundaries, missing units, or wrong scope"},
      {"label": "Wrong direction", "description": "The overall approach needs rethinking"}
    ],
    "multiSelect": false
  }]
}
```

- **"Looks right"**: Proceed to Phase 6
- **"Wrong breakdown"**: Discuss what needs to change, revise units in Phase 5, and re-present
- **"Wrong direction"**: Discuss with user, potentially return to Phase 2 or 2.5

---

## Phase 5.8: Git Strategy

Ask about the branching and merge strategy for this intent. These settings control how unit work is organized and merged.

Use `AskUserQuestion`:
```json
{
  "questions": [
    {
      "question": "How should unit work be branched?",
      "header": "Branching",
      "options": [
        {"label": "Unit branches (Recommended)", "description": "Each unit gets its own branch and MR, reviewed individually. Supports human or agent builders and /construct <unit-name> targeting. Best for teams adopting AI-DLC gradually."},
        {"label": "Intent branch", "description": "All units merge into a single intent branch. Agents build autonomously via DAG ordering, one MR reviewed at the end. Best for fully autonomous workflows."},
        {"label": "Trunk-based", "description": "All work on main, no feature branches. Best for small, low-risk changes."}
      ],
      "multiSelect": false
    },
    {
      "question": "Should completed branches auto-merge when approved?",
      "header": "Auto-merge",
      "options": [
        {"label": "Yes (Recommended)", "description": "Automatically merge when reviewer approves. For 'unit' strategy, merges unit branches to the default branch via per-unit MRs. For 'intent' strategy, merges unit branches to the intent branch."},
        {"label": "No", "description": "Manual merge — you decide when to merge. More control, more manual work."}
      ],
      "multiSelect": false
    }
  ]
}
```

Store the selections. These will be written into the `intent.md` frontmatter in Phase 6 under a `git:` key:

```yaml
git:
  change_strategy: unit    # or intent, trunk
  auto_merge: true         # or false
  auto_squash: false       # default false
```

Map user selections to config values:
- "Unit branches" → `unit`
- "Intent branch" → `intent`
- "Trunk-based" → `trunk`
- "Yes" auto-merge → `true`
- "No" auto-merge → `false`

### Hybrid Per-Unit Strategy (Optional)

If the user selected **"Intent branch"** strategy, ask whether any foundational units should use per-unit branching instead. This creates a **hybrid** strategy where one or more units get their own PR (merged directly to the default branch), while the remaining units merge into the intent branch.

This is useful when a foundational unit (e.g., database schema, shared library setup) needs to land on `main` before other units can build on it.

Use `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "Should any foundational units use per-unit branching (own PR to main) while others use the intent branch?",
    "header": "Hybrid",
    "options": [
      {"label": "No, all intent branch", "description": "All units merge into the intent branch (standard intent strategy)"},
      {"label": "Yes, some per-unit", "description": "I'll specify which foundational units should get their own PR"}
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Yes", ask which units should use per-unit branching. Note these units — their `git: { change_strategy: unit }` override will be written into unit frontmatter in Phase 6 Step 3.

**Skip this question entirely if the user selected "Unit branches" or "Trunk-based" in the main strategy question** — per-unit overrides only make sense with the intent branch strategy.

---

## Phase 5.9: Completion Announcements

Ask the user if they want announcement artifacts generated when the intent completes.

Use `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "What announcement formats should be generated when this intent completes?",
    "header": "Announcements",
    "options": [
      {"label": "None", "description": "No announcements — just deliver the code"},
      {"label": "Changelog", "description": "Conventional changelog entry for developers"},
      {"label": "Release notes", "description": "User-facing feature summary"},
      {"label": "All formats", "description": "Changelog, release notes, social posts, and blog draft"}
    ],
    "multiSelect": false
  }]
}
```

Map selections to the `announcements` array in intent.md frontmatter:
- "None" → `[]`
- "Changelog" → `[changelog]`
- "Release notes" → `[changelog, release-notes]`
- "All formats" → `[changelog, release-notes, social-posts, blog-draft]`

---

## Phase 5.95: Iteration Passes

Ask the user if this intent needs multi-phase iteration across disciplines. Most intents only need a single dev pass (the default). Cross-functional teams building user-facing features may benefit from design and product passes before dev.

Use `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "Does this intent need cross-functional iteration passes?",
    "header": "Iteration Passes",
    "options": [
      {"label": "Dev only", "description": "Single pass — elaborate and build (default for most work)"},
      {"label": "Design + Dev", "description": "Design pass produces artifacts, then dev pass builds from them"},
      {"label": "Design + Product + Dev", "description": "Full cross-functional: design artifacts → product specs → working code"},
      {"label": "Product + Dev", "description": "Product defines acceptance criteria, then dev builds"}
    ],
    "multiSelect": false
  }]
}
```

Map selections to the `passes` array in intent.md frontmatter:
- "Dev only" → `[]` (empty — single implicit dev pass, the default)
- "Design + Dev" → `[design, dev]`
- "Design + Product + Dev" → `[design, product, dev]`
- "Product + Dev" → `[product, dev]`

When passes are configured, set `active_pass` to the first pass in the list. The units elaborated in this session belong to the active pass. When construction completes the active pass, the next pass will trigger a new elaboration cycle for its discipline-specific units.

---

## Phase 6: Write AI-DLC Artifacts

Write intent and unit files in `.ai-dlc/{intent-slug}/` (already in the intent worktree since Phase 2.25):

### 1. Verify intent worktree

The intent worktree was already created in **Phase 2.25** (before discovery began), so all files — including `discovery.md` — are already on the intent branch. Verify we're in the right place:

```bash
INTENT_SLUG="{intent-slug}"
PROJECT_ROOT=$(git rev-parse --show-toplevel)
INTENT_WORKTREE="${PROJECT_ROOT}"  # We should already be cd'd into the worktree

# Verify we're on the intent branch
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH="ai-dlc/${INTENT_SLUG}/main"
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "ERROR: Expected to be on branch $EXPECTED_BRANCH but on $CURRENT_BRANCH"
  echo "The intent worktree should have been created in Phase 2.25."
  exit 1
fi
```

### 2. Write `intent.md`:
```markdown
---
workflow: {workflow-name}
git:
  change_strategy: {unit|intent|trunk}
  auto_merge: {true|false}
  auto_squash: false
announcements: []  # e.g., [changelog, release-notes, social-posts, blog-draft]
passes: []  # Optional: [design, product, dev] — omit or leave empty for single-pass (default dev)
active_pass: ""  # Current pass being worked on (auto-managed by construct)
created: {ISO date}
status: active
epic: ""  # Ticketing provider epic key (auto-populated if ticketing provider configured)
---

# {Intent Title}

## Problem
{What problem are we solving? Be specific about the pain point.}

## Solution
{High-level approach — enough detail to understand the architecture, not just a one-liner.}

## Domain Model
{Key entities, their relationships, and lifecycle. This is the conceptual foundation
that all units build on. Every builder should read this section to understand the
problem space.}

### Entities
- **{Entity1}**: {description} — Key fields: {fields}
- **{Entity2}**: {description} — Key fields: {fields}

### Relationships
- {How entities relate to each other}

### Data Sources
- **{Source1}** ({type}): {what it provides, endpoint/path, any auth needed}
- **{Source2}** ({type}): {what it provides}

### Data Gaps
- {Any gaps between what's needed and what's available, with proposed solutions}

## Success Criteria
- [ ] Criterion 1 {referencing specific domain entities}
- [ ] Criterion 2
- [ ] Criterion 3

## Context
{Relevant background, constraints, decisions made during elaboration}
```

Commit the intent definition immediately so it's versioned before unit writing begins:

```bash
git add .ai-dlc/${INTENT_SLUG}/intent.md
git commit -m "elaborate(${INTENT_SLUG}): define intent"
```

### 3. Write and review each `unit-NN-{slug}.md` individually:

**Process each unit one at a time.** Write the file, present it for review, iterate until approved, then move to the next unit. Do NOT batch-write all units.

#### Unit file template:
```markdown
---
status: pending
depends_on: []
branch: ai-dlc/{intent-slug}/NN-{unit-slug}
discipline: {discipline}  # frontend, backend, api, documentation, devops, design, etc.
pass: ""  # Which pass this unit belongs to (design, product, dev) — empty for single-pass intents
workflow: ""  # Per-unit workflow override (optional — omit or leave empty to use intent-level workflow)
ticket: ""  # Ticketing provider ticket key (auto-populated if ticketing provider configured)
# git:                         # Optional: per-unit VCS override (only include when unit has an override)
#   change_strategy: ""        # Overrides intent-level strategy for this unit (e.g., "unit" for foundational units)
---

# unit-NN-{slug}

## Description
{What this unit accomplishes, in terms of domain entities}

## Discipline
{discipline} - This unit will be executed by `do-{discipline}` specialized agents.

## Domain Entities
{Which entities from the domain model this unit works with, and how}

## Data Sources
{Specific APIs, queries, endpoints, or files this unit reads/writes. Reference actual
query names, field paths, or file patterns discovered during Domain Discovery.}

## Technical Specification
{Specific components, views, modules, or endpoints to create. Describe what the user
sees/interacts with (for UI), or what the API accepts/returns (for backend), or what
transformations occur (for data layers). Be concrete enough that a builder cannot
misinterpret what to build.}

## Success Criteria
- [ ] {Criterion referencing specific domain entities, not generic}
- [ ] {Another criterion}

## Risks
- **{Risk}**: {impact}. Mitigation: {how to address it}.

## Boundaries
{What this unit does NOT handle. Reference which other units own related concerns.}

## Notes
{Implementation hints, context, pitfalls to avoid}
```

**Discipline determines which specialized agents execute the unit:**
- `frontend` → `do-frontend-development` agents
- `backend` → backend-focused agents
- `api` → API development agents
- `documentation` → `do-technical-documentation` agents
- `devops` → infrastructure/deployment agents

#### Per-unit review loop:

For each unit (in dependency order — units with no `depends_on` first):

**Step A — Write the unit file** to `.ai-dlc/{intent-slug}/unit-NN-{slug}.md`.

**Step A.1 — Commit the draft immediately.** Every write is versioned so the full evolution of each unit is visible in git history:

```bash
git add .ai-dlc/${INTENT_SLUG}/unit-NN-{slug}.md
git commit -m "elaborate(${INTENT_SLUG}): draft unit-NN-{slug}"
```

**Step B — Present the full unit for review.** Read the file you just wrote and display its **complete contents** — every single line including frontmatter, description, technical specification, success criteria, risks, boundaries, and notes. Do NOT summarize, truncate, or show only the title. The user must see exactly what will be committed. Use a fenced code block:

```
### Unit NN: {Unit Title}

```markdown
{Read and paste the ENTIRE contents of unit-NN-{slug}.md — all frontmatter fields AND all body sections. Every line, no exceptions.}
```
```

**CRITICAL: If your output only shows the unit title or frontmatter without the body sections (Description, Technical Specification, Success Criteria, etc.), you have truncated the output. Go back and display the full file.**

**Step C — If the unit has `discipline: frontend`, open its wireframe in the browser** so the user can review the visual alongside the spec:

```bash
# Only for frontend units — open the wireframe if it exists
WIREFRAME=".ai-dlc/${INTENT_SLUG}/mockups/unit-NN-{slug}-wireframe.html"
if [ -f "$WIREFRAME" ]; then
  open "$WIREFRAME"  # macOS; use xdg-open on Linux
fi
```

**Step D — Ask for approval** using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "Does this unit spec give a builder enough detail to build the right thing?",
    "header": "Unit NN",
    "options": [
      {"label": "Approved", "description": "This unit is clear and complete — move to the next unit"},
      {"label": "Needs changes", "description": "Some sections need revision — I'll describe what to adjust"},
      {"label": "Rethink unit", "description": "This unit's scope or approach needs fundamental rework"}
    ],
    "multiSelect": false
  }]
}
```

- **Approved**: Move to the next unit. (The unit is already committed from Step A.1 or the most recent revision commit.)
- **Needs changes**: Discuss feedback, update the unit file, then **commit the revision with the user's reasoning in the commit body**:
  ```bash
  git add .ai-dlc/${INTENT_SLUG}/unit-NN-{slug}.md
  git commit -m "elaborate(${INTENT_SLUG}): revise unit-NN-{slug}

  {Summarize the user's feedback that motivated this revision —
  e.g., 'User requested splitting the auth check into middleware
  instead of inline validation, and adding rate-limit criteria.'}"
  ```
  Re-display the full updated contents and re-ask for approval. Loop until approved.
- **Rethink unit**: Discuss the scope or approach, potentially split/merge/redesign the unit, rewrite the file. **Commit with the user's reasoning** as above, then re-present for approval.

### 4. Save intent slug to han keep:

```bash
# Intent-level identifier -> current branch (intent branch)
han keep save intent-slug "{intent-slug}"
```

**Note:** Do NOT save `iteration.json` here. Construction state (hat, iteration count, workflow, status) is initialized by `/construct` when the build loop starts. Elaboration only writes the spec artifacts and the intent slug.

### 5. Commit any remaining artifacts on intent branch:

Intent and unit files were committed individually during steps 2 and 3. This catch-all commit picks up any remaining artifacts (briefs, han keep state, etc.):

```bash
git add .ai-dlc/
git diff --cached --quiet || git commit -m "elaborate(${INTENT_SLUG}): finalize elaboration artifacts"
```

### 5b. Push artifacts to remote (cowork)

If the orchestrator is in a temporary workspace (`/tmp/ai-dlc-workspace-*`):

```bash
git push -u origin "$INTENT_BRANCH"
```

This ensures builders can pull the intent branch when working remotely. Note in the handoff: "Artifacts pushed to `ai-dlc/{intent-slug}/main` branch on remote."

---

## Phase 6.25: Generate Frontend Wireframes (Delegated)

**Skip this phase entirely if no units have `discipline: frontend` in their frontmatter.**

Wireframe generation runs in a forked subagent. The subagent generates low-fidelity HTML wireframes for all frontend units, updates unit frontmatter, and commits the artifacts.

### Step 1: Identify frontend units

Scan all `unit-*.md` files in `.ai-dlc/{intent-slug}/`. Collect units where frontmatter contains `discipline: frontend`.

If no frontend units exist, skip to Phase 6.5.

### Step 2: Load design provider config

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
DESIGN_TYPE=$(echo "$PROVIDERS" | jq -r '.design.type // empty')
```

### Step 3: Write wireframes brief

Write `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
intent_title: {Intent Title from intent.md}
design_provider_type: {DESIGN_TYPE or empty}
---

# Frontend Units

{For each frontend unit, include:}

## {unit filename}

**File:** {unit filename}.md
**Description:** {unit description from body}
**Domain Entities:** {entities from unit spec}
**Technical Spec:** {technical specification from unit body}

# Design Context

{Design analysis findings from discovery.md, if any — grep for "## Design Analysis" sections}

# Domain Model Reference

{Abbreviated domain model from intent.md}
```

### Step 4: Invoke wireframes subagent

```
Skill("elaborate-wireframes", args: ".ai-dlc/{INTENT_SLUG}/.briefs/elaborate-wireframes.md")
```

**CRITICAL — DO NOT STOP HERE.** After the wireframes subagent completes, immediately proceed to Step 5.

### Step 5: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes-results.md`.

- If `status: skipped` — no frontend units found, proceed to Phase 6.5
- If `status: error` — report the error to the user and discuss how to proceed
- If `status: success` — list the generated wireframes for the user

### Step 6: Product review gate

Present all generated wireframes to product for review using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "I've generated low-fidelity wireframes for the frontend units. Please open them in a browser to review screen structure, flow, and placeholder copy. How do they look?",
    "header": "Wireframes",
    "options": [
      {"label": "Approved", "description": "Wireframes accurately capture the intended screens, flows, and copy"},
      {"label": "Needs revision", "description": "Some screens or flows need changes — I'll describe what to adjust"},
      {"label": "Skip wireframes", "description": "Remove wireframes and proceed without them"}
    ],
    "multiSelect": false
  }]
}
```

- **Approved**: Proceed to Phase 6.5.
- **Needs revision**: Discuss feedback, update the wireframe HTML files directly, and re-present for review. Loop until approved.
- **Skip wireframes**: Delete the `mockups/` directory, remove `wireframe:` fields from unit frontmatter, and proceed to Phase 6.5.

---

## Phase 6.5 + 6.75: Sync to Ticketing Provider (Delegated)

Ticket sync (epic creation, ticket creation, DAG linking, validation) runs in a forked subagent. The subagent handles the full workflow including validation and retry.

### Step 1: Load ticketing config

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
TICKETING_TYPE=$(echo "$PROVIDERS" | jq -r '.ticketing.type // empty')
TICKETING_CONFIG=$(echo "$PROVIDERS" | jq -c '.ticketing.config // {}')
```

If `TICKETING_TYPE` is empty, skip this phase entirely and proceed to Phase 7.

### Step 2: Write ticket sync brief

Read the intent.md and all unit files to gather the data the subagent needs. Write `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-ticket-sync.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
ticketing_type: {TICKETING_TYPE}
ticketing_config: {JSON of TICKETING_CONFIG object}
plugin_root: {CLAUDE_PLUGIN_ROOT}
---

# Intent Summary

## Problem
{problem statement from intent.md}

## Solution
{solution description from intent.md}

## Epic
{existing epic key from intent.md frontmatter, or empty}

# Units

{For each unit file, include:}

## {unit filename without .md}
- **File:** {unit filename}
- **Title:** {humanized unit title}
- **Discipline:** {discipline from frontmatter}
- **Depends On:** {depends_on list from frontmatter}
- **Description:** {unit description from body}
- **Success Criteria:**
  {success criteria list from unit body}
- **Wireframe:** {wireframe path from frontmatter, if any}
```

### Step 3: Invoke ticket sync subagent

```
Skill("elaborate-ticket-sync", args: ".ai-dlc/{INTENT_SLUG}/.briefs/elaborate-ticket-sync.md")
```

**CRITICAL — DO NOT STOP HERE.** After the ticket sync subagent completes, immediately proceed to Step 4.

### Step 4: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-ticket-sync-results.md`.

- If `status: skipped` — ticketing not configured or MCP tools unavailable, proceed to Phase 7
- If `status: error` — report the errors to the user. If `validation_passed: false`, the subagent already retried. Log the failures and proceed to Phase 7 (never block elaboration on ticket sync failure)
- If `status: success` — log the epic key and ticket keys, confirm validation passed, proceed to Phase 7

---

## Phase 7: Handoff

Present the elaboration summary:

```
Elaboration complete!

Intent Worktree: .ai-dlc/worktrees/{intent-slug}/
Branch: ai-dlc/{intent-slug}/main

Created: .ai-dlc/{intent-slug}/
- intent.md (intent and config)
- unit-01-{name}.md
- unit-02-{name}.md
...
- mockups/unit-NN-{name}-wireframe.html  (if wireframes generated)

Workflow: {workflowName}
Next hat: {next-hat}
```

Then ask the user how to proceed. **The options depend on whether this is a cowork session.**

```bash
IS_COWORK="${CLAUDE_CODE_IS_COWORK:-}"
```

**If NOT cowork mode** (full CLI):

```json
{
  "questions": [{
    "question": "How would you like to proceed?",
    "header": "Handoff",
    "options": [
      {"label": "Construct", "description": "Start the autonomous build loop now"},
      {"label": "Open PR/MR for review", "description": "Create a pull/merge request for spec review before building"}
    ],
    "multiSelect": false
  }]
}
```

**If cowork mode** (`IS_COWORK=1`):

The artifacts have already been written to `.ai-dlc/{intent-slug}/` in the working directory. Determine the handoff based on how the user connected to the repo in Phase 0:

- **If the user pointed to a local folder** — the artifacts are already in their repo. They just need to commit.
- **If the repo was cloned to a temp workspace** — the user may not have push access. Offer a zip download.

```json
{
  "questions": [{
    "question": "Elaboration is complete! How would you like to deliver the spec?",
    "header": "Handoff",
    "options": [
      {"label": "Push branch + open PR/MR", "description": "Push the spec branch and create a pull/merge request for review (requires git push access)"},
      {"label": "Download as zip", "description": "Package all spec artifacts into a zip file you can share with your team"}
    ],
    "multiSelect": false
  }]
}
```

**Note:** If the user connected via **local folder**, skip the question entirely — just tell them the artifacts are written and ready to commit (see "If local folder" below).

### If Construct (CLI only):

Tell the user:

```
To start the autonomous build loop:
  /construct

The construction phase will iterate through each unit, using quality gates
(tests, types, lint) as backpressure until all success criteria are met.

Note: All AI-DLC work happens in the worktree at .ai-dlc/worktrees/{intent-slug}/
Your main working directory stays clean on the main branch.
```

### If PR/MR for review:

**IMPORTANT:** Do NOT include "Closes", "Fixes", or "Resolves" issue references in the PR body. This is a spec review PR — merging it must not auto-close the linked issue. The issue stays open until construction is complete.

1. Push the intent branch to remote:

```bash
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
git push -u origin "$INTENT_BRANCH"
```

2. Create PR/MR:

```bash
# Determine default branch
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
CONFIG=$(get_ai_dlc_config "$INTENT_DIR")
DEFAULT_BRANCH=$(echo "$CONFIG" | jq -r '.default_branch')

# Read intent.md for PR body content
INTENT_FILE="$INTENT_DIR/intent.md"

gh pr create \
  --title "[AI-DLC Spec] ${INTENT_TITLE}" \
  --base "$DEFAULT_BRANCH" \
  --head "$INTENT_BRANCH" \
  --body "$(cat <<EOF
## Problem
${PROBLEM_SECTION}

## Solution
${SOLUTION_SECTION}

## Domain Model
${DOMAIN_MODEL_SECTION}

## Success Criteria
${SUCCESS_CRITERIA_SECTION}

## Unit Breakdown
${UNIT_BREAKDOWN}

---
*This is an AI-DLC spec review PR. Approve and run \`/construct\` to begin the autonomous build loop.*
EOF
)"
```

3. Tell the user:

```
Spec PR created: {PR_URL}

Review the spec with your team. When approved, a developer can run:
  /construct
```

### If local folder (cowork — no question needed):

The artifacts are already written in the user's own repo checkout. Just tell them:

```
Spec artifacts written to .ai-dlc/{intent-slug}/:
- intent.md
- unit-01-{name}.md
- unit-02-{name}.md
...

These are ready to commit. From your project directory, run:
  git add .ai-dlc/{intent-slug}/
  git commit -m "elaborate: define intent and units for {intent-slug}"

Then a developer can run `/construct` in Claude Code to start the build loop.
```

### If Download as zip (cowork):

Package all spec artifacts into a zip file:

```bash
INTENT_DIR=".ai-dlc/${INTENT_SLUG}"
ZIP_PATH="/tmp/ai-dlc-${INTENT_SLUG}-spec.zip"
cd "$(git rev-parse --show-toplevel)"
zip -r "$ZIP_PATH" "$INTENT_DIR"
```

Tell the user:

```
Spec packaged: {ZIP_PATH}

To use this spec:
1. Unzip into the project root (preserves the .ai-dlc/{intent-slug}/ structure)
2. Commit the files
3. Run /construct in Claude Code to start the build loop
```
