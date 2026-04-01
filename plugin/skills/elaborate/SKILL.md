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

## Prerequisite: Project Setup

**Before doing anything else**, check if `.ai-dlc/settings.yml` exists using the `Glob` tool (pattern: `.ai-dlc/settings.yml`). If it does **not** exist, you MUST run `/ai-dlc:setup` via the `Skill` tool **immediately** and wait for it to complete before continuing. Do NOT proceed with elaboration until setup is done — the settings file is required for correct workflow behavior.

---

**Project customization:** Before starting, check for `.ai-dlc/ELABORATION.md`. If it exists, read it and incorporate its guidance throughout the elaboration process. This file contains project-specific domain context, required discovery areas, compliance requirements, and team conventions that supplement these skill instructions.

You are the **Elaborator** starting the AI-DLC Mob Elaboration ritual. Your job is to collaboratively define:
1. The **Intent** - What are we building and why?
2. **Domain Model** - What entities, data sources, and systems are involved?
3. **Success Criteria** - How do we know when it's done?
4. **Units** - Independent pieces of work (for complex intents), each with enough technical detail that a builder with zero prior context builds the right thing

Then you'll write these as files in `.ai-dlc/{intent-slug}/` for the execution phase.

**CRITICAL PRINCIPLE: Elaboration is not a quick phase.** The purpose of elaboration is to build such deep understanding of the domain that the resulting spec is unambiguous. If a builder could misinterpret a unit and build the wrong thing, the elaboration is not done. Do NOT close this phase until you have a clear, specific, technically-grounded spec validated by the user.

**CRITICAL: Handling "Other" / free-text responses.** Every `AskUserQuestion` has a built-in "Other" option that lets the user type free text. When a user selects "Other" and provides free-text input, you MUST treat it as a conversation request — **stop the current phase, engage in open dialogue about what they wrote, and only resume the phase once the conversation reaches a natural conclusion.** Do NOT re-ask the same question or the next question immediately. The user chose "Other" because none of the options fit — respect that by listening and discussing before continuing.

---

## Autonomous Mode (invoked from `/ai-dlc:autopilot`)

When elaboration is invoked from `/ai-dlc:autopilot`, it runs in **autonomous mode**. The feature description has already been provided by the user. The goal is to produce a complete, high-quality spec with **minimal or zero user interaction** — make reasonable decisions instead of asking questions.

**How to detect:** If the conversation context shows that `/ai-dlc:autopilot` invoked this skill, you are in autonomous mode. Do not ask the user to confirm this — just operate accordingly.

**Autonomous defaults per phase:**

| Phase | Interactive behavior | Autonomous behavior |
|---|---|---|
| **1 (Gather Intent)** | Ask "What do you want to build?" | Use the feature description from `/ai-dlc:autopilot`. Do NOT ask. |
| **2 (Clarify Requirements)** | Ask 2-4 clarification questions | **Skip entirely.** Infer requirements from the feature description and domain discovery. The description from autopilot is assumed to be sufficient for well-understood features. |
| **2 (Deployment/Ops)** | Discovered from codebase (no questions asked) | **Same behavior.** Discovery is always autonomous — no change needed. |
| **2.3 (Knowledge Bootstrap)** | Synthesize knowledge from codebase | **Run silently.** Invoke the knowledge synthesis subagent (or write greenfield scaffolds) without asking the user. No interaction needed. |
| **2.5 (Domain Model validation)** | Ask user to confirm domain model accuracy | **Auto-approve.** Log the domain model for reference but do not ask. Discovery is still mandatory — only the confirmation prompt is skipped. |
| **2.75 (Design Direction)** | Present design direction picker | **Auto-select Editorial** with default parameters. Skip the picker UI. The default archetype can be overridden via `default_archetype` in `.ai-dlc/settings.yml`. |
| **3 (Workflow selection)** | Show options and ask user to choose | **Use the recommended workflow.** Run the recommendation logic, then apply it directly without asking. |
| **4 (Success Criteria)** | Ask about NFRs, then confirm criteria list | **Generate criteria and auto-approve.** Derive NFRs from the domain model and codebase patterns. Do NOT ask for confirmation. |
| **5.5 (Cross-cutting concerns)** | Always create foundation units (no question asked) | **Same behavior.** Foundation units are always created autonomously — no change needed. |
| **5.75 (Spec Alignment Gate)** | Ask user to confirm overall direction | **Auto-approve.** Skip the alignment question. |
| **5.8 (Git Strategy)** | Ask delivery strategy, source branch, hybrid | **Default to intent strategy** (`change_strategy: intent`, `auto_merge: true`) from the repo's default branch. No hybrid overrides. Do NOT ask. |
| **5.9 (Announcements)** | Read from project settings (no question asked) | **Same behavior.** Settings are always read without asking — no change needed. |
| **5.95 (Iteration Passes)** | Present configured passes via AskUserQuestion (3 options) | **Auto-accept defaults** but validate each pass name first via `validate_pass_exists`. If any pass is invalid, strip it and log a warning. Do NOT ask. |
| **6 (Per-unit review)** | Present each unit and ask for approval | **Auto-approve each unit.** Still write and commit each unit, still display them in the output, but do NOT ask for approval. Move to the next unit immediately. |
| **6.25 (Wireframe review)** | Ask product to review wireframes | **Auto-approve.** Still generate wireframes, but skip the review gate. |
| **7 (Spec Review)** | Ask user on FAIL findings | **Auto-fix FAIL findings** without asking. If auto-fix is not possible (genuine ambiguity about what the user wants), STOP and return control to autopilot with a clear error. |
| **8 (Handoff)** | Ask how to proceed | **Do NOT ask.** Return control to the autopilot caller. Do not offer Execute/PR options — autopilot handles next steps. |

**When to pause even in autonomous mode:**

Autonomous mode is NOT "ignore all problems." STOP and return control to autopilot (with a clear explanation) if:

1. **Domain discovery reveals fundamental ambiguity** — the feature description is too vague to determine what entities, APIs, or systems are involved, and guessing wrong would mean building the wrong thing entirely.
2. **Spec review finds unfixable FAIL issues** — critical problems (circular dependencies, missing core requirements) that require human judgment to resolve.
3. **The codebase contradicts the feature description** — e.g., the user asked to "add dark mode" but the app has no theming system and no CSS framework, making the approach entirely unclear.

In all other cases, make the best decision and keep moving. Autopilot is for well-understood features — the user chose it because they trust the AI to make reasonable calls.

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
1c. **Check for project setup**: If `.ai-dlc/settings.yml` does not exist, the project has not been configured yet. Run `/ai-dlc:setup` first so that providers, delivery strategy, announcements, and other project-level settings are established before elaboration begins.
   ```bash
   if [ ! -f ".ai-dlc/settings.yml" ]; then
     echo "No .ai-dlc/settings.yml found. Running /ai-dlc:setup first..."
   fi
   ```
   If the file is missing, invoke the setup skill:
   ```
   Skill("ai-dlc:setup")
   ```
   After setup completes, verify the settings file was created:
   ```bash
   if [ ! -f ".ai-dlc/settings.yml" ]; then
     echo "Setup was not completed. Please run /ai-dlc:setup before elaborating."
     exit 1
   fi
   ```
   If the file still doesn't exist (user cancelled or setup failed), stop and tell the user to run `/ai-dlc:setup` first. Do not proceed without configuration.

   **In autonomous mode:** If settings.yml is missing during autopilot, use all defaults without running setup — create a minimal settings file with sensible defaults instead of blocking:
   ```bash
   mkdir -p .ai-dlc
   cat > .ai-dlc/settings.yml << 'SETTINGS_EOF'
   git:
     change_strategy: intent
     default_branch: auto
     auto_merge: true
   default_announcements: [changelog]
   SETTINGS_EOF
   git add .ai-dlc/settings.yml
   git commit -m "ai-dlc: initialize default settings"
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
   - **Skip if intent status is `completed`**: Tell the user "Intent `{slug}` is already completed. Run `/ai-dlc:elaborate` without a slug to start a new intent." Then stop.
   - **Skip if ANY unit has status `in_progress` or `completed`**: Execution has already started — elaboration would conflict with in-flight work. Tell the user "Intent `{slug}` already has units in progress or completed. Use `/ai-dlc:resume {slug}` to continue execution or `/ai-dlc:execute` to resume the build loop." Then stop.
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
         {"label": "Looks good", "description": "Proceed to /ai-dlc:execute as-is"}
       ],
       "multiSelect": false
     }]
   }
   ```
4. Based on their choice:
   - **Modify intent**: Jump to Phase 4 (Success Criteria) with current values pre-filled
   - **Modify units**: Jump to Phase 5 (Decompose) with current units shown
   - **Start fresh**: Delete `.ai-dlc/{slug}/` and proceed to Phase 1
   - **Looks good**: Tell them to run `/ai-dlc:execute` to begin

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

## Phase 0.5: Detect Iteration Intent (`iterates_on`)

> **CALLOUT:** If the intent being elaborated has an `iterates_on` field in its frontmatter, it is an **iteration intent** — a follow-up that builds on a previous intent. This changes how several subsequent phases behave. The agent MUST check for this field early and carry the prior context through the entire elaboration.

If elaborating an existing intent (slug provided), check its frontmatter for `iterates_on`:

```bash
INTENT_SLUG="{slug}"

# Check if intent.md exists and has iterates_on
if [ -f ".ai-dlc/${INTENT_SLUG}/intent.md" ]; then
  ITERATES_ON=$(dlc_frontmatter_get "iterates_on" ".ai-dlc/${INTENT_SLUG}/intent.md" 2>/dev/null || echo "")
fi
```

If `ITERATES_ON` is non-empty, this is an iteration intent. Load the previous intent's full context:

**Load from filesystem first, then fall back to git branch:**

```bash
PREVIOUS_SLUG="$ITERATES_ON"

# Try filesystem
if [ -f ".ai-dlc/${PREVIOUS_SLUG}/intent.md" ]; then
  PREVIOUS_INTENT=$(cat ".ai-dlc/${PREVIOUS_SLUG}/intent.md")
  PREVIOUS_SOURCE="filesystem"
else
  # Fallback: read from intent branch
  PREVIOUS_INTENT=$(git show "ai-dlc/${PREVIOUS_SLUG}/main:.ai-dlc/${PREVIOUS_SLUG}/intent.md" 2>/dev/null)
  PREVIOUS_SOURCE="git-branch"
fi

# Load previous units
if [ "$PREVIOUS_SOURCE" = "filesystem" ]; then
  PREVIOUS_UNITS=""
  for unit_file in .ai-dlc/${PREVIOUS_SLUG}/unit-*.md; do
    [ -f "$unit_file" ] && PREVIOUS_UNITS="${PREVIOUS_UNITS}$(cat "$unit_file")\n---\n"
  done
else
  PREVIOUS_UNITS=""
  git ls-tree --name-only "ai-dlc/${PREVIOUS_SLUG}/main" ".ai-dlc/${PREVIOUS_SLUG}/" 2>/dev/null | \
    grep 'unit-' | while read -r f; do
      git show "ai-dlc/${PREVIOUS_SLUG}/main:$f" 2>/dev/null
    done
fi

# Load previous discovery.md if available
if [ "$PREVIOUS_SOURCE" = "filesystem" ]; then
  PREVIOUS_DISCOVERY=$(cat ".ai-dlc/${PREVIOUS_SLUG}/discovery.md" 2>/dev/null)
else
  PREVIOUS_DISCOVERY=$(git show "ai-dlc/${PREVIOUS_SLUG}/main:.ai-dlc/${PREVIOUS_SLUG}/discovery.md" 2>/dev/null)
fi
```

**Present prior context to the user:**

```markdown
## Iteration Context

This intent iterates on **{previous title}** (`{previous-slug}`).

### What was built previously
{Summary of previous intent's problem, solution, and domain model}

### Previous Units
| Unit | Status | Description |
|------|--------|-------------|
| {unit-slug} | {status} | {brief description} |
...

### Previous Domain Knowledge
{Key findings from discovery.md if available}
```

**Store this context** — it will be referenced in Phase 2, Phase 2.5, and Phase 5. Save to state:

```bash
dlc_state_save "$INTENT_DIR" "previous-intent-context" "{JSON summary of previous intent}"
```

**When `iterates_on` is set, the following phases are modified:**
- **Phase 1**: Skip the "What do you want to build?" question — the intent scaffold already has a Problem/Solution from `/ai-dlc:followup`. Instead, present the existing description and ask if the user wants to refine it.
- **Phase 2**: Use previous intent context to ask more targeted clarifying questions. Focus on what's *different* from the previous intent, not re-establishing the full domain.
- **Phase 2.5**: Shorten or skip domain discovery — the previous intent already explored the domain. Focus discovery on *new* areas or changes only.
- **Phase 5**: Reference previous units to understand what exists. Suggest units that modify, extend, or fix what was previously built.

---

## Phase 1: Gather Intent

**If `iterates_on` is set:** The intent was created by `/ai-dlc:followup` and already has a Problem/Solution section. Present the existing description to the user and ask if they want to refine it:

```json
{
  "questions": [{
    "question": "Here's the follow-up description from the intent scaffold. Does this capture what you need, or would you like to refine it?",
    "header": "Follow-up Description",
    "options": [
      {"label": "Looks good", "description": "Proceed with this description"},
      {"label": "Refine it", "description": "I want to adjust the problem or solution statement"}
    ],
    "multiSelect": false
  }]
}
```

If they choose "Refine it", engage in dialogue to update the Problem/Solution sections. If "Looks good", proceed to Phase 2.

**If `iterates_on` is NOT set (normal flow):**

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

> **Iteration intents (`iterates_on` set):** When elaborating an iteration intent, you already have the previous intent's domain model, units, and decisions as context. Focus clarifying questions on what's **different or new** in this follow-up — do not re-establish the full domain from scratch. Ask about: what specifically changed, which parts of the previous implementation are affected, any new constraints or requirements that didn't exist before, and whether the previous domain model needs updates.

Focus your questions on understanding:
- What **specific problem** this solves (not just "build X" but "build X because Y")
- Who uses it and how (the user journey, not just "it's for developers")
- What **systems, APIs, data sources, or codebases** are involved
- Key constraints or non-obvious requirements
- What the user cares about most (what would make them say "this isn't what I wanted"?)

**Do NOT ask generic checkbox questions** like "What's the scope?" or "What's the complexity?" These produce shallow understanding. Instead, ask questions specific to what the user described. If they said "build a dashboard for X", ask about what X's domain model looks like, what data they expect to see, what the key user workflows are.

Continue asking until you can articulate back to the user, in your own words, exactly what they want built. If you can't explain the domain entities, data flows, and user experience in concrete detail, you don't understand it yet.

### Phase 2 (continued): Deployment & Operations Context

**These concerns are NOT asked as questions.** Deployment, monitoring, and operational needs are discovered automatically during Phase 2.5 (Domain Discovery) by analyzing:
- Existing infrastructure config (Dockerfiles, Helm charts, Terraform, CI/CD pipelines)
- Existing monitoring setup (Prometheus, Grafana, Datadog, alert rules, SLOs)
- Existing operational procedures (runbooks, on-call configs, scaling policies)
- Stack config layers from `.ai-dlc/settings.yml`

The discovery subagent writes findings to `discovery.md` under standardized sections (`## Deployment Architecture`, `## Monitoring Setup`, `## Operational Procedures`). These findings feed into Phase 5 (auto-creation of infrastructure/observability units) and Phase 6 (unit frontmatter ops blocks).

**No user questions are asked here.** The elaboration skill uses discovered patterns and best practices to make deployment/ops decisions. For monitoring specifically, if discovery reveals an existing monitoring stack, the skill confirms the detected approach with the user after presenting the domain model (see Phase 2.5, "Present Domain Model to User").

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

# Always branch off the default branch
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
DEFAULT_BRANCH=$(resolve_default_branch "auto" "$REPO_ROOT")
git worktree add -B "$INTENT_BRANCH" "$INTENT_WORKTREE" "$DEFAULT_BRANCH"
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
- All subsequent state operations use the intent branch's `.ai-dlc/{slug}/state/` directory
- Multiple intents can run in parallel in separate worktrees
- Clean separation between main and AI-DLC orchestration state
- Subagents spawn from the intent worktree, not the original repo

---

## Phase 2.3: Knowledge Bootstrap

Before domain discovery, check whether knowledge artifacts already exist. If this is the first elaboration in a project with code, synthesize knowledge from the existing codebase so that the discovery subagent can build on it rather than re-discovering what is already known.

### Step 1: Check project maturity and existing knowledge

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
PROJECT_MATURITY=$(detect_project_maturity)
HAS_DESIGN_KNOWLEDGE=$(dlc_knowledge_exists "design" && echo "true" || echo "false")
KNOWLEDGE_COUNT=$(dlc_knowledge_list | wc -l | tr -d ' ')
```

### Step 2: Knowledge Synthesis (first elaboration or missing knowledge)

**Gate:** Only invoke the full synthesis subagent if `KNOWLEDGE_COUNT` is 0 AND `PROJECT_MATURITY` is `early` or `established` (there is actually code to scan). For `greenfield` projects with no code, skip the subagent and write inline scaffold artifacts instead.

**If `PROJECT_MATURITY` is `greenfield` AND `KNOWLEDGE_COUNT` is 0:**

Write empty scaffold knowledge artifacts so subsequent phases have files to reference:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"

SCAFFOLD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

dlc_knowledge_write "domain" "$(cat <<SCAFFOLD_EOF
---
type: domain
version: 1
created: ${SCAFFOLD_TIMESTAMP}
status: scaffold
source: synthesized
confidence: low
project_maturity: greenfield
---

# Domain Knowledge

> Greenfield project — will be populated as the project grows.

## Key Concepts

(none yet)

## Business Rules

(none yet)
SCAFFOLD_EOF
)"

dlc_knowledge_write "product" "$(cat <<SCAFFOLD_EOF
---
type: product
version: 1
created: ${SCAFFOLD_TIMESTAMP}
status: scaffold
source: synthesized
confidence: low
project_maturity: greenfield
---

# Product Knowledge

> Greenfield project — will be populated as the project grows.

## User Personas

(none yet)

## Key Workflows

(none yet)
SCAFFOLD_EOF
)"

git add .ai-dlc/knowledge/
git commit -m "elaborate(${INTENT_SLUG}): scaffold greenfield knowledge artifacts"
```

**If `PROJECT_MATURITY` is `early` or `established` AND `KNOWLEDGE_COUNT` is 0:**

1. Write the knowledge synthesis brief to `.ai-dlc/${INTENT_SLUG}/.briefs/knowledge-synthesize.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
project_maturity: {PROJECT_MATURITY}
---

# Knowledge Synthesis Request

Scan the codebase and synthesize knowledge artifacts for: domain, architecture, product, conventions.
```

2. Invoke the knowledge synthesis subagent:

```
Agent({
  subagent_type: "general-purpose",
  description: "knowledge-synthesize: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/knowledge-synthesize.md as input."
})
```

3. Read results from `.ai-dlc/${INTENT_SLUG}/.briefs/knowledge-synthesize-results.md`
4. Commit synthesized knowledge artifacts:

```bash
git add .ai-dlc/knowledge/ .ai-dlc/${INTENT_SLUG}/.briefs/knowledge-synthesize*.md
git commit -m "elaborate(${INTENT_SLUG}): synthesize knowledge from codebase"
```

**If `KNOWLEDGE_COUNT` is greater than 0:** Skip — knowledge artifacts already exist. No action needed.

> **Post-integrate refresh:** Knowledge artifacts are also refreshed automatically after each intent completes integration (see `/ai-dlc:advance` Step 5, "Post-Integrate Knowledge Refresh"). This means the codebase patterns established by intent N are captured in knowledge artifacts before intent N+1 begins elaboration. For greenfield projects, the first intent creates the foundational patterns (design tokens, architecture, conventions) and the post-integrate refresh captures them — so the second intent starts with real knowledge instead of empty scaffolds.

**CRITICAL — DO NOT STOP HERE.** Knowledge synthesis is just one step. Domain discovery (Phase 2.5) follows and can now build on the synthesized knowledge.

---

## Phase 2.5: Domain Discovery & Technical Exploration (Delegated)

**This phase is mandatory.** Domain discovery runs in a forked subagent to keep the main context lean. The subagent performs deep technical exploration autonomously, writing all findings to `discovery.md` on disk.

> **Iteration intents (`iterates_on` set):** When this intent iterates on a previous one, domain discovery should be **shortened, not skipped**. The previous intent already explored the domain — include the previous intent's `discovery.md` content in the discovery brief so the subagent can use it as a starting point. The subagent should focus on:
> - **New areas** introduced by the follow-up that weren't covered before
> - **Changes** to existing code/systems made by the previous intent (the codebase has evolved since the original discovery)
> - **Affected components** — which parts of what was built need modification
>
> Include the previous intent's discovery findings and unit specs in the discovery brief (Step 2) under a `## Previous Intent Context` section so the subagent has full context.

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

## Existing Project Knowledge

{For each knowledge artifact that exists (from Phase 2.3 or prior intents),
include its full content here. Load the list of artifacts via
`dlc_knowledge_list` and read each one via `dlc_knowledge_read "$type"`.

**Filter out scaffold artifacts:** Before including an artifact, check its
frontmatter confidence level via `dlc_frontmatter_get "confidence"`. Skip
any artifact with `confidence: low` — these are greenfield scaffolds with
no real content. Also skip artifacts whose body sections contain only
placeholder text like `(none yet)`.

```bash
CONFIDENCE=$(dlc_frontmatter_get "confidence" ".ai-dlc/knowledge/${artifact_type}.md" 2>/dev/null || echo "")
if [ "$CONFIDENCE" = "low" ]; then
  continue  # Skip low-confidence scaffolds in discovery brief
fi
```

Format each remaining artifact as a subsection:}

### knowledge/{type}.md
{content of the artifact}

{Repeat for each non-scaffold artifact. If no knowledge artifacts exist
(or all are low-confidence scaffolds), omit this section entirely.}
```

Commit the discovery brief immediately after writing it:

```bash
git add .ai-dlc/${INTENT_SLUG}/.briefs/elaborate-discover.md
git commit -m "elaborate(${INTENT_SLUG}): write discovery brief"
```

### Step 3: Invoke discovery subagent

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-discover: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/discover/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/elaborate-discover.md as input."
})
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

**Visual Review (preferred):**

First, check if visual review is enabled in settings:
```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
VISUAL_REVIEW=$(get_setting_value "visual_review")
```

If `VISUAL_REVIEW` is `true`, check if the `ask_user_visual_question` MCP tool is available:
```
ToolSearch("ask_user_visual_question")
```

If both the setting is enabled AND the tool is found, call it with the domain model as context:
```
ask_user_visual_question({
  title: "Domain Model Review",
  context: "{The full domain model markdown you just presented — Entities, Relationships, Data Sources, Data Gaps sections}",
  questions: [{
    question: "Does this domain model accurately capture the system? Are there entities, relationships, or data sources I'm missing?",
    header: "Domain Model",
    options: ["Looks accurate", "Missing entities", "Wrong relationships", "Missing data sources"],
    multiSelect: true
  }]
})
```

Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`. Read the `answers[0]`:
- `selectedOptions` contains the user's choices (e.g., `["Looks accurate"]`)
- `otherText` contains free-text input if the user typed additional notes
- If `selectedOptions` includes only `"Looks accurate"` and no `otherText`, proceed
- Otherwise, treat the response as feedback — explore gaps and re-present

**Fallback (if visual review is disabled or tool not available):**

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

### Post-Discovery: Monitoring Approach Confirmation

**Gate:** Only run this sub-step if discovery found monitoring patterns (check `discovery.md` for a `## Monitoring Setup` section with substantive content). Skip entirely if:
- No `## Monitoring Setup` section exists in discovery.md
- The intent has no deployment surface (library, docs, design-only, pure refactor)

If monitoring patterns were discovered, briefly summarize what was found and confirm the approach:

```json
{
  "questions": [{
    "question": "Discovery found existing monitoring patterns: {brief summary — e.g., 'Prometheus metrics with Grafana dashboards, OTel tracing'}. Should the new work follow these patterns?",
    "header": "Monitoring",
    "options": [
      {"label": "Follow existing patterns", "description": "Integrate with the discovered monitoring stack"},
      {"label": "New monitoring needed", "description": "This work needs monitoring beyond what exists"},
      {"label": "No monitoring needed", "description": "This intent doesn't need observability"}
    ],
    "multiSelect": false
  }]
}
```

Store the answer — it feeds into Phase 5 (ops-aware unit creation) to determine whether an observability unit is needed.

### Visual Brainstorming

For UI-heavy intents, support visual brainstorming alongside the terminal conversation:

1. **Generate wireframes/diagrams** — When discussing UI flows or architecture, generate HTML wireframes or Mermaid diagrams
2. **Open in browser** — Use `open` (macOS) or `xdg-open` (Linux) to display visuals:
   ```bash
   # Architecture diagram
   echo '<mermaid diagram>' > /tmp/aidlc-brainstorm.html && open /tmp/aidlc-brainstorm.html

   # UI wireframe
   echo '<wireframe html>' > /tmp/aidlc-wireframe.html && open /tmp/aidlc-wireframe.html
   ```
3. **Iterate visually** — After the user reviews, update and reopen. The visual and terminal conversation run in parallel.
4. **Persist approved visuals** — Save approved wireframes/diagrams to `.ai-dlc/{intent-slug}/brainstorm/`

This is most useful during:
- Phase 2.5 (domain discovery) — architecture diagrams
- Phase 5 (unit decomposition) — flow diagrams showing unit dependencies
- Phase 6.25 (wireframes) — already handled by elaborate-wireframes skill

---

## Phase 2.75: Design Direction

For greenfield and early-stage projects without existing design knowledge, present a design direction picker so the chosen archetype informs wireframes and builder context throughout the intent.

### Step 1: Check design knowledge

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
HAS_DESIGN_KNOWLEDGE=$(dlc_knowledge_exists "design" && echo "true" || echo "false")
```

### Step 2: Design Direction (greenfield/early only)

**Gate:** Only activate if `PROJECT_MATURITY` is `greenfield` or `early` AND `HAS_DESIGN_KNOWLEDGE` is `false`. If the project is `established` or design knowledge already exists, skip to Step 3.

Attempt to use the `pick_design_direction` MCP tool. If the tool call fails (tool not found, MCP server disconnected), fall back to the Terminal Fallback Path below.

**Visual Picker Path (preferred):**

Try calling `pick_design_direction` with the archetype and parameter data. If the call succeeds, proceed with polling. If it fails with a tool-not-found error, fall through to the Terminal Fallback Path.

1. Call `pick_design_direction` with the archetypes data. The MCP tool opens a browser-based visual picker showing archetype previews and parameter sliders.
2. Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`.
3. Read the selection from the result: `{ archetype, parameters }`.
4. Generate the design blueprint:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/design-blueprint.sh"
SELECTED_ARCHETYPE="{archetype id from picker}"
SELECTED_PARAMS='{JSON parameters from picker}'
dlc_generate_design_blueprint "${INTENT_SLUG}" "${SELECTED_ARCHETYPE}" "${SELECTED_PARAMS}"
```

5. Seed the design knowledge artifact from the blueprint:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"

# Read blueprint details
ARCHETYPE_NAME=$(dlc_frontmatter_get "archetype_name" ".ai-dlc/${INTENT_SLUG}/design-blueprint.md" 2>/dev/null || dlc_frontmatter_get "archetype" ".ai-dlc/${INTENT_SLUG}/design-blueprint.md" 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Extract the body (everything after frontmatter) from the blueprint
BLUEPRINT_BODY=$(sed '1,/^---$/d' ".ai-dlc/${INTENT_SLUG}/design-blueprint.md" | sed '1,/^---$/d')

# Write as properly-structured knowledge artifact
dlc_knowledge_write "design" "---
type: design
version: 1
created: ${TIMESTAMP}
last_updated: ${TIMESTAMP}
source: direction-picker
confidence: high
project_maturity: greenfield
---

# Design Knowledge

Derived from design direction: ${ARCHETYPE_NAME}

${BLUEPRINT_BODY}"
```

6. Commit:

```bash
git add .ai-dlc/${INTENT_SLUG}/design-blueprint.md .ai-dlc/knowledge/design.md
git commit -m "elaborate(${INTENT_SLUG}): set design direction — ${SELECTED_ARCHETYPE}"
```

**Terminal Fallback Path:**

If the `pick_design_direction` MCP tool is NOT available, use `AskUserQuestion` to present archetype options:

```json
{
  "questions": [{
    "question": "Choose a design direction for this project:",
    "header": "Design Direction",
    "options": [
      {"label": "Brutalist", "description": "High contrast, raw borders, asymmetric grids, monospace type"},
      {"label": "Editorial", "description": "Magazine layouts, strong typography, generous whitespace"},
      {"label": "Dense / Utilitarian", "description": "Packed information, minimal chrome, keyboard-first"},
      {"label": "Playful / Warm", "description": "Rounded corners, vibrant colors, playful personality"}
    ],
    "multiSelect": false
  }]
}
```

Map the selected label to the archetype ID: `Brutalist` → `brutalist`, `Editorial` → `editorial`, `Dense / Utilitarian` → `dense`, `Playful / Warm` → `playful`.

Use the default parameters for the chosen archetype (no slider tuning in terminal mode). Generate the blueprint and seed knowledge using the same steps as the Visual Picker Path above.

**Skip condition:** If `PROJECT_MATURITY` is `established`, or if `HAS_DESIGN_KNOWLEDGE` is already `true`, skip the design direction picker entirely. Existing design knowledge (from prior intents, synthesis, or manual setup) is already available.

**Autonomous mode behavior:** In autonomous mode, skip the picker UI entirely. Auto-select **Editorial** with default parameters (the most conventional and broadly appropriate archetype). This default can be overridden via `default_archetype` in `.ai-dlc/settings.yml`:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
DEFAULT_ARCHETYPE=$(get_setting_value "default_archetype" "editorial")
```

Generate the blueprint and seed knowledge using the selected archetype with its default parameters.

### Step 3: Load knowledge context for remaining phases

After knowledge bootstrap (Phase 2.3) and optional design direction:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/knowledge.sh"
DOMAIN_KNOWLEDGE=$(dlc_knowledge_read "domain" 2>/dev/null || echo "")
PRODUCT_KNOWLEDGE=$(dlc_knowledge_read "product" 2>/dev/null || echo "")
DESIGN_KNOWLEDGE=$(dlc_knowledge_read "design" 2>/dev/null || echo "")
```

If domain or product knowledge exists, carry it forward as additional context for Phase 3 (Workflow Selection), Phase 4 (Success Criteria), and Phase 5 (Decomposition). This enriches unit specs with domain vocabulary and business rules already captured in knowledge artifacts.

---

## Phase 3: Discover Hats and Select Workflow

### Step 1: Discover Available Hats

Use `dlc_frontmatter_get` to read all available hat definitions dynamically:

```bash
# List all hats from plugin directory
for hat_file in "${CLAUDE_PLUGIN_ROOT}/hats/"*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(dlc_frontmatter_get "name" "$hat_file" 2>/dev/null)
  desc=$(dlc_frontmatter_get "description" "$hat_file" 2>/dev/null)
  echo "- **${name:-$slug}** (\`$slug\`): $desc"
done

# Also check for project-local hat overrides
for hat_file in .ai-dlc/hats/*.md; do
  [ -f "$hat_file" ] || continue
  slug=$(basename "$hat_file" .md)
  name=$(dlc_frontmatter_get "name" "$hat_file" 2>/dev/null)
  desc=$(dlc_frontmatter_get "description" "$hat_file" 2>/dev/null)
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

### Design-Focused Criteria

The examples above are **developer-focused** — they verify behavior through automated tests. **Design units** need a different kind of criteria: ones verified by **visual approval** (a human reviews and approves) rather than automated test suites.

Design criteria should be **verifiable by inspection** — the reviewer can check them by reading the spec or reviewing the artifact. They cover responsive coverage, interactive states, accessibility, and design system alignment.

Good (design):
```
- [ ] Screen layouts defined for all breakpoints (mobile 375px / tablet 768px / desktop 1280px)
- [ ] All interactive states specified (default, hover, focus, active, disabled, error)
- [ ] Color usage references only design system tokens — no raw hex values
- [ ] Touch targets meet 44px minimum on mobile breakpoints
- [ ] Empty states, loading states, and error states designed
- [ ] Contrast ratios meet WCAG AA (4.5:1 body text, 3:1 large text)
- [ ] Focus order documented for keyboard navigation
- [ ] Component hierarchy documented (which design system components to use/extend)
- [ ] Interaction specs complete for all user actions (tap, swipe, scroll, transition)
```

Bad (design):
```
- [ ] Design looks good
- [ ] It's responsive
- [ ] Accessible
```

**When writing design criteria, keep these principles in mind:**
- Design criteria are verified by **visual approval**, not automated tests — a reviewer inspects the deliverable against the criteria.
- Include **explicit responsive breakpoint requirements**. "Responsive" alone is meaningless — name the breakpoints and viewport widths.
- **Always include accessibility criteria** for design units: contrast ratios, focus order, touch target sizing, screen reader annotations.
- Design criteria and dev criteria can coexist on the same intent — design units get design criteria, implementation units get dev criteria.

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

> **Iteration intents (`iterates_on` set):** When decomposing an iteration intent, reference the previous intent's units to understand what already exists in the codebase. Use this context to:
> - **Identify which previous units are affected** by the follow-up work and note them in the new unit specs
> - **Suggest units that modify or extend** specific previous units rather than starting from scratch
> - **Auto-populate `context` references** in unit descriptions pointing to previous unit files (e.g., "See `{previous-slug}/unit-02-auth-middleware` for the existing implementation")
> - **Avoid duplicating work** — if a previous unit already handles a concern, the new unit should describe how it *changes* that work, not rebuild it
> - **Carry forward domain knowledge** — reference the previous intent's domain model and data sources rather than re-describing them

**Hard rules for unit boundaries:**

1. **Units MUST NOT span dependency boundaries.** If a piece of work depends on another piece being done first, those are two separate units with an explicit `depends_on` edge. This applies regardless of change strategy (`unit` or `intent`). A unit that contains both "set up the database schema" and "build the API that uses it" is a bad unit — those are two units where the API unit depends on the schema unit.

2. **Units MUST NOT span domains.** A unit has exactly one discipline (frontend, backend, api, documentation, devops, design, etc.). No unit should mix frontend and backend work, or API and documentation, etc. If a feature needs both a backend endpoint and a frontend view, those are two units — the frontend unit `depends_on` the backend unit.

3. **Design work is its own unit.** If a feature needs UI/UX design work (mockups, component design, interaction flows), create a separate unit with `discipline: design` and `workflow: design`. The design workflow runs `planner → designer → reviewer`. Frontend implementation units should `depends_on` the design unit so builders have finalized designs to implement against. This also enables a human to own the design unit while AI handles other units.

**Per-unit workflow suggestions:** Different units may benefit from different workflows based on their discipline or risk profile. When decomposing, suggest an appropriate workflow for each unit:

| Discipline / Concern | Suggested Workflow | Rationale |
|---|---|---|
| `backend`, `api`, `devops`, `documentation` | `default` (planner → builder → reviewer) | Standard implementation cycle |
| `design` | `design` (planner → designer → reviewer) | Design artifacts need design hat, not builder |
| `infrastructure` | `default` (planner → builder → reviewer) | IaC provisioning follows standard plan-build-review |
| `observability` | `default` (planner → builder → reviewer) | Monitoring/alerting setup follows standard plan-build-review |
| Security-sensitive units | `adversarial` (planner → builder → red-team → blue-team → reviewer) | Adversarial testing for auth, crypto, data handling |
| Test-driven units | `tdd` (test-writer → implementer → refactorer → reviewer) | Red-Green-Refactor cycle for high-correctness code |
| Units without a clear workflow need | (omit `workflow:` field) | Inherits the intent-level workflow |

Set the `workflow:` frontmatter field on units that need a non-default workflow. Omit it (or leave empty) for units that should use the intent-level workflow.

**Auto-routing rules:**
- When generating a unit with `discipline: design`, automatically set `workflow: design` in the frontmatter. This ensures design units always route through the design workflow (`planner → designer → reviewer`) instead of accidentally inheriting the intent-level workflow.
- When generating a unit with `discipline: infrastructure` or `discipline: observability`, the default workflow applies — no `workflow:` override is needed (omit or leave empty). Do not require the user to specify this manually.

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
- Live state: Query `dlc_state_load "$INTENT_DIR" "iteration.json"` for current hat and phase

This unit does NOT handle: hat visualization (unit-03), live monitoring (unit-04),
or timeline replay (unit-05). It only renders the structural hierarchy.
```

### Phase 5 (continued): Operations-Aware Unit Creation

**Gate:** Skip this sub-phase entirely if the intent has no deployment surface. An intent has no deployment surface when:
- It is a library, documentation, design-only, or pure refactor intent
- Domain discovery found no deployment architecture, monitoring setup, or operational procedures
- No stack config layers are populated in `.ai-dlc/settings.yml`

When the intent DOES have a deployment surface, apply these rules to determine whether to create dedicated ops units or fold ops concerns into feature units:

#### Step 1: Detect deployment surface

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
STACK_INFRA=$(get_stack_layer "infrastructure")
STACK_MONITORING=$(get_stack_layer "monitoring")
STACK_COMPUTE=$(get_stack_layer "compute")

# Check: does the intent introduce NEW deployable services?
# (Determined from domain model and discovery findings)
INTRODUCES_NEW_SERVICES=false  # set true if intent adds new services/APIs/workers

# Check: does the intent require NEW monitoring?
# (Determined from discovery findings — check discovery.md for "## Monitoring Setup" section)
REQUIRES_NEW_MONITORING=false  # set true if discovery found gaps or new monitoring needs
```

#### Step 2: Apply auto-creation rules

**Large intents (>2 units) with new deployable services:**
- **Auto-create a dedicated infrastructure unit** (`discipline: infrastructure`) for IaC, Dockerfiles, Helm charts, Terraform manifests, CI/CD pipeline config. This unit has no `depends_on` — it is foundational. Feature units that deploy should `depends_on` the infrastructure unit.
- **Auto-create a dedicated observability unit** (`discipline: observability`) for dashboards, alert rules, SLOs, logging config, tracing setup. This unit `depends_on` feature units (it needs to know what to monitor).

**Small intents (1-2 units):**
- Do NOT create separate infrastructure or observability units — this would be over-engineering for the scope.
- Instead, **fold ops concerns into existing feature units**: add deployment/monitoring sections to existing unit specs and include deployable/observable success criteria in those units.

**No deployment surface:**
- Skip entirely. No ops units, no ops frontmatter blocks, no ops criteria. The elaboration flow is 100% unchanged.

#### Step 3: Dependency wiring for auto-created ops units

When infrastructure and observability units are auto-created:
- Infrastructure unit: `depends_on: []` (foundational — no dependencies)
- Feature units that deploy: add the infrastructure unit to their `depends_on` list
- Observability unit: `depends_on` all feature units that emit metrics or logs (needs to know what to monitor)

Present the full unit breakdown to the user and confirm before proceeding.

---

## Phase 5.5: Cross-Cutting Concern Analysis

After units are defined, identify concerns that span multiple units:

> Examples: authentication, error handling patterns, logging conventions, shared state, caching strategy.

**Auto-decide** how to handle each concern based on whether it requires shared code. Do NOT ask the user.

**If the concern requires shared code or infrastructure** (auth middleware, shared component library, database schema, shared API client):
- Create a foundation unit with `depends_on: []`
- Add it to the `depends_on` list of all consuming units
- Follow the same unit specification format from Phase 5

**If the concern is a pattern or convention** (error format standard, logging conventions, naming rules, coding patterns):
- Add it as an intent-level success criterion that every unit's reviewer checks
- Do NOT create a unit — conventions are rules to follow, not code to build

The distinction is: does the concern produce *code artifacts* that other units import/depend on? If yes, foundation unit. If it's a *rule to follow consistently*, it's a criterion.

**Skip this phase if there is only one unit.**

---

## Phase 5.6: Spec Flow Analysis

After decomposing into units, analyze the specification flow for gaps:

1. **Trace user flows end-to-end** — For each key user flow (login, purchase, submit form, etc.), verify that every step has a unit covering it. Gaps mean missing units.

2. **Check data flow completeness** — For each data entity, verify: create, read, update, delete are all covered (where applicable). Missing CRUD operations are spec gaps.

3. **Verify error paths** — For each success path, verify the corresponding error path is specified. "What happens when X fails?" should have an answer in the specs.

4. **Cross-unit boundary check** — Where unit A's output feeds unit B's input, verify the contract (data format, API shape, events) is specified in both units.

Report gaps as:
```markdown
### Spec Flow Gaps
- [ ] **Missing unit**: {user flow} has no unit covering {step}
- [ ] **Missing error path**: {unit} specifies success but not {failure scenario}
- [ ] **Contract gap**: {unit A} outputs {format} but {unit B} expects {different format}
```

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

**Visual Review (preferred):**

First, check if visual review is enabled in settings:
```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
VISUAL_REVIEW=$(get_setting_value "visual_review")
```

If `VISUAL_REVIEW` is `true`, check if the `ask_user_visual_question` MCP tool is available:
```
ToolSearch("ask_user_visual_question")
```

If both the setting is enabled AND the tool is found, call it with the elaboration summary as context:
```
ask_user_visual_question({
  title: "Spec Alignment Gate",
  context: "{The full elaboration summary markdown you just presented — Intent, Domain Model, Data Sources, Units, Workflow sections}",
  questions: [{
    question: "Does this intent and unit breakdown generally align with what you want built? (You'll review each unit in detail when we write the specs.)",
    header: "Alignment",
    options: ["Looks right", "Wrong breakdown", "Wrong direction"],
    multiSelect: false
  }]
})
```

Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`. Read `answers[0].selectedOptions[0]` to determine the user's choice. Check `answers[0].otherText` for any additional notes.

**Fallback (if visual review is disabled or tool not available):**

Ask with `AskUserQuestion`:
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

**For both paths, apply the same routing:**

- **"Looks right"**: Proceed to Phase 6
- **"Wrong breakdown"**: Discuss what needs to change, revise units in Phase 5, and re-present
- **"Wrong direction"**: Discuss with user, potentially return to Phase 2 or 2.5

---

## Phase 5.8: Git Strategy

Ask about the delivery strategy, source branch, and merge behavior for this intent. These settings control how unit work is organized and delivered.

**Before asking questions**, resolve the repo's default branch name so you can show it in the options:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
resolve_default_branch "auto" "$REPO_ROOT"
```

Use the resolved branch name (e.g. `main`, `master`, `dev`) to replace `{DEFAULT_BRANCH}` in the questions below.

Use `AskUserQuestion`:

**Question 1: Delivery strategy**

```json
{
  "questions": [
    {
      "question": "How should completed units be delivered?",
      "header": "Delivery Strategy",
      "options": [
        {
          "label": "Build everything, then open one PR",
          "description": "Units merge into an intent branch as they complete. Dependent units start automatically once their dependencies are done. One final PR for the whole intent."
        },
        {
          "label": "Review each unit individually",
          "description": "Each unit opens its own PR. Dependent units wait until their dependencies are merged. Best when you want to validate each piece before moving on."
        },
        {
          "label": "Build everything on {DEFAULT_BRANCH}",
          "description": "Same as above, but all work happens directly on {DEFAULT_BRANCH}. No feature branches, no PR — relies on CI to gate quality."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

**Question 2: Source branch** *(asked for ALL strategies)*

```json
{
  "questions": [
    {
      "question": "Which branch should units be created from?",
      "header": "Source Branch",
      "options": [
        {
          "label": "Use {DEFAULT_BRANCH} (recommended)",
          "description": "Create unit/intent branches from {DEFAULT_BRANCH}."
        },
        {
          "label": "Use my current branch",
          "description": "Create branches from the branch you're currently on."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

**Auto-merge** is implicit based on strategy — do NOT ask the user:
- `intent` strategy → `auto_merge: true` (units auto-merge into the intent branch)
- `unit` strategy → no `auto_merge` key (user merges their own PRs)
- `trunk` strategy → no `auto_merge` key (no branches to merge)

Store the selections. These will be written into the `intent.md` frontmatter in Phase 6 under a `git:` key:

```yaml
git:
  change_strategy: intent  # or unit, trunk
  auto_merge: true         # implicit for intent strategy; omit for unit/trunk
  auto_squash: false       # default false, only relevant when auto_merge is true
```

Map user selections to config values:

| What You Want | Strategy Value |
|--------------|----------------|
| Build everything, then open one PR | `intent` |
| Review each unit individually | `unit` |
| Build everything on {DEFAULT_BRANCH} | `trunk` |

- "Build everything, then open one PR" → `intent` + `auto_merge: true`
- "Review each unit individually" → `unit` (no `auto_merge` key — user merges their own PRs)
- "Build everything on {DEFAULT_BRANCH}" → `trunk` (no `auto_merge` key — no branches)

### Hybrid Per-Unit Strategy (Auto-Decided)

If the user selected **"Build everything, then open one PR"** (intent strategy), evaluate whether any foundational units should use per-unit branching instead. This creates a **hybrid** strategy where one or more units get their own PR (merged directly to the default branch), while the remaining units merge into the intent branch.

**Auto-decide using these heuristics:**
- If a unit has `depends_on: []` (no dependencies) AND other units depend on it AND it involves schema migrations, shared library setup, or infrastructure provisioning → set `git: { change_strategy: unit }` on that unit (it should land on the default branch first)
- If the dependency graph is linear (A → B → C) with no clear foundational boundary → keep all units on the intent branch (no hybrid)
- If a unit has `discipline: infrastructure` and is depended on by feature units → set it as per-unit

**Only ask the user via `AskUserQuestion` when the heuristic is ambiguous** — e.g., multiple units could qualify as foundational but it's unclear which ones genuinely need to land on the default branch first. In that case:

```json
{
  "questions": [{
    "question": "Multiple units could be delivered individually to {DEFAULT_BRANCH} before the rest. Which foundational units should get their own PR?",
    "header": "Hybrid",
    "options": [
      {"label": "None — all into intent branch", "description": "Standard intent strategy, no hybrid overrides"},
      {"label": "{unit-slug-1}", "description": "{one-line description}"},
      {"label": "{unit-slug-2}", "description": "{one-line description}"}
    ],
    "multiSelect": true
  }]
}
```

Units selected get `git: { change_strategy: unit }` in their frontmatter (Phase 6 Step 3).

**Skip entirely if the user selected "Review each unit individually" or "Build everything on {DEFAULT_BRANCH}"** — per-unit overrides only make sense with the intent branch strategy.

---

## Phase 5.9: Completion Announcements

Read the default announcements from project settings — **do NOT ask the user**. This is a project-level preference configured during `/ai-dlc:setup`.

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
DEFAULT_ANNOUNCEMENTS=$(get_setting_value "default_announcements")
# Falls back to ["changelog"] if not configured
if [ -z "$DEFAULT_ANNOUNCEMENTS" ] || [ "$DEFAULT_ANNOUNCEMENTS" = "null" ]; then
  DEFAULT_ANNOUNCEMENTS='["changelog"]'
fi
```

Write the value directly into intent.md frontmatter as `announcements:`. Valid values:
- `[]` — No announcements
- `[changelog]` — Conventional changelog entry (default)
- `[changelog, release-notes]` — Changelog + user-facing summary
- `[changelog, release-notes, social-posts, blog-draft]` — All formats

---

## Phase 5.95: Iteration Passes

Source the pass library and read configured defaults:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/pass.sh"
DEFAULT_PASSES=$(yq -r '.default_passes // [] | join(",")' .ai-dlc/settings.yml 2>/dev/null || echo "")
```

**If `DEFAULT_PASSES` is empty or contains fewer than 2 entries** (which includes the common "dev only" default): skip this phase entirely. Set `passes: []` and `active_pass: ""` in the intent frontmatter. Do not ask the user.

**If `DEFAULT_PASSES` has 2 or more entries**, validate and present them interactively:

### Step 1: Validate each pass name

```bash
VALID_PASSES=""
for pass_name in $(echo "$DEFAULT_PASSES" | tr ',' ' '); do
  if validate_pass_exists "$pass_name"; then
    VALID_PASSES="${VALID_PASSES}${VALID_PASSES:+,}${pass_name}"
  else
    echo "WARNING: Pass '${pass_name}' has no definition file. Skipping."
  fi
done
```

If fewer than 2 valid passes remain after validation, fall back to single-pass behavior (`passes: []`, `active_pass: ""`). Do not ask the user.

### Step 2: Load and display pass metadata

For each valid pass, call `load_pass_metadata` and build a summary table:

| Pass | Description | Available Workflows |
|---|---|---|
| `{name}` | `{description}` | `{available_workflows}` |

Display this table as context before asking.

### Step 3: Present via AskUserQuestion

**In autonomous mode:** skip the question. Auto-accept the validated defaults — set `passes` to the validated array and `active_pass` to the first entry. Log which passes were applied.

**In interactive mode:** present the following question:

```json
{
  "questions": [{
    "question": "Your project has configured multi-pass iteration:\n\n{pass metadata table}\n\nUse these passes for this intent?",
    "header": "Iteration Passes",
    "options": [
      {"label": "Use defaults ({pass1} → {pass2} → ...)", "description": "Apply the configured passes in order"},
      {"label": "Override", "description": "Specify different passes or reorder"},
      {"label": "Single pass (dev only)", "description": "Skip multi-pass — single implicit dev pass"}
    ],
    "multiSelect": false
  }]
}
```

### Step 4: Handle selection

- **Use defaults**: Set `passes` to the validated array, set `active_pass` to the first entry.
- **Override**: Ask the user which passes and in what order. Validate each name via `validate_pass_exists`. If any name is invalid, display a warning listing all available passes (from `list_available_passes`) and ask the user to correct. Repeat until all names are valid.
- **Single pass (dev only)**: Set `passes: []` and `active_pass: ""`.

### Step 5: Map to intent frontmatter

Map the result to the `passes` array in intent.md frontmatter:
- Single pass → `passes: []` (empty — single implicit dev pass, the default)
- `[design, dev]` → `passes: [design, dev]`
- `[design, product, dev]` → `passes: [design, product, dev]`

When passes are configured with 2+ entries, set `active_pass` to the first pass in the list. The units elaborated in this session belong to the active pass. When execution completes the active pass, the next pass will trigger a new elaboration cycle for its discipline-specific units.

> **Override:** To use different passes for a specific intent, the user can configure `passes` in the intent-level settings override at `.ai-dlc/{intent}/settings.yml`.

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
passes: []  # Validated pass names in order — empty for single-pass (default dev)
active_pass: ""  # Current pass being worked on — set to first pass during elaboration, auto-managed by advance
iterates_on: ""  # Slug of the previous intent this iterates on (set by /ai-dlc:followup, leave empty for new intents)
created: {ISO date}
status: active
epic: ""  # Ticketing provider epic key (auto-populated if ticketing provider configured)
quality_gates: []  # Detected from project tooling during discovery; e.g., [{name: tests, command: "npm test"}]
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

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
aidlc_record_intent_created "${INTENT_SLUG}" "${CHANGE_STRATEGY}"
```

### 2.5. Confirm Quality Gates

After writing intent.md and before writing units, confirm quality gates detected during discovery.

**Step A — Read discovery results.** Check `discovery.md` for the `## Quality Gate Candidates` section:

```bash
DISCOVERY_FILE=".ai-dlc/${INTENT_SLUG}/discovery.md"
```

Read the file and look for the `## Quality Gate Candidates` section. Parse the detected gates table.

**Step B — Present gates to user.** If quality gate candidates were found, display them and ask via `AskUserQuestion`:

First, display the detected gates as a formatted table:

```markdown
## Quality Gates Detected

| Gate | Command | Source |
|------|---------|--------|
| {name} | `{command}` | {source file} |
| ... | `...` | ... |
```

Then ask:

```json
{
  "questions": [{
    "question": "These quality gates will be enforced during construction — the AI cannot stop building until all gates pass. Which gates should be active?",
    "header": "Quality Gates",
    "options": [
      {"label": "Use all detected gates", "description": "All {N} gates above will run on every build cycle"},
      {"label": "Let me choose", "description": "Select which gates to include"},
      {"label": "Skip quality gates", "description": "No gates enforced (you can add them later in intent.md)"}
    ],
    "multiSelect": false
  }]
}
```

If the user selects **"Let me choose"**:

**If 4 or fewer gates:** Present each gate as a multi-select option:

```json
{
  "questions": [{
    "question": "Select which quality gates to enforce:",
    "header": "Gates",
    "options": [
      {"label": "{name}", "description": "`{command}` (from {source})"}
    ],
    "multiSelect": true
  }]
}
```

**If 5+ gates:** `AskUserQuestion` supports max 4 options, so use a different approach. The gates table is already displayed above. Ask the user which to exclude:

```json
{
  "questions": [{
    "question": "All {N} gates are shown in the table above. Which gates should be EXCLUDED? (Type gate names to exclude, or leave empty to use all)",
    "header": "Exclude",
    "options": [
      {"label": "Use all gates", "description": "Keep all {N} detected gates"},
      {"label": "Exclude some", "description": "I'll type which gates to skip"}
    ],
    "multiSelect": false
  }]
}
```

If the user selects "Exclude some", ask a follow-up: "Type the names of gates to exclude (comma-separated):" and wait for their response. Parse the names and remove those gates from the list.

After the user confirms (options 1 or 2), note:

```
Gates confirmed. To customize commands later, edit `quality_gates:` in `.ai-dlc/{intent-slug}/intent.md`.
```

If no candidates were found in discovery, skip the question and note:

```
No quality gates detected from project tooling. Proceeding with `quality_gates: []`.
You can add gates later by editing intent.md frontmatter.
```

**Step C — Update intent.md frontmatter.** Write the confirmed gates to intent.md using `yq`:

```bash
# yq accepts JSON-style objects in expressions; output is always clean YAML (keys unquoted, no JSON braces).
# For selected gates (example with two gates):
yq -i '.quality_gates = [{"name": "tests", "command": "npm test"}, {"name": "lint", "command": "npm run lint"}]' .ai-dlc/${INTENT_SLUG}/intent.md

# Or if user skipped / no gates detected:
yq -i '.quality_gates = []' .ai-dlc/${INTENT_SLUG}/intent.md
```

**Step D — Commit.**

```bash
git add .ai-dlc/${INTENT_SLUG}/intent.md
git commit -m "elaborate(${INTENT_SLUG}): set quality gates"
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
aidlc_record_intent_created "${INTENT_SLUG}" "${CHANGE_STRATEGY}"
```

### 3. Write and review each `unit-NN-{slug}.md` individually:

**Process each unit one at a time.** Write the file, present it for review, iterate until approved, then move to the next unit. Do NOT batch-write all units.

#### Unit file template:
```markdown
---
status: pending
last_updated: ""  # ISO 8601 UTC timestamp of last status change (auto-populated)
depends_on: []
branch: ai-dlc/{intent-slug}/NN-{unit-slug}
discipline: {discipline}  # frontend, backend, api, documentation, devops, design, etc.
pass: ""  # Set to active pass during elaboration — empty for single-pass intents
workflow: ""  # Per-unit workflow override (optional — omit or leave empty to use intent-level workflow). Auto-set to "design" when discipline is "design".
ticket: ""  # Ticketing provider ticket key (auto-populated if ticketing provider configured)
design_ref: ""  # Optional: path to external design file (PNG/JPG/HTML) or directory. Activates visual fidelity gate with high fidelity.
views: []  # Optional: list of views/routes this unit produces (e.g., ["/", "/about"]). Used for screenshot capture targeting.
# quality_gates: []  # Optional: unit-specific gates added by builders during construction
# git:                         # Optional: per-unit VCS override (only include when unit has an override)
#   change_strategy: ""        # Overrides intent-level strategy for this unit (e.g., "unit" for foundational units)
# --- Operations frontmatter (OPTIONAL — only include when unit has deployment surface) ---
# deployment:
#   target: ""          # e.g., kubernetes, ecs, lambda, docker-compose
#   artifacts: []       # e.g., [Dockerfile, helm-chart, terraform]
#   environments: []    # e.g., [staging, production]
# monitoring:
#   metrics: []         # key metrics this unit should emit
#   dashboards: []      # dashboard definitions or references
#   alerts: []          # alert rules for this unit
#   slos: []            # SLO definitions
# operations:
#   runbooks: []        # operational runbook references
#   rollback: ""        # rollback procedure
#   scaling: ""         # scaling strategy
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

> **Pass tagging:** When the intent has `active_pass` set (non-empty), every unit created during this elaboration session MUST have its `pass:` frontmatter field set to the `active_pass` value. When `active_pass` is empty (single-pass intent), leave `pass:` as `""`. This applies to both standard and design unit templates.

> **Quality gates in units:** Builders may add unit-level `quality_gates:` entries to a unit's
> frontmatter during construction (e.g., a migration dry-run check specific to that unit).
> Unit gates are enforced *in addition to* intent-level gates. Gates are additive —
> the quality-gate hook reads both intent and unit frontmatter each time. Reviewers
> should verify no intent-level gates were removed.

**Operations frontmatter blocks** (`deployment:`, `monitoring:`, `operations:`) are **optional** — only include them when the unit has a deployment surface. To determine applicability, check the unit's discipline against config.sh helpers:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
# Include deployment: block when deployable category is applicable
is_category_applicable "$DISCIPLINE" "deployable" && INCLUDE_DEPLOYMENT=true
# Include monitoring: block when observable category is applicable
is_category_applicable "$DISCIPLINE" "observable" && INCLUDE_MONITORING=true
# Include operations: block when operable category is applicable
is_category_applicable "$DISCIPLINE" "operable" && INCLUDE_OPERATIONS=true
```

For `discipline: infrastructure` or `discipline: observability` units, always populate the relevant ops blocks. For other disciplines, only include blocks where the category is applicable per `get_discipline_categories()`. When included, uncomment the relevant block(s) in the frontmatter and populate with values from discovery findings (see `## Deployment Architecture`, `## Monitoring Setup`, and `## Operational Procedures` sections in `discovery.md`).

> **Template selection by discipline:** For `discipline: design` units, use the design template below (Design Deliverables, States to Cover, Constraints, Design Tokens Reference). For all other disciplines (`frontend`, `backend`, `api`, `documentation`, `devops`, etc.), use the standard template above (Domain Entities, Data Sources, Technical Specification).

> **Visual fidelity fields (`design_ref:` and `views:`):** These fields control the visual fidelity gate during review. Set `design_ref:` to a path when you have an external design mockup (PNG, JPG, HTML file, or directory of images) — this activates the visual gate with **high** fidelity, meaning the reviewer will expect a pixel-close match. Set `views:` to list the routes or views this unit produces (e.g., `["/", "/about", "/dashboard"]`) — this helps the capture system know which pages to screenshot. If neither field is set, the visual gate may still activate automatically via heuristics (discipline, changed file types, or UI terms in the spec), but will use lower-fidelity references (previous iteration screenshots or wireframes).

#### Design unit file template:

When a unit has `discipline: design`, use this template instead of the standard one above:

```markdown
---
status: pending
depends_on: []
branch: ai-dlc/{intent-slug}/NN-{unit-slug}
discipline: design
pass: ""  # Set to active pass during elaboration — empty for single-pass intents
workflow: ""  # Per-unit workflow override (optional — omit or leave empty to use intent-level workflow)
ticket: ""  # Ticketing provider ticket key (auto-populated if ticketing provider configured)
design_ref: ""  # Optional: path to external design file (PNG/JPG/HTML) or directory. Activates visual fidelity gate with high fidelity.
views: []  # Optional: list of views/routes this unit produces (e.g., ["/", "/about"]). Used for screenshot capture targeting.
# git:                         # Optional: per-unit VCS override (only include when unit has an override)
#   change_strategy: ""        # Overrides intent-level strategy for this unit (e.g., "unit" for foundational units)
---

# unit-NN-{slug}

## Description
{What screens, components, or flows to design}

## Discipline
design - This unit will be executed by design-focused agents.

## Design Deliverables
- {Screen layouts, component specs, interaction flows, responsive rules}
- {List each deliverable expected from this unit}

## States to Cover
- Default (happy path)
- Empty state
- Loading state
- Error state
- {Other states relevant to this unit}

## Constraints
- {Design system to follow (e.g., specific tokens, component library)}
- {Accessibility requirements (WCAG level, contrast ratios, touch targets)}
- {Brand guidelines or visual boundaries}
- {Responsive breakpoints to support}

## Design Tokens Reference
- {Color tokens, spacing scale, typography scale from the design system}
- {Reference to design system documentation if available}

## Success Criteria
- [ ] {Design-focused criteria — visual approval, responsive coverage, state coverage}

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
- `infrastructure` → general-purpose agents with IaC/provisioning context
- `observability` → general-purpose agents with monitoring/alerting context
- `design` → design-focused agents

#### Per-unit review loop:

For each unit (in dependency order — units with no `depends_on` first):

**Step A — Write the unit file** to `.ai-dlc/{intent-slug}/unit-NN-{slug}.md`.

**Step A.1 — Commit the draft immediately.** Every write is versioned so the full evolution of each unit is visible in git history:

```bash
git add .ai-dlc/${INTENT_SLUG}/unit-NN-{slug}.md
git commit -m "elaborate(${INTENT_SLUG}): draft unit-NN-{slug}"
```

**Step A.2 — Validate criteria categories by discipline.** After writing each unit, check that its success criteria cover all required categories for its discipline:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
UNIT_DISCIPLINE="{discipline from unit frontmatter}"
CATEGORIES_JSON=$(get_discipline_categories "$UNIT_DISCIPLINE")
# Returns e.g.: {"functional":"required","deployable":"required","observable":"required","operable":"required"}
```

For each category where the value is `"required"`, scan the unit's success criteria to verify at least one criterion addresses that category:
- **functional**: criteria about correct behavior, expected outputs, user-visible features
- **deployable**: criteria about deployment, provisioning, artifacts, environment configuration
- **observable**: criteria about metrics, logging, dashboards, alerts, tracing
- **operable**: criteria about runbooks, rollback procedures, scaling, operational readiness

If a required category has zero criteria, add at least one criterion for that category before presenting the unit for review. For categories with value `"optional"`, note the gap but do not require criteria — include them only if relevant to the unit's scope. For categories with value `null`, the category does not apply — skip it entirely.

This enforcement ensures that, for example, a `backend` unit always has deployable/observable/operable criteria, while a `backend-library` unit only requires functional criteria.

**Step B — Present the full unit for review.** Read the file you just wrote and display its **complete contents** — every single line including frontmatter, description, technical specification, success criteria, risks, boundaries, and notes. Do NOT summarize, truncate, or show only the title. The user must see exactly what will be committed. Use a fenced code block:

```
### Unit NN: {Unit Title}

```markdown
{Read and paste the ENTIRE contents of unit-NN-{slug}.md — all frontmatter fields AND all body sections. Every line, no exceptions.}
```
```

**CRITICAL: If your output only shows the unit title or frontmatter without the body sections (Description, Technical Specification, Success Criteria, etc.), you have truncated the output. Go back and display the full file.**

**Step C — If the unit has `discipline: frontend` or `discipline: design`, open its wireframe in the browser** so the user can review the visual alongside the spec:

```bash
# Only for frontend or design units — open the wireframe if it exists
WIREFRAME=".ai-dlc/${INTENT_SLUG}/mockups/unit-NN-{slug}-wireframe.html"
if [ -f "$WIREFRAME" ]; then
  open "$WIREFRAME"  # macOS; use xdg-open on Linux
fi
```

**Step D — Ask for approval:**

**Visual Review (preferred):**

First, check if visual review is enabled in settings:
```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
VISUAL_REVIEW=$(get_setting_value "visual_review")
```

If `VISUAL_REVIEW` is `true`, check if the `ask_user_visual_question` MCP tool is available:
```
ToolSearch("ask_user_visual_question")
```

If both the setting is enabled AND the tool is found, call it with the full unit spec as context:
```
ask_user_visual_question({
  title: "Unit Review: unit-NN-{slug}",
  context: "{The full unit spec markdown you displayed in Step B — include the intent title as a breadcrumb header above the unit content, e.g., '# Intent: {intent title}\n\n' followed by the complete unit file contents}",
  questions: [{
    question: "Does this unit spec give a builder enough detail to build the right thing?",
    header: "Unit NN",
    options: ["Approved", "Needs changes", "Rethink unit"],
    multiSelect: false
  }]
})
```

Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`. Read `answers[0].selectedOptions[0]` for the decision and `answers[0].otherText` for feedback notes.

**Fallback (if visual review is disabled or tool not available):**

Use `AskUserQuestion`:
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

**For both paths, apply the same routing:**

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

### 4. Intent slug is directory-based

The intent slug is derived from the `.ai-dlc/{intent-slug}/` directory path — no separate state save is needed.

**Note:** Do NOT save `iteration.json` here. Execution state (hat, iteration count, workflow, status) is initialized by `/ai-dlc:execute` when the build loop starts. Elaboration only writes the spec artifacts.

### 5. Commit any remaining artifacts on intent branch:

Intent and unit files were committed individually during steps 2 and 3. This catch-all commit picks up any remaining artifacts (briefs, state files, etc.):

```bash
git add .ai-dlc/
git diff --cached --quiet || git commit -m "elaborate(${INTENT_SLUG}): finalize elaboration artifacts"
```

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/telemetry.sh"
aidlc_telemetry_init
UNIT_COUNT=$(ls "$INTENT_DIR"/unit-*.md 2>/dev/null | wc -l | tr -d ' ')
HAS_WIREFRAMES="false"
[ -d "$INTENT_DIR/mockups" ] && HAS_WIREFRAMES="true"
aidlc_record_elaboration_complete "${INTENT_SLUG}" "${UNIT_COUNT}" "${HAS_WIREFRAMES}"
```

### 5b. Push artifacts to remote (cowork)

If the orchestrator is in a temporary workspace (`/tmp/ai-dlc-workspace-*`):

```bash
git push -u origin "$INTENT_BRANCH"
```

This ensures builders can pull the intent branch when working remotely. Note in the handoff: "Artifacts pushed to `ai-dlc/{intent-slug}/main` branch on remote."

---

## Phase 6.25: Generate Frontend & Design Wireframes (Delegated)

**Skip this phase entirely if no units have `discipline: frontend` or `discipline: design` in their frontmatter.**

Wireframe generation runs in a forked subagent. The subagent generates low-fidelity HTML wireframes for all frontend and design units, updates unit frontmatter, and commits the artifacts.

### Step 1: Identify frontend and design units

Scan all `unit-*.md` files in `.ai-dlc/{intent-slug}/`. Collect units where frontmatter contains `discipline: frontend` or `discipline: design`.

If no frontend or design units exist, skip to Phase 6.5.

### Step 2: Load design provider config

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
PROVIDERS=$(load_providers)
DESIGN_TYPE=$(echo "$PROVIDERS" | jq -r '.design.type // empty')
if [ -n "$DESIGN_TYPE" ]; then
  DESIGN_CAPS=$(get_provider_capabilities "$DESIGN_TYPE")
  DESIGN_MCP_HINT=$(_provider_mcp_hint "$DESIGN_TYPE")
else
  DESIGN_CAPS=""
  DESIGN_MCP_HINT=""
fi
```

### Step 3: Write wireframes brief

Write `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes.md`:

```markdown
---
intent_slug: {INTENT_SLUG}
worktree_path: {absolute path to intent worktree}
intent_title: {Intent Title from intent.md}
design_provider_type: {DESIGN_TYPE or empty}
design_provider_capabilities: {DESIGN_CAPS JSON or empty if no provider}
design_provider_mcp_hint: {DESIGN_MCP_HINT or empty if no provider}
design_blueprint_path: {${WORKTREE_PATH}/.ai-dlc/${INTENT_SLUG}/design-blueprint.md if it exists, or empty}
---

# Frontend & Design Units

{For each frontend or design unit, include:}

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

Commit the wireframes brief immediately after writing it:

```bash
git add .ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes.md
git commit -m "elaborate(${INTENT_SLUG}): write wireframes brief"
```

### Step 4: Invoke wireframes subagent

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-wireframes: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/wireframes/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/elaborate-wireframes.md as input."
})
```

**CRITICAL — DO NOT STOP HERE.** After the wireframes subagent completes, immediately proceed to Step 5.

### Step 5: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes-results.md`.

- If `status: skipped` — no frontend or design units found, proceed to Phase 6.5
- If `status: error` — report the error to the user and discuss how to proceed
- If `status: success` — list the generated wireframes for the user

Commit the wireframe artifacts and results brief:

```bash
git add .ai-dlc/${INTENT_SLUG}/mockups/ .ai-dlc/${INTENT_SLUG}/.briefs/elaborate-wireframes-results.md
git commit -m "elaborate(${INTENT_SLUG}): generate frontend and design wireframes"
```

### Step 6: Product review gate

**Visual Review (preferred):**

First, check if visual review is enabled in settings:
```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"
VISUAL_REVIEW=$(get_setting_value "visual_review")
```

If `VISUAL_REVIEW` is `true`, check if the `ask_user_visual_question` MCP tool is available:
```
ToolSearch("ask_user_visual_question")
```

If both the setting is enabled AND the tool is found, call it with wireframe references as context:
```
ask_user_visual_question({
  title: "Wireframe Review",
  context: "{Build a markdown summary listing each wireframe file with its unit name and path. For each wireframe, include:\n- Unit name and slug\n- Wireframe file path: `.ai-dlc/${INTENT_SLUG}/mockups/unit-NN-{slug}-wireframe.html`\n- Brief description of what the wireframe covers\n\nNote: The user should have the wireframes open in browser tabs from Step 5.}",
  questions: [{
    question: "I've generated low-fidelity wireframes for the frontend and design units. Review the screen structure, flow, and placeholder copy. How do they look?",
    header: "Wireframes",
    options: ["Approved", "Needs revision", "Skip wireframes"],
    multiSelect: false
  }]
})
```

Parse the session ID from the response, then poll `get_review_status({session_id})` until `status` is `"answered"`. Read `answers[0].selectedOptions[0]` for the decision and `answers[0].otherText` for revision notes.

**Fallback (if visual review is disabled or tool not available):**

Present all generated wireframes to product for review using `AskUserQuestion`:

```json
{
  "questions": [{
    "question": "I've generated low-fidelity wireframes for the frontend and design units. Please open them in a browser to review screen structure, flow, and placeholder copy. How do they look?",
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

**For both paths, apply the same routing:**

- **Approved**: Proceed to Phase 6.5.
- **Needs revision**: Discuss feedback, update the wireframe HTML files directly, commit the revision, and re-present for review. Loop until approved.
  ```bash
  git add .ai-dlc/${INTENT_SLUG}/mockups/
  git commit -m "elaborate(${INTENT_SLUG}): revise wireframes"
  ```
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

If `TICKETING_TYPE` is empty, skip this phase entirely and proceed to Phase 7 (Spec Review).

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

Commit the ticket sync brief immediately after writing it:

```bash
git add .ai-dlc/${INTENT_SLUG}/.briefs/elaborate-ticket-sync.md
git commit -m "elaborate(${INTENT_SLUG}): write ticket sync brief"
```

### Step 3: Invoke ticket sync subagent

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-ticket-sync: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/ticket-sync/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/elaborate-ticket-sync.md as input."
})
```

**CRITICAL — DO NOT STOP HERE.** After the ticket sync subagent completes, immediately proceed to Step 4.

### Step 4: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-ticket-sync-results.md`.

- If `status: skipped` — ticketing not configured or MCP tools unavailable, proceed to Phase 7 (Spec Review)
- If `status: error` — report the errors to the user. If `validation_passed: false`, the subagent already retried. Log the failures and proceed to Phase 7 (Spec Review) (never block elaboration on ticket sync failure)
- If `status: success` — log the epic key and ticket keys, confirm validation passed, proceed to Phase 7 (Spec Review)

Commit the ticket sync artifacts (updated intent.md and unit files with ticket keys, plus the results brief):

```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "elaborate(${INTENT_SLUG}): sync tickets to provider"
```

---

## Phase 7: Spec Review

Before execution begins, run an automated spec review to catch issues early.

Launch a review subagent:

```javascript
Agent({
  subagent_type: "general-purpose",
  description: "spec review: ${intentSlug}",
  prompt: `
    Review the intent and unit specifications for completeness and consistency.

    ## Files to Review
    - .ai-dlc/${intentSlug}/intent.md
    - .ai-dlc/${intentSlug}/unit-*.md

    ## Review Checklist

    ### Completeness
    - [ ] Every unit has success criteria
    - [ ] Every unit has a description
    - [ ] Dependencies (depends_on) reference existing units
    - [ ] No circular dependencies
    - [ ] All units have a discipline assigned
    - [ ] Design units have workflow: design

    ### Consistency
    - [ ] Unit numbering is sequential (no gaps)
    - [ ] Unit slugs match file names
    - [ ] Success criteria are verifiable (not vague)
    - [ ] Boundaries don't overlap between units

    ### YAGNI
    - [ ] No units that aren't required by the intent's success criteria
    - [ ] No over-specified technical details that constrain implementation unnecessarily
    - [ ] Scope matches what the user asked for (no scope creep)

    ## Output

    Report findings as:
    - **PASS**: Spec is ready for execution
    - **WARN**: Issues found but not blocking (list them)
    - **FAIL**: Critical issues that must be fixed (list them)

    For FAIL findings, suggest specific fixes.
  `
})
```

If the review returns FAIL, present the findings to the user via `AskUserQuestion` and ask whether to fix the issues or proceed anyway.

If PASS or WARN, output the review summary and proceed.

---

## Phase 7.5: Adversarial Spec Review (Delegated)

**This phase is non-blocking.** It runs an adversarial review of the spec via a delegated subagent, then auto-applies safe fixes and presents remaining findings to the user. The user can always skip findings and proceed to Phase 8.

> **Prerequisites:**
> - Phase 7 (Spec Review) must complete before Phase 7.5 runs.
> - If Phase 7 returned FAIL and the user fixed issues, those fixes should be committed before this phase writes its brief (so the brief reflects the fixed state).
> - Phase 7.5 always proceeds to Phase 8 regardless of findings — it never hard-blocks elaboration.

### Step 1: Gather spec context

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

### Step 2: Write adversarial review brief

Write `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-adversarial-review.md`:

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

### Step 3: Invoke adversarial review subagent

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-adversarial-review: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/adversarial-review/SKILL.md first, then execute it with the brief file at .ai-dlc/{INTENT_SLUG}/.briefs/elaborate-adversarial-review.md as input."
})
```

**CRITICAL — DO NOT STOP HERE.** The adversarial review is only one sub-step of elaboration. After the subagent completes, you MUST immediately proceed to Step 4 below. The subagent writes its results to disk — you need to read them, handle findings, and continue to Phase 8 (Handoff). Stopping here means the elaboration is incomplete.

### Step 4: Read results

Read `.ai-dlc/${INTENT_SLUG}/.briefs/elaborate-adversarial-review-results.md`.

- Parse the YAML frontmatter: `status`, `findings_count`, `auto_fixable_count`, `categories_found`
- If `status: error` — report the error to the user and proceed to Phase 8 (never block elaboration on review failure)
- If `status: success` and `findings_count: 0` — log that the spec passed adversarial review cleanly and proceed to Phase 8
- If `status: success` and `findings_count > 0` — proceed to Step 5

### Step 5: Auto-apply high-confidence fixes

Parse the findings YAML from the results body. For each finding, auto-apply when ALL of these conditions are met:

1. `confidence: high`
2. `fix_type` is one of: `add_dependency` or `add_criterion`
3. `fix_type` is NOT `spec_edit`, `remove_unit`, `reorder`, or `manual`

**NEVER auto-apply `spec_edit`, `remove_unit`, `reorder`, or `manual` fix types regardless of confidence level.** The `spec_edit` type covers too wide a range of changes (from typo fixes to section rewrites) for safe auto-application — always present these to the user. The `reorder` type changes execution order and must be user-approved.

For each auto-applied fix:
- `add_dependency`: edit the target unit's frontmatter `depends_on` field
- `add_criterion`: append the criterion to the target unit's success criteria list

Track which findings were auto-applied.

Commit all auto-applied fixes together:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "elaborate(${INTENT_SLUG}): auto-apply adversarial review fixes

Applied {N} high-confidence fixes:
- {F001}: {title}
- {F002}: {title}
..."
```

If no findings qualify for auto-apply, skip the commit and proceed to Step 6.

### Step 6: Present remaining findings to user

Group remaining findings (not auto-applied) by severity and present them:

```markdown
## Adversarial Review Results

**{findings_count} findings** ({auto_applied_count} auto-applied, {remaining_count} for your review)

### Auto-Applied Fixes
{For each auto-applied fix:}
- **{F001}** ({category}): {title} — {what was changed}

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

Use `AskUserQuestion` to let the user decide how to handle remaining findings:
```json
{
  "questions": [{
    "question": "How should we handle these findings?",
    "header": "Adversarial Review Findings",
    "options": [
      {"label": "Apply all suggested fixes", "description": "Apply all suggested fixes for the findings above"},
      {"label": "Let me choose", "description": "I'll decide per-finding which to apply"},
      {"label": "Skip all", "description": "Proceed without addressing these findings"}
    ],
    "multiSelect": false
  }]
}
```

If "Apply all suggested fixes": apply all remaining fixes and proceed to Step 7.
If "Let me choose": present each finding individually with Apply/Skip options, then proceed to Step 7 with the user's selections.
If "Skip all": skip Step 7 and proceed to Step 8.

If there are no remaining findings (all were auto-applied or none existed), skip the `AskUserQuestion` and proceed to Step 8.

### Step 7: Apply user-approved fixes

For each user-approved fix, apply the suggested change to the target file.

Commit all user-approved fixes together:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git commit -m "elaborate(${INTENT_SLUG}): apply user-approved adversarial review fixes

Applied:
- {F003}: {title}
- {F005}: {title}
..."
```

### Step 8: Commit final state

Commit any remaining artifacts:
```bash
git add .ai-dlc/${INTENT_SLUG}/
git diff --cached --quiet || git commit -m "elaborate(${INTENT_SLUG}): finalize adversarial review"
```

Proceed to Phase 8 (Handoff).

---

## Phase 8: Handoff

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
      {"label": "Execute", "description": "Start the autonomous build loop now"},
      {"label": "Open PR for review", "description": "Create a pull request for spec review before building"}
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
      {"label": "Push branch + open PR", "description": "Push the spec branch and create a pull request for review (requires git push access)"},
      {"label": "Download as zip", "description": "Package all spec artifacts into a zip file you can share with your team"}
    ],
    "multiSelect": false
  }]
}
```

**Note:** If the user connected via **local folder**, skip the question entirely — just tell them the artifacts are written and ready to commit (see "If local folder" below).

### If Execute (CLI only):

Tell the user:

```
To start the autonomous build loop:
  /ai-dlc:execute

The execution phase will iterate through each unit, using quality gates
(tests, types, lint) as backpressure until all success criteria are met.

Note: All AI-DLC work happens in the worktree at .ai-dlc/worktrees/{intent-slug}/
Your main working directory stays clean on the main branch.
```

### If PR for review:

**IMPORTANT:** Do NOT include "Closes", "Fixes", or "Resolves" issue references in the PR body. This is a spec review PR — merging it must not auto-close the linked issue. The issue stays open until execution is complete.

1. Push the intent branch to remote:

```bash
INTENT_BRANCH="ai-dlc/${INTENT_SLUG}/main"
git push -u origin "$INTENT_BRANCH"
```

2. Create PR:

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
*This is an AI-DLC spec review PR. Approve and run \`/ai-dlc:execute\` to begin the autonomous build loop.*
EOF
)"
```

3. Clean up elaboration worktree after PR is pushed (work is on remote now):

```bash
# Clean up elaboration worktree — spec is on the remote branch now
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
INTENT_WORKTREE="${REPO_ROOT}/.ai-dlc/worktrees/${INTENT_SLUG}"
if [ -d "$INTENT_WORKTREE" ]; then
  git worktree remove "$INTENT_WORKTREE" 2>/dev/null || echo "Warning: failed to remove worktree at $INTENT_WORKTREE"
  echo "Cleaned up elaboration worktree for ${INTENT_SLUG}"
fi
git worktree prune
# Keep the branch — it backs the open spec review PR
```

4. Tell the user:

```
Spec PR created: {PR_URL}

Review the spec with your team. When approved, a developer can run:
  /ai-dlc:execute
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

Then a developer can run `/ai-dlc:execute` in Claude Code to start the build loop.
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
3. Run /ai-dlc:execute in Claude Code to start the build loop
```
