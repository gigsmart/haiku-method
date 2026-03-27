---
description: Configure AI-DLC for this project — auto-detects VCS, hosting, CI/CD, and MCP providers. Creates or updates .ai-dlc/settings.yml.
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - ToolSearch
  - ListMcpResourcesTool
  - ReadMcpResourceTool
  # MCP read-only tool patterns (discovery only, no writes)
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
---

# AI-DLC Setup

You are the **Setup Assistant** for AI-DLC. Your job is to configure this project's `.ai-dlc/settings.yml` by auto-detecting the environment and confirming settings with the user.

This skill is **idempotent** — re-running `/setup` preserves existing settings as defaults.

---

## Pre-check: Reject Cowork Mode

```bash
if [ "${CLAUDE_CODE_IS_COWORK:-}" = "1" ]; then
  echo "ERROR: /setup cannot run in cowork mode."
  echo "Run this in a full Claude Code CLI session inside your project directory."
  exit 1
fi
```

If `CLAUDE_CODE_IS_COWORK=1`, stop immediately with the message above. Do NOT proceed.

---

### Configuration Precedence

AI-DLC uses a Master + Overrides pattern for configuration:

| Level | Location | Scope | Precedence |
|-------|----------|-------|------------|
| **Global** | `settings.yml` | All intents | Lowest |
| **Intent** | `.ai-dlc/{intent}/settings.yml` | This intent | Medium |
| **Unit** | Unit frontmatter fields | This unit | Highest |

**Examples:**
- Global sets `change_strategy: unit`, but a specific intent overrides to `intent` for parallel work
- Global sets `granularity: standard`, but a complex intent overrides to `fine`
- A unit overrides `change_strategy: unit` even when the intent uses `intent` (hybrid strategy)

When reading configuration, always resolve in order: unit frontmatter → intent settings → global settings. First non-empty value wins.

---

## Phase 0: Load Existing Settings

1. Check if `.ai-dlc/settings.yml` exists using the `Read` tool.
   - If it exists, parse the current values — these become the **defaults** for all prompts below.
   - If `.ai-dlc/` doesn't exist, create it:
     ```bash
     mkdir -p .ai-dlc
     ```

2. Store the existing settings (or empty `{}`) as `EXISTING_SETTINGS` for reference throughout.

---

## Phase 1: Auto-Detect Environment

Run these detections via Bash by sourcing the config library:

```bash
source "${CLAUDE_PLUGIN_ROOT}/lib/config.sh"

VCS=$(detect_vcs)
VCS_HOSTING=$(detect_vcs_hosting)
CI_CD=$(detect_ci_cd)
DEFAULT_BRANCH=$(resolve_default_branch "auto")

echo "vcs=$VCS"
echo "vcs_hosting=$VCS_HOSTING"
echo "ci_cd=$CI_CD"
echo "default_branch=$DEFAULT_BRANCH"
```

Store results:
- `DETECTED_VCS`: `git` or `jj`
- `DETECTED_HOSTING`: `github`, `gitlab`, `bitbucket`, or empty
- `DETECTED_CI_CD`: `github-actions`, `gitlab-ci`, `jenkins`, `circleci`, or empty
- `DETECTED_DEFAULT_BRANCH`: resolved branch name

---

## Phase 2: Probe MCP Tools for Providers

Use `ToolSearch` to discover available MCP providers. Run **all probes in parallel**:

| Category | Search Terms |
|----------|-------------|
| Ticketing | `"jira"`, `"linear"`, `"gitlab issues"` |
| Spec | `"notion"`, `"confluence"`, `"google docs"` |
| Design | `"figma"` |
| Comms | `"slack"`, `"teams"`, `"discord"` |

Also check:
- If `DETECTED_HOSTING` is `github` and `gh` CLI exists (`command -v gh`), suggest `github-issues` as a zero-config ticketing option
- Use `ListMcpResourcesTool` as a secondary signal for available MCP servers

Build a detection results map:

| Category | Detected Provider | Source |
|----------|------------------|--------|
| Ticketing | e.g., `jira` | MCP tool found: `mcp__*jira*` |
| Spec | e.g., `confluence` | MCP tool found: `mcp__*confluence*` |
| Design | e.g., `figma` | MCP tool found: `mcp__*figma*` |
| Comms | e.g., `slack` | MCP tool found: `mcp__*slack*` |

If existing settings already declare a provider for a category, keep that as the default even if detection found something different.

---

## Phase 3: Present Findings & Confirm

Display a summary table of all detected settings:

```
## Detected Configuration

| Setting | Value | Source |
|---------|-------|--------|
| VCS | git | auto-detected |
| Hosting | github | auto-detected |
| CI/CD | github-actions | auto-detected |
| Default Branch | main | auto-detected |
| Ticketing | jira | MCP tools found |
| Spec | confluence | MCP tools found |
| Design | — | not detected |
| Comms | slack | MCP tools found |
```

If existing settings differ from detection, show both:

```
| Ticketing | jira | existing settings (detected: linear) |
```

Then ask a **single confirmation question**:

Use `AskUserQuestion`:
- "Are these detected settings correct?"
- Options: "Yes, looks good" / "Need to adjust"

If **"Need to adjust"** → ask follow-up questions for each category they want to change. Use `AskUserQuestion` with the valid enum values from the settings schema for each provider type.

---

## Phase 4: Provider-Specific Configuration

For each **confirmed provider**, collect required configuration by reading the provider's config schema:

1. Read `${CLAUDE_PLUGIN_ROOT}/schemas/providers/{type}.schema.json`
2. **Required fields** (listed in the schema's `required` array) → ask via `AskUserQuestion`
3. **Optional fields** → use defaults from schema, offer to customize
4. Write all config under `providers.{category}.config` in settings.yml

### Provider-specific notes:

### Jira
- If Jira MCP tools are available, try to list accessible projects to offer `project_key` options:
  - Use `mcp__*__getVisibleJiraProjects` or similar tool if found via ToolSearch
  - Present discovered projects as `AskUserQuestion` options
- If no MCP tool available for listing, ask as free-text via `AskUserQuestion`

### GitHub Issues
- **Zero config** — no required fields in schema. Just confirm the provider type.

### Linear
- Schema requires `project_key` — ask via `AskUserQuestion`

### GitLab Issues
- Schema requires `project_id` — ask via `AskUserQuestion`

### Confluence
- Space key is optional but recommended — ask via `AskUserQuestion`
- If Confluence MCP tools available, try to list spaces as options

### Notion
- Workspace ID is optional but recommended — ask via `AskUserQuestion`

### Figma
- No required config beyond confirming the provider type

### Slack / Teams / Discord
- Channel or workspace identifiers if needed — ask via `AskUserQuestion`

**Skip** any provider the user declined or that wasn't detected and the user didn't manually add.

Pre-fill all values from existing `settings.yml` if re-running.

---

## Phase 4b: Provider Instructions

For each **confirmed provider**, offer to customize how AI-DLC interacts with it. AI-DLC ships with sensible built-in defaults (in `plugin/providers/{category}.md`), but every team is different — custom instructions let projects tailor behavior to their workflow.

### For each confirmed provider:

1. **Read the built-in defaults** for that category:
   ```bash
   cat "${CLAUDE_PLUGIN_ROOT}/providers/{category}.md"
   ```
   Where `{category}` is `ticketing`, `spec`, `design`, or `comms`.

2. **Check for existing project override** at `.ai-dlc/providers/{type}.md` (e.g., `.ai-dlc/providers/jira.md`). If it exists, read it and show its contents.

3. **Show the user the current instructions** (built-in defaults, or existing override if present) and ask:

   Use `AskUserQuestion`:
   - "Here are the current {category} instructions for {type}. Want to customize them for this project?"
   - Options:
     - **"Use defaults"** — Built-in defaults are fine, no project override needed
     - **"Customize"** — Create a project override file to tailor behavior

4. **If "Customize"**:
   - Create `.ai-dlc/providers/{type}.md` with the built-in defaults pre-populated as a starting template:
     ```markdown
     ---
     category: {category}
     description: Project-specific {type} instructions
     ---

     {contents of built-in default, body only (after frontmatter)}
     ```
   - Tell the user: "Created `.ai-dlc/providers/{type}.md` with defaults as a starting point. Edit this file to customize how AI-DLC interacts with {type} for this project."
   - Commit the new override file immediately:
     ```bash
     git add .ai-dlc/providers/{type}.md && git commit -m "ai-dlc: configure {type} provider"
     ```

5. **If "Use defaults"** → skip, no file created. The built-in defaults apply automatically.

6. **If an override file already exists** from a previous `/setup` run, change the question to:
   - "Project override exists at `.ai-dlc/providers/{type}.md`. Want to keep it, reset to defaults, or remove it?"
   - Options:
     - **"Keep as-is"** — Don't touch the existing override
     - **"Reset to defaults"** — Overwrite with current built-in defaults, then commit:
       ```bash
       git add .ai-dlc/providers/{type}.md && git commit -m "ai-dlc: reset {type} provider to defaults"
       ```
     - **"Remove override"** — Delete the file, revert to built-in defaults only, then commit the removal:
       ```bash
       git rm .ai-dlc/providers/{type}.md && git commit -m "ai-dlc: remove {type} provider override"
       ```

**Skip** this phase for any provider category that has no confirmed provider.

---

## Phase 5: VCS Strategy

Ask the user about their preferred delivery strategy, source branch, and auto-merge behavior.

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
          "label": "Review each unit individually",
          "description": "Each unit opens its own PR/MR. Dependent units wait until their dependencies are merged. Best when you want to validate each piece before moving on."
        },
        {
          "label": "Build everything, then open one MR",
          "description": "Units merge into an intent branch as they complete. Dependent units start automatically once their dependencies are done. One final MR for the whole intent."
        },
        {
          "label": "Build everything on my default branch",
          "description": "Same as above, but all work happens directly on the default branch. No feature branches, no MR — relies on CI to gate quality."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

Pre-fill from existing `settings.yml` `{vcs}.change_strategy` if available.

Map user selections to config values:
- "Review each unit individually" → `change_strategy: unit`
- "Build everything, then open one MR" → `change_strategy: intent`
- "Build everything on my default branch" → `change_strategy: trunk`

**Question 2: Source branch** *(asked for ALL strategies)*

```json
{
  "questions": [
    {
      "question": "Which branch should units be created from?",
      "header": "Source Branch",
      "options": [
        {
          "label": "Use the default branch (recommended)",
          "description": "Create unit/intent branches from the repo's default branch (e.g. main, dev)."
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

**Question 3: Auto-merge** *(only if user selected "Build everything, then open one MR")*
- "Should completed unit branches be automatically merged into the intent branch?"
- Options:
  - **Yes (Recommended)** — Auto-merge when unit passes review
  - **No** — Manual merge after review

Pre-fill from existing `settings.yml` `{vcs}.auto_merge` if available.

Only ask auto-merge if strategy is `intent` ("Build everything, then open one MR"). For `unit` ("Review each unit individually"), merging is the user's responsibility (they merge their own PRs), so skip this question and do not set `auto_merge`. For `trunk` ("Build everything on my default branch"), branches aren't used.

---

## Phase 6: Write Settings File

1. Read existing `.ai-dlc/settings.yml` via `Read` tool (if it exists) to preserve any manual edits or fields not covered by this wizard.

2. Merge new values over existing. Build the YAML structure:

```yaml
# Only include the detected VCS section (git or jj, not both)
git:  # or jj:
  change_strategy: unit
  default_branch: main
  auto_merge: true
  elaboration_review: true

# Only include providers that were confirmed
providers:
  ticketing:
    type: jira
    config:
      project_key: PROJ
  spec:
    type: confluence
    config:
      space_key: TEAM
  comms:
    type: slack
```

Rules:
- Only include `git:` or `jj:` — not both — based on `DETECTED_VCS`
- Only include provider sections for providers the user confirmed
- Preserve any `instructions:` fields from existing settings
- Preserve any fields not covered by this wizard (e.g., custom `config` keys)
- Output must validate against `plugin/schemas/settings.schema.json`

3. Write the file using the `Write` tool to `.ai-dlc/settings.yml`.

4. Commit the settings file immediately:
   ```bash
   git add .ai-dlc/settings.yml && git commit -m "ai-dlc: configure project settings"
   ```

---

## Phase 7: Confirmation

Display a final summary:

```
## Setup Complete

| Setting | Value |
|---------|-------|
| VCS | git |
| Default Branch | main |
| Change Strategy | unit |
| Auto-merge | yes |
| Ticketing | jira (PROJ) |
| Spec | confluence (TEAM) |
| Design | — |
| Comms | slack |

Settings written to `.ai-dlc/settings.yml`.
```

If any provider override files were created in Phase 4b, list them:

```
Provider instruction overrides (edit to customize):
- `.ai-dlc/providers/jira.md`
- `.ai-dlc/providers/confluence.md`
```

Finish with:

```
Next: Run `/elaborate` to start your first intent.
```
