---
description: (Internal) Full collaborative single-stage elaboration — all disciplines, one session
user-invocable: false
---

# Elaborate: Single-Stage Mode

Orchestrates the full collaborative elaboration where all disciplines contribute in one session. This is the default mode when no multi-stage configuration is active.

**This sub-skill runs inline** — it has full access to `AskUserQuestion`, `Agent`, and all tools from the parent skill.

---

## Inputs (from dispatcher)

The dispatcher (elaborate/SKILL.md) sets these before routing here:

- `INTENT_SLUG` — the intent slug
- `PROJECT_MATURITY` — `greenfield`, `early`, or `established`
- `AUTONOMOUS_MODE` — `true` or `false`
- `ITERATES_ON` — previous intent slug if this is a follow-up, empty otherwise
- `INTENT_DESCRIPTION` — the user's description from Phase 1
- `CLARIFICATION_ANSWERS` — Q&A from Phase 2

---

## Phase 2.25: Intent Worktree & Discovery Initialization

Before beginning technical exploration, create the intent worktree and initialize the discovery scratchpad inside it. Creating the worktree early ensures **no artifacts are left on `main`**.

**CRITICAL — Step 1: Gitignore worktrees directory (MUST run before creating any worktree)**

```bash
REPO_ROOT=$(git worktree list --porcelain | head -1 | sed 's/^worktree //')
mkdir -p "${REPO_ROOT}/.haiku/worktrees"
if ! grep -q '\.haiku/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo '.haiku/worktrees/' >> "${REPO_ROOT}/.gitignore"
  git add "${REPO_ROOT}/.gitignore"
  git commit -m "chore: gitignore .haiku/worktrees"
fi
```

**Step 2: Create the intent worktree**

```bash
INTENT_BRANCH="haiku/${INTENT_SLUG}/main"
INTENT_WORKTREE="${REPO_ROOT}/.haiku/worktrees/${INTENT_SLUG}"

if ! grep -q '\.haiku/worktrees/' "${REPO_ROOT}/.gitignore" 2>/dev/null; then
  echo "ERROR: .haiku/worktrees/ is not in .gitignore. Run Step 1 first." >&2
  exit 1
fi

# Config is now read via MCP tools or settings file directly
# Resolve default branch directly (no shell lib needed)
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || echo "main")
git worktree add -B "$INTENT_BRANCH" "$INTENT_WORKTREE" "$DEFAULT_BRANCH"
cd "$INTENT_WORKTREE"
```

**Tell the user the worktree location.**

**Step 3: Initialize discovery scratchpad**

```bash
DISCOVERY_DIR=".haiku/intents/${INTENT_SLUG}"
DISCOVERY_FILE="${DISCOVERY_DIR}/discovery.md"

mkdir -p "$DISCOVERY_DIR"
mkdir -p "$DISCOVERY_DIR/.briefs"

cat > "$DISCOVERY_FILE" << 'DISCOVERY_EOF'
---
intent: {intent-slug}
created: {ISO date}
status: active
---

# Discovery Log: {Intent Title}

Elaboration findings persisted during domain discovery.
Builders: read section headers for an overview, then dive into specific sections as needed.

DISCOVERY_EOF

git add .haiku/intents/${INTENT_SLUG}/discovery.md
git commit -m "elaborate(${INTENT_SLUG}): initialize discovery log"
```

---

## Phase 2.3: Knowledge Bootstrap

Check whether knowledge artifacts already exist. If this is the first elaboration in a project with code, synthesize knowledge from the existing codebase.

```bash
# Config is now read via MCP tools or settings file directly
# Knowledge operations now use MCP tools: haiku_knowledge_list, haiku_knowledge_read
# Detect project maturity by checking for existing code (no shell lib needed)
PROJECT_MATURITY=$([ -f "package.json" ] || [ -f "Cargo.toml" ] || [ -f "go.mod" ] && echo "established" || echo "greenfield")
# Check design knowledge via MCP
HAS_DESIGN_KNOWLEDGE=$(haiku_knowledge_read { type: "design" } 2>/dev/null && echo "true" || echo "false")
KNOWLEDGE_COUNT=$(haiku_knowledge_list 2>/dev/null | wc -l | tr -d ' ')
```

**If `PROJECT_MATURITY` is `greenfield` AND `KNOWLEDGE_COUNT` is 0:** Write scaffold knowledge artifacts inline (empty sections with `confidence: low`).

**If `PROJECT_MATURITY` is `early` or `established` AND `KNOWLEDGE_COUNT` is 0:** Write the knowledge synthesis brief and invoke the knowledge-synthesize subagent:

```
Agent({
  subagent_type: "general-purpose",
  description: "knowledge-synthesize: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/knowledge-synthesize/SKILL.md first, then execute it with the brief file at .haiku/intents/{INTENT_SLUG}/.briefs/knowledge-synthesize.md as input."
})
```

**If `KNOWLEDGE_COUNT` > 0:** Skip — knowledge artifacts already exist.

---

## Phase 2.5: Domain Discovery (Delegated)

**This phase is mandatory.** Write the discovery brief and invoke the discover subagent:

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-discover: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/discover/SKILL.md first, then execute it with the brief file at .haiku/intents/{INTENT_SLUG}/.briefs/elaborate-discover.md as input."
})
```

> **Iteration intents:** Include previous intent's discovery.md content in the brief. Focus on new/changed areas.

After completion, read results from `.haiku/intents/${INTENT_SLUG}/.briefs/elaborate-discover-results.md`.

**Present Domain Model to User** — display entities, relationships, data sources, data gaps. Use visual review if available, otherwise `AskUserQuestion`. Do NOT proceed until user confirms accuracy.

**Post-Discovery: Monitoring Approach Confirmation** — only if discovery found monitoring patterns and the intent has a deployment surface.

---

## Phase 2.75: Design Direction

**Read and follow** `subskills/design-direction/SKILL.md`.

Set inputs: `INTENT_SLUG`, `PROJECT_MATURITY`, `AUTONOMOUS_MODE`.

---

## Phase 3: Workflow Selection

**Read and follow** `subskills/workflow-select/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `STAGE_CONSTRAINT=""` (no constraint in single-stage).

---

## Phase 4: Success Criteria

**Read and follow** `subskills/criteria/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `CRITERIA_FOCUS=""` (all types in single-stage).

---

## Phase 5: Decompose

**Read and follow** `subskills/decompose/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `DOMAIN_MODEL`, `SUCCESS_CRITERIA`, `SELECTED_WORKFLOW`, `UNIT_TYPES=""` (all types in single-stage), `PRIOR_UNITS=""`, `ITERATES_ON`.

---

## Phase 5.8: Git Strategy

**Read and follow** `subskills/git-strategy/SKILL.md`.

Set inputs: `INTENT_SLUG`, `AUTONOMOUS_MODE`, `UNITS`.

---

## Phase 5.9: Completion Announcements

Read the default announcements from project settings — **do NOT ask the user**.

```bash
# Read default announcements from settings via MCP
DEFAULT_ANNOUNCEMENTS=$(haiku_settings_get { field: "default_announcements" } || echo "")
if [ -z "$DEFAULT_ANNOUNCEMENTS" ]; then
  DEFAULT_ANNOUNCEMENTS='["changelog"]'
fi
```

---

## Phase 5.95: Iteration Stages

In single-stage mode, this phase is simple: set `stages: []` and `active_stage: ""` in the intent frontmatter. Do not ask the user.

---

## Phase 6: Write H·AI·K·U Artifacts

### 1. Verify intent worktree

```bash
CURRENT_BRANCH=$(git branch --show-current)
EXPECTED_BRANCH="haiku/${INTENT_SLUG}/main"
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "ERROR: Expected to be on branch $EXPECTED_BRANCH but on $CURRENT_BRANCH"
  exit 1
fi
```

### 2. Write `intent.md`

Write the intent file with all gathered data: workflow, git strategy, announcements, stages (empty), criteria, domain model, problem/solution. Include `quality_gates` from discovery.

Commit immediately:
```bash
git add .haiku/intents/${INTENT_SLUG}/intent.md
git commit -m "elaborate(${INTENT_SLUG}): define intent"
```

### 2.5. Confirm Quality Gates

Read quality gate candidates from `discovery.md`. Present to user and confirm. Update intent.md frontmatter with confirmed gates.

### 3. Write and review each unit

**Process each unit one at a time.** Write the file, present for review, iterate until approved, then move to the next.

Use the standard unit template for most disciplines. Use the design unit template for `discipline: design`.

> **Stage tagging:** In single-stage mode, leave `stage:` as `""` on all units.

For each unit (in dependency order):
- **Step A** — Write the unit file and commit the draft
- **Step A.1** — Validate criteria categories by discipline
- **Step B** — Present the full unit for review (every line, no truncation)
- **Step C** — Open wireframe in browser if frontend/design unit
- **Step D** — Ask for approval (visual review or AskUserQuestion)
  - Approved → next unit
  - Needs changes → revise, commit with reasoning, re-present
  - Rethink → discuss, rewrite, re-present

### 5. Commit remaining artifacts

```bash
git add .haiku/
git diff --cached --quiet || git commit -m "elaborate(${INTENT_SLUG}): finalize elaboration artifacts"
```

---

## Phase 6.25: Generate Wireframes (Delegated)

**Skip if no units have `discipline: frontend` or `discipline: design`.**

Write the wireframes brief. In single-stage mode, wireframes are **HIGH fidelity** (Mode A — styled, interaction states, responsive breakpoints). This is the designer's only shot — no design stage refines these later.

Set `fidelity: high` in the wireframes brief frontmatter.

Invoke the wireframes subagent:

```
Agent({
  subagent_type: "general-purpose",
  description: "elaborate-wireframes: {INTENT_SLUG}",
  prompt: "Read the skill definition at plugin/skills/elaborate/subskills/wireframes/SKILL.md first, then execute it with the brief file at .haiku/intents/{INTENT_SLUG}/.briefs/elaborate-wireframes.md as input."
})
```

After completion, run the product review gate (visual review or AskUserQuestion).

---

## Phase 6.5 + 6.75: Sync to Ticketing Provider (Delegated)

Load ticketing config. If configured, write the ticket sync brief and invoke the ticket-sync subagent.

---

## Phase 7 + 7.5: Spec Review & Adversarial Review

Run automated spec review (inline subagent), then adversarial review (forked subagent via `subskills/adversarial-review/SKILL.md`). Auto-apply high-confidence fixes, present remaining findings to user.

---

## Phase 8: Handoff

Present the elaboration summary and ask how to proceed:
- **Execute** — start the autonomous build loop
- **Open PR for review** — push branch and create spec review PR

(Cowork mode offers Push + PR or Download as zip.)
