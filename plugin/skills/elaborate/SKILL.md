---
description: Start AI-DLC mob elaboration to collaboratively define intent, success criteria, and decompose into units. Use when starting a new feature, project, or complex task.
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - Task
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
PROJECT_ROOT=$(git rev-parse --show-toplevel)
INTENT_WORKTREE="${PROJECT_ROOT}/.ai-dlc/worktrees/${slug}"
INTENT_BRANCH="ai-dlc/${slug}/main"

# Remove worktree if it exists
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove --force "$INTENT_WORKTREE" 2>/dev/null
fi

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

```bash
# Derive intent slug from the user's description (same slug used throughout elaboration)
INTENT_SLUG="{intent-slug}"
PROJECT_ROOT=$(git rev-parse --show-toplevel)
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
INTENT_WORKTREE="${PROJECT_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"

# Ensure worktrees directory exists and is gitignored (on main, before creating worktree)
mkdir -p "${PROJECT_ROOT}/.ai-dlc/worktrees"
if ! grep -q '\.ai-dlc/worktrees/' "${PROJECT_ROOT}/.gitignore" 2>/dev/null; then
  echo '.ai-dlc/worktrees/' >> "${PROJECT_ROOT}/.gitignore"
  git add "${PROJECT_ROOT}/.gitignore"
  git commit -m "chore: gitignore .ai-dlc/worktrees"
fi

# Create the intent worktree on its own branch
git worktree add -B "$INTENT_BRANCH" "$INTENT_WORKTREE"
cd "$INTENT_WORKTREE"
```

**Tell the user the worktree location** so they know where to find it.

Now initialize the discovery scratchpad. This file persists elaboration findings to disk so they survive context compaction and are available to builders later.

```bash
DISCOVERY_DIR=".ai-dlc/${INTENT_SLUG}"
DISCOVERY_FILE="${DISCOVERY_DIR}/discovery.md"

mkdir -p "$DISCOVERY_DIR"

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

This ensures:
- Main working directory stays on `main` for other work
- All discovery findings are written directly on the intent branch
- All subsequent `han keep` operations use the intent branch's storage
- Multiple intents can run in parallel in separate worktrees
- Clean separation between main and AI-DLC orchestration state
- Subagents spawn from the intent worktree, not the original repo

---

## Phase 2.5: Domain Discovery & Technical Exploration

**This phase is mandatory.** Before defining success criteria or decomposing into units, you MUST deeply understand the technical landscape. Shallow understanding here causes builders to build the wrong thing.

### What to Explore

Based on what the user described in Phase 2, identify every relevant technical surface and explore it thoroughly. Use ALL available research tools — codebase exploration, API introspection, web searches, and documentation fetching:

1. **APIs and Schemas**: If the intent involves an API, query it. Run introspection queries. Read the actual schema. Map every type, field, query, mutation, and subscription. Don't guess what data is available — verify it.

2. **Existing Codebases**: If the intent builds on or integrates with existing code, explore it via Explore subagents. Have them find relevant files, read source code, and report back on existing patterns, conventions, and architecture.

3. **Data Sources**: If the intent involves data, understand where it lives. Query for real sample data. Understand what fields are populated, what's empty, what's missing. Identify gaps between what's available and what's needed.

4. **Domain Model**: From your exploration, build a domain model — the key entities, their relationships, and their lifecycle. This is not a database schema; it's a conceptual map of the problem space.

5. **Existing Implementations**: If there are related features, similar tools, or reference implementations, read them. Understand what already exists so you don't build duplicates or miss integration points.

6. **External Documentation and Libraries**: Use `WebSearch` and `WebFetch` to research relevant libraries, frameworks, APIs, standards, or prior art. If the intent involves a third-party system, find its documentation and understand its capabilities. If the intent involves a design pattern or technique, research best practices and common pitfalls.

7. **Configured Providers**: If providers are configured in `.ai-dlc/settings.yml` or discovered via MCP:
   - **Spec providers** (Notion, Confluence, Google Docs): Search for requirements docs, PRDs, or technical specs related to the intent
   - **Ticketing providers** (Jira, Linear): Search for existing tickets, epics, or stories that relate to or duplicate this work
   - **Design providers** (Figma, Sketch, Adobe XD): Delegate to design analysis subagents (see item 4 in "How to Explore" below) to avoid flooding your context with design data. **Important:** Designers often annotate mockups with callouts, arrows, measurement labels, sticky notes, and descriptive text that convey UX behavior or implementation details. These annotations are **guidance, not part of the design itself** — extract the guidance (interaction notes, spacing rules, state descriptions, edge cases) and incorporate it into unit specs, but do not treat annotation visuals as UI elements to build.
   - **Comms providers** (Slack, Teams): Search for relevant discussions or decisions in channels
   Use `ToolSearch` to discover available MCP tools matching provider types, then use read-only MCP tools for research.

### How to Explore

Use every research tool available. Spawn multiple explorations in parallel for independent concerns:

1. **Subagents for deep codebase/API exploration**: Use `Task` with `subagent_type: "Explore"` for multi-step research that requires reading many files, querying APIs, and synthesizing findings:

```
Task({
  description: "Explore {specific system}",
  subagent_type: "Explore",
  prompt: "I need to deeply understand {system}. Read source code, query APIs, map the data model. Report back with: every entity and its fields, every query/endpoint available, sample data showing what's actually populated, and any gaps or limitations discovered."
})
```

2. **MCP tools for domain knowledge**: Use `ToolSearch` to discover available MCP tools, then use read-only MCP tools for domain research. Examples:
   - Repository documentation (DeepWiki): `mcp__*__read_wiki*`, `mcp__*__ask_question`
   - Library docs (Context7): `mcp__*__resolve*`, `mcp__*__query*`
   - Project memory (han): `mcp__*__memory`
   - Any other MCP servers available in the environment
   - Provider MCP tools: If providers are configured, use their MCP tools for research (e.g., `mcp__*jira*__search*` for Jira tickets, `mcp__*notion*__search*` for Notion pages)

3. **Web research for external context**: Use `WebSearch` for library docs, design patterns, API references, prior art. Use `WebFetch` to read specific documentation pages.

4. **Design analysis subagents**: If a design provider is configured, delegate design analysis to subagents to keep your context lean:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
DESIGN_TYPE=$(echo "$PROVIDERS" | jq -r '.design.type // empty')
```

If `DESIGN_TYPE` is set, spawn a `general-purpose` subagent (NOT `Explore` — it needs MCP tool access via `ToolSearch`) for each design file:

```
Task({
  description: "Analyze design: {file name}",
  subagent_type: "general-purpose",
  prompt: "Analyze a design file for AI-DLC elaboration.

    ## Instructions
    1. Use ToolSearch to discover design MCP tools (e.g., 'figma', 'sketch', 'design')
    2. Use discovered tools to fetch design metadata, screenshots, and component trees
    3. Extract and return ONLY a structured summary:
       - Component hierarchy (parent/child tree of design elements)
       - Design tokens: colors (hex values), spacing values, typography (font families, sizes, weights)
       - Interactions and states (hover, active, disabled, error states)
       - Annotations and designer notes (text callouts, sticky notes, measurement labels)

    ## CRITICAL
    - Return structured text ONLY — no raw screenshots or binary data in your response
    - Focus on information builders need to implement the design accurately
    - Note any ambiguities or missing states that builders should ask about

    ## Design File
    {design file URL or identifier}"
})
```

Spawn one subagent per design file, in parallel with codebase Explore agents. When results return:
- Share key findings with the user (component structure, notable design decisions)
- Append to `discovery.md` under `## Design Analysis: {file name}`
- If no design MCP tools are discoverable, the subagent reports unavailability — log a warning and continue without design analysis

**Spawn multiple research paths in parallel.** Don't serialize explorations that are independent — launch all of them at once and synthesize when results return.

If a VCS MCP is available (e.g., GitHub MCP), use it for code browsing alongside or instead of local file tools.

### Communicate Findings as You Go

**Do not disappear into research and come back with a wall of text.** The user is your collaborator, not a reviewer. As you explore:

- **Share what you're finding** in real-time. When a research subagent returns results, summarize the key findings to the user before launching the next exploration. Let them see your understanding forming.
- **Surface surprises and ambiguities immediately.** If something doesn't match what the user described, or if you discover a gap or limitation, tell the user right away. Don't wait until the domain model presentation.
- **Ask clarifying questions when discoveries raise new questions.** If you find that an API has 23 queries but you're not sure which ones are relevant, ask. If you find two possible data sources for the same information, ask which one to use.
- **Check your mental model incrementally.** Don't wait until the end to validate everything at once. After each major finding, briefly confirm: "I found X — does that match your understanding?" This catches misunderstandings early.

The goal is a **conversation**, not a research report. The user has domain knowledge you don't have. They can correct your understanding in seconds if you surface it, but they can't fix what they can't see.

### Persist Findings to Discovery Log

After each significant finding (API schema mapped, codebase pattern identified, design analyzed, external research completed), **append a section to `discovery.md`** using `cat >>`. This offloads detailed findings from context to disk, keeping your context window lean while preserving full details for builders.

```bash
DISCOVERY_FILE=".ai-dlc/${INTENT_SLUG}/discovery.md"

cat >> "$DISCOVERY_FILE" << 'EOF'

## {Section Type}: {Name}

**Discovered:** {ISO timestamp}

### Findings
{Structured findings — entities, fields, patterns, constraints, etc.}

### Key Observations
- {Important insight 1}
- {Important insight 2}

### Gaps / Concerns
- {Any gap, limitation, or open question}

EOF
```

**Use standardized section headers** so builders can quickly scan the file:
- `## API Schema: {name}` — For API introspection results (types, fields, queries, mutations)
- `## Codebase Pattern: {area}` — For architecture patterns discovered in existing code
- `## Design Analysis: {file}` — For design file findings (components, tokens, interactions)
- `## External Research: {topic}` — For web research, library docs, prior art
- `## Data Source: {name}` — For data source exploration (what's available, what's missing)
- `## Provider Context: {type}` — For ticketing, spec, or comms provider findings

**After appending to `discovery.md`, keep only a brief summary in your context** — the full details are safely on disk and will be available to builders. This is the key benefit: your context stays lean for continued exploration while nothing is lost.

**CRITICAL**: Do not summarize or skip this phase. The exploration results directly determine whether the spec is accurate. If you explore a GraphQL API, report every type. If you read source code, report the actual architecture, not your guess about it.

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

## Phase 5.75: Spec Validation Gate

**This is the quality gate that prevents shallow specs from reaching construction.**

Before writing any artifacts, present the **complete elaboration summary** to the user:

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
  - Entities: {which domain entities}
  - Data: {which data sources/queries}
  - Builds: {specific components/modules/endpoints}
  - Criteria: {count} success criteria

### Workflow
{workflow name}
```

Then ask with `AskUserQuestion`:
```json
{
  "questions": [{
    "question": "Is this spec detailed enough that a developer with NO prior context about this domain could build the right thing? (If a builder could misinterpret any unit and build something wrong, answer 'Not detailed enough')",
    "header": "Spec Quality",
    "options": [
      {"label": "Yes, detailed enough", "description": "Every unit is unambiguous — proceed to write artifacts"},
      {"label": "Not detailed enough", "description": "Some units are vague or could be misinterpreted — need more detail"},
      {"label": "Wrong direction", "description": "The overall approach needs rethinking"}
    ],
    "multiSelect": false
  }]
}
```

- **"Yes, detailed enough"**: Proceed to Phase 6
- **"Not detailed enough"**: Ask which units need more detail, then return to Phase 5 for those units. Do NOT proceed until every unit is unambiguous.
- **"Wrong direction"**: Discuss with user, potentially return to Phase 2 or 2.5

**Do NOT skip this gate.** This is the single most important quality check in the entire elaboration process. A vague spec produces wrong implementations. A precise spec produces correct ones.

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

### 3. Write `unit-NN-{slug}.md` for each unit:
```markdown
---
status: pending
depends_on: []
branch: ai-dlc/{intent-slug}/NN-{unit-slug}
discipline: {discipline}  # frontend, backend, api, documentation, devops, design, etc.
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

### 4. Save intent slug to han keep:

```bash
# Intent-level identifier -> current branch (intent branch)
han keep save intent-slug "{intent-slug}"
```

**Note:** Do NOT save `iteration.json` here. Construction state (hat, iteration count, workflow, status) is initialized by `/construct` when the build loop starts. Elaboration only writes the spec artifacts and the intent slug.

### 5. Commit all artifacts on intent branch:

```bash
git add .ai-dlc/
git commit -m "elaborate: define intent and units for ${intentSlug}"
```

### 5b. Push artifacts to remote (cowork)

If the orchestrator is in a temporary workspace (`/tmp/ai-dlc-workspace-*`):

```bash
git push -u origin "$INTENT_BRANCH"
```

This ensures builders can pull the intent branch when working remotely. Note in the handoff: "Artifacts pushed to `ai-dlc/{intent-slug}/main` branch on remote."

---

## Phase 6.25: Generate Frontend Wireframes

**Skip this phase entirely if no units have `discipline: frontend` in their frontmatter.**

For each frontend unit, generate a low-fidelity HTML wireframe that gives product a concrete visual to react to before construction begins. These wireframes are a spec tool, not a design tool — high-fidelity design happens during construction.

### Step 1: Identify frontend units

Scan all `unit-*.md` files in `.ai-dlc/{intent-slug}/`. Collect units where frontmatter contains `discipline: frontend`.

If no frontend units exist, skip to Phase 6.5.

### Step 2: Check for design provider context

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
DESIGN_TYPE=$(echo "$PROVIDERS" | jq -r '.design.type // empty')
```

If a design provider is configured (e.g., Figma), reference component names from the design system in HTML comments (e.g., `<!-- DS: ButtonPrimary -->`) but maintain low-fidelity wireframe aesthetic. Do NOT import actual design system styles.

If design mockups exist, download/export assets when possible for analysis. **Distinguish annotations from design elements** — designers annotate mockups with callouts, arrows, measurement labels, and descriptive text that describe UX behavior and implementation detail. Extract this guidance into the unit specs (interaction notes, edge cases, state descriptions) but do not render annotations as wireframe elements.

### Step 3: Create mockups directory

```bash
mkdir -p ".ai-dlc/${INTENT_SLUG}/mockups"
```

### Step 4: Generate wireframe HTML per frontend unit

For each frontend unit, create a self-contained HTML file at:
`.ai-dlc/{intent-slug}/mockups/unit-{NN}-{slug}-wireframe.html`

Where `{NN}` is the zero-padded unit number and `{slug}` is the unit filename slug.

#### Wireframe Style Reference

All wireframes MUST use this exact visual style — a gray/white low-fidelity aesthetic with no brand colors, no custom fonts, and no JavaScript:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wireframe: {Unit Title}</title>
<style>
  /* === BASE === */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; padding: 40px 20px; }
  h1 { text-align: center; font-size: 18px; color: #666; margin-bottom: 8px; }
  .subtitle { text-align: center; font-size: 13px; color: #999; margin-bottom: 40px; }

  /* === LAYOUT === */
  .flow { display: flex; gap: 32px; justify-content: center; align-items: flex-start; flex-wrap: wrap; }
  .arrow { display: flex; align-items: center; font-size: 28px; color: #bbb; padding-top: 160px; }

  /* === SCREEN CARDS === */
  .screen { width: 300px; background: #fff; border: 2px solid #ddd; border-radius: 12px; overflow: hidden; }
  .screen-header {
    background: #e8e8e8; padding: 12px 16px; font-size: 11px; font-weight: 600;
    color: #888; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ddd;
  }
  .screen-body { padding: 24px 20px; }
  .screen-title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .screen-desc { font-size: 13px; color: #888; margin-bottom: 24px; line-height: 1.4; }

  /* === FORM FIELDS (dashed borders) === */
  .field { border: 2px dashed #ccc; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; font-size: 14px; color: #aaa; }
  .field.filled { border-style: solid; color: #333; }

  /* === BUTTONS === */
  .btn {
    width: 100%; padding: 14px; border-radius: 8px; border: none;
    font-size: 15px; font-weight: 600; cursor: default; margin-bottom: 8px; text-align: center;
  }
  .btn-primary { background: #888; color: #fff; }
  .btn-secondary { background: #f0f0f0; color: #666; }
  .btn-text { background: none; color: #666; font-size: 13px; }

  /* === DIVIDERS === */
  .divider { text-align: center; font-size: 12px; color: #bbb; margin: 16px 0; position: relative; }
  .divider::before, .divider::after {
    content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: #e0e0e0;
  }
  .divider::before { left: 0; }
  .divider::after { right: 0; }

  /* === PLACEHOLDER ELEMENTS === */
  .placeholder { background: #e0e0e0; border-radius: 8px; height: 40px; margin-bottom: 12px; }
  .placeholder.tall { height: 120px; }
  .placeholder.avatar { width: 36px; height: 36px; border-radius: 50%; display: inline-block; }

  /* === FLOW NOTES (yellow callout) === */
  .note {
    background: #fffde7; border: 1px solid #fff176; border-radius: 6px;
    padding: 10px 12px; font-size: 12px; color: #666; margin-top: 16px; line-height: 1.4;
  }
  .note strong { color: #333; }

  /* === COPY REVIEW ANNOTATIONS (orange) === */
  .copy-note { font-size: 11px; color: #e65100; font-style: italic; margin-top: 4px; }

  /* === LIST/CARD ITEMS === */
  .card {
    border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px 14px;
    margin-bottom: 8px; display: flex; align-items: center; gap: 12px;
  }
</style>
</head>
<body>

<h1>{Intent Title}</h1>
<p class="subtitle">Wireframe &mdash; Unit: {Unit Title} &mdash; AI-DLC Elaboration Artifact</p>

<div class="flow">
  <!-- Build screens here -->
</div>

</body>
</html>
```

#### What to include

- **Screens**: One `.screen` card per distinct view or state described in the unit. Use `.screen-header` for screen identification (e.g., "Screen 1 — Login") and `.screen-body` for content.
- **User flows**: Use `.arrow` elements (`→`) between screens to show navigation flow. Wrap screens and arrows in `.flow` container.
- **Form fields**: Use `.field` with dashed borders for inputs. Use `.field.filled` for pre-filled example states.
- **Buttons**: Use `.btn-primary` for main actions, `.btn-secondary` for alternatives, `.btn-text` for tertiary/link actions. Keep buttons gray (`#888`) — no brand colors.
- **Placeholder copy**: Write realistic placeholder text for all headings, descriptions, labels, and button text. Mark any copy needing product review with `<div class="copy-note">^ Copy: needs product review</div>`.
- **Flow notes**: Use `.note` callouts to explain behavior, transitions, conditional logic, and edge cases (e.g., "Auto-submits when all 6 digits entered").
- **States**: Show key states (empty, filled, error, success) as separate screens or annotate with flow notes.
- **Placeholders**: Use `.placeholder` for images, avatars, or content areas that don't need detail.

#### What to exclude

- Brand colors — use only grays (#888, #666, #aaa, #ccc, #ddd, #e0e0e0, #f0f0f0, #f5f5f5) and white
- Custom fonts — use only `system-ui, sans-serif`
- Icons — describe in text or use unicode characters
- JavaScript — no interactivity, no animations
- Responsive breakpoints — fixed 300px screen cards only
- High-fidelity design — no shadows, gradients, or brand styling

### Step 5: Add wireframe field to unit frontmatter

For each frontend unit that received a wireframe, add the `wireframe:` field to its frontmatter pointing to the relative mockup path:

```yaml
wireframe: mockups/unit-{NN}-{slug}-wireframe.html
```

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

- **Approved**: Proceed to Step 7.
- **Needs revision**: Discuss feedback, update the wireframe HTML files, and re-present for review. Loop until approved.
- **Skip wireframes**: Delete the `mockups/` directory, remove `wireframe:` fields from unit frontmatter, and proceed to Phase 6.5.

### Step 7: Commit wireframe artifacts

```bash
git add .ai-dlc/${INTENT_SLUG}/mockups/
git add .ai-dlc/${INTENT_SLUG}/unit-*.md
git commit -m "elaborate: add wireframes for ${intentSlug} frontend units"
```

---

## Phase 6.5: Sync to Ticketing Provider

If a ticketing provider is configured and MCP tools are available, you **MUST** complete all steps below. Phase 6.75 will validate that all tickets were created — you cannot proceed to handoff with missing tickets.

Before creating tickets, load provider config:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
TICKETING_TYPE=$(echo "$PROVIDERS" | jq -r '.ticketing.type // empty')
TICKETING_CONFIG=$(echo "$PROVIDERS" | jq -c '.ticketing.config // {}')
```

Read the provider config schema for reference: `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{TICKETING_TYPE}.schema.json`

1. **Epic handling**:
   - If `epic` field in intent.md frontmatter is already populated (provided by product), use that existing epic — do not create a new one
   - If `epic` is empty, create an epic from the intent using the ticketing MCP tools (e.g., `mcp__*jira*__create*`, `gh issue create`), then store the epic key in intent.md frontmatter
   - Epic title: intent title
   - Epic description (multiline markdown, NOT escaped `\n`):
     ```markdown
     ## Problem

     {problem statement from intent.md}

     ## Solution

     {solution description from intent.md}

     ## Units

     {numbered list of unit titles from the decomposition}
     1. {unit-01 title}
     2. {unit-02 title}
     ...
     ```

2. **Create tickets** per unit, using config fields:
   - Title: unit title (from unit filename slug, humanized)
   - Description: see **Ticket Description Format** below
   - Issue type: `config.issue_type` (fall back to "Task")
   - Issue type ID: `config.issue_type_id` (overrides name lookup if set)
   - Labels: `config.labels[unit.discipline]` (if configured, apply discipline-mapped labels)
   - Story points: estimate and set if `config.story_points` = "required"
   - Details: include additional content per `config.details` requirements

   ### Ticket Description Format

   **CRITICAL**: Always pass description strings with real newlines (multiline), never escaped `\n` literals. MCP tool description fields accept markdown — use it.

   Build the description from the unit file content using this structure:

   ```markdown
   ## Overview

   {unit description from the unit file body — the paragraph(s) after the frontmatter heading}

   ## Completion Criteria

   - [ ] {criterion 1}
   - [ ] {criterion 2}
   - [ ] {criterion 3}

   ## Dependencies

   {if unit has depends_on, list them here with their ticket keys if known}
   - Blocked by: {dependency unit title} ({ticket key})

   {if unit has no dependencies}
   None — this unit can start immediately.

   ## Wireframe

   {if unit has `wireframe:` frontmatter field populated}
   Low-fidelity wireframe available at `.ai-dlc/{intent-slug}/{wireframe-path}`.
   Shows approved screen structure, flow, and placeholder copy.
   Apply full visual design during construction.

   {if unit does not have `wireframe:` field — omit this section entirely}

   ## Technical Notes

   {include any implementation guidance, constraints, or architectural notes from the unit file body — omit this section if the unit has no technical detail beyond the criteria}
   ```

   Omit sections that have no content (e.g., skip "Dependencies" if none, skip "Technical Notes" if the unit file has no implementation detail). The goal is a ticket that gives a developer full context without reading the `.ai-dlc/` files.

   **Every unit ticket MUST be linked to the intent epic** (unless `config.epic_link` is explicitly set to `"none"`). The epic is the single parent that groups all unit work — without this link, tickets are orphaned and invisible to project tracking. This applies regardless of provider: Jira epic links, Linear parent issues, GitHub milestones/tracked-by, GitLab epic associations.

3. **Map DAG to blocked-by** (if `config.issue_links` != "none"):
   - For each unit's `depends_on`, create blocked-by relationships between the corresponding tickets
   - Use link type names from `config.link_types` (defaults: "Blocks" / "Is Blocked By")
   - Example: unit-02 depends on unit-01 → ticket for unit-02 is blocked by ticket for unit-01

4. **Store keys in frontmatter**:
   - Update intent.md frontmatter: `epic: PROJ-123`
   - Update each unit frontmatter: `ticket: PROJ-124`
   - Commit the updated frontmatter:
   ```bash
   git add .ai-dlc/
   git commit -m "elaborate: sync tickets for ${intentSlug}"
   ```

5. **Graceful degradation**:
   - If ticketing MCP tools are not available, skip this phase entirely
   - Log: "Ticketing provider configured but MCP tools not available — skipping ticket creation"
   - Never block elaboration on ticket creation failure

---

## Phase 6.75: Ticket Sync Validation

This phase validates that Phase 6.5 was completed correctly. It runs automatically after Phase 6.5.

### Step 1: Check if ticketing is configured

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
TICKETING_TYPE=$(echo "$PROVIDERS" | jq -r '.ticketing.type // empty')
```

- If `TICKETING_TYPE` is empty → **skip this phase**, proceed to Phase 7.

### Step 2: Verify MCP tools are available

Use `ToolSearch` to check for ticketing MCP tools (search for the provider type, e.g., `"jira"`, `"linear"`, `"github issues"`).

- If no MCP tools found → log warning: `"Ticketing provider '${TICKETING_TYPE}' configured but MCP tools not available — skipping ticket validation"` → proceed to Phase 7.

### Step 3: Hard validation (provider + MCP tools available)

Read the intent and unit files and check for populated ticket fields:

1. **Epic check**: Read `intent.md` frontmatter. Check the `epic:` field.
   - If `epic:` is empty or missing → **FAIL**

2. **Ticket check**: Scan all `unit-*.md` files in the intent directory. Check each file's `ticket:` frontmatter field.
   - If ANY unit has an empty or missing `ticket:` field → **FAIL**

### On FAIL:

**DO NOT proceed to Phase 7.** Instead:

1. Report exactly what is missing:
   ```
   Ticket sync validation failed:
   - intent.md: epic field is empty
   - unit-02-auth-middleware.md: ticket field is empty
   - unit-04-api-routes.md: ticket field is empty
   ```

2. Loop back to **Phase 6.5** to create the missing tickets/epic.

3. After Phase 6.5 completes, re-run this validation (Phase 6.75).

4. Only proceed to Phase 7 when all `epic:` and `ticket:` fields are populated.

### On PASS:

Log: `"Ticket sync validation passed — all epic and ticket fields populated."` → proceed to Phase 7.

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
