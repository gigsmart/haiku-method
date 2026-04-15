---
title: 'Intent: Remove Han Keep Dependency & Improve Intent State Management'
studio: software
stages:
  - inception
  - design
  - product
  - development
  - operations
  - security
mode: continuous
active_stage: security
status: completed
started_at: 2026-03-14T18:25:47.000Z
completed_at: 2026-03-27T23:54:07.000Z
created_at: '2026-04-13T19:18:37.713Z'
---


# Intent: Remove Han Keep Dependency & Improve Intent State Management

## Problem Statement

AI-DLC currently has a **hard dependency on the `han` CLI** for two distinct capabilities:

### 1. `han keep` — Branch-scoped ephemeral key-value storage
Used across 32 files (hooks, skills, hats, docs) for persisting state that survives context resets but is scoped to a git branch. This is the **core state layer** of AI-DLC.

**What it does:** Stores key-value pairs scoped to a git branch. Under the hood, `han keep` uses git notes or a similar git-native mechanism to attach arbitrary data to branches without polluting the working tree.

**Current usage (155 references across 32 files):**
- `han keep save <key> <content>` — persist ephemeral state
- `han keep load <key> --quiet` — retrieve state
- `han keep delete <key>` — remove a key
- `han keep list` — list all keys
- `han keep clear --branch` — clear all state for a branch
- `han keep load --branch <branch> <key>` — cross-branch state access

**Keys managed:**
| Key | Scope | Purpose |
|-----|-------|---------|
| `iteration.json` | intent branch | Hat, iteration count, workflow, status, unitStates |
| `intent-slug` | intent branch | Pointer to current intent directory |
| `scratchpad.md` | unit branch | Progress notes and learnings from previous bolts |
| `blockers.md` | unit branch | Documented blockers |
| `current-plan.md` | unit branch | Planner's tactical output |
| `completion-criteria.md` | intent branch | Success criteria (also on filesystem) |
| `next-prompt.md` | unit branch | Continuation prompt for next iteration |
| `operation-status.json` | intent branch | Operation phase tracking |
| `reflection-status.json` | intent branch | Reflection phase tracking |
| `providers.json` | intent branch | Cached MCP provider discovery |

### 2. `han parse` — YAML/JSON parsing utility
Used across 13 files (107 occurrences) for parsing YAML frontmatter and manipulating JSON. This is a **utility dependency**, not a state dependency.

**Current usage:**
- `han parse yaml <field> -r` — extract YAML field
- `han parse yaml --json` — convert YAML to JSON
- `han parse yaml-to-json` — same
- `han parse yaml-set <field> <value>` — update YAML frontmatter in-place
- `han parse json <field> -r` — extract JSON field
- `han parse json-validate --schema <schema>` — validate JSON structure
- `han parse json-set <field> <value>` — update JSON field

---

## Analysis: Why Remove Han?

1. **External CLI dependency** — Users must install `han` before AI-DLC works. This is the only external runtime dependency beyond git itself.
2. **Opaque storage** — `han keep` stores data in a way that's invisible to standard git tools (not in working tree, not easily inspectable).
3. **Cross-branch complexity** — The `--branch` flag for accessing intent-level state from unit branches adds complexity and potential race conditions.
4. **Two concerns conflated** — `han keep` (state storage) and `han parse` (YAML/JSON parsing) are unrelated capabilities bundled in one tool.

---

## Proposed Replacement: File-Based State in `.ai-dlc/`

### Principle: State should be **visible, git-tracked, and inspectable**

Instead of opaque `han keep` storage, move all ephemeral state to files within the `.ai-dlc/` directory structure that are committed to git. This aligns with AI-DLC's existing pattern where `intent.md`, `unit-*.md`, and `completion-criteria.md` already live on the filesystem.

### New State Layout

```
.ai-dlc/{intent-slug}/
├── intent.md                    # (existing) Intent definition
├── unit-*.md                    # (existing) Unit specs
├── completion-criteria.md       # (existing) Success criteria
├── discovery.md                 # (existing) Elaboration findings
├── state/                       # NEW: ephemeral state directory
│   ├── iteration.json           # Was: han keep save iteration.json
│   ├── scratchpad.md            # Was: han keep save scratchpad.md
│   ├── blockers.md              # Was: han keep save blockers.md
│   ├── current-plan.md          # Was: han keep save current-plan.md
│   ├── next-prompt.md           # Was: han keep save next-prompt.md
│   ├── operation-status.json    # Was: han keep save operation-status.json
│   ├── reflection-status.json   # Was: han keep save reflection-status.json
│   └── providers.json           # Was: han keep save providers.json
├── operations.md                # (existing) Operational plan
└── reflection.md                # (existing) Reflection artifacts
```

### Key Design Decisions

**1. Intent-scoped vs. unit-scoped state**

Currently, `han keep` scopes state to the **git branch** you're on. Unit branches get unit-scoped state, intent branches get intent-scoped state. This is implicit and requires `--branch` for cross-scope access.

**Proposed:** Make scoping **explicit via directory structure**:
- Intent-scoped state: `.ai-dlc/{intent-slug}/state/`
- Unit-scoped state: `.ai-dlc/{intent-slug}/units/{unit-slug}/state/`

This eliminates the need for `--branch` cross-access since all state is in the working tree and accessible from any branch.

**2. State committed to git**

Since state files are in the working tree, they get committed with normal `git add && git commit`. This means:
- State is visible in `git diff` and `git log`
- State survives branch switches
- State is inspectable with any text editor
- No special tooling needed to read/write state
- State merge conflicts are possible but manageable (JSON/MD files)

**3. `han parse` replacement — `jq` + `yq` (Go)**

Replace all `han parse` commands with:
- **JSON read/write:** `jq` (already used in `config.sh`)
- **YAML read/write:** `yq` (mikefarah/yq, Go version)
- **Frontmatter read/write:** `yq --front-matter=extract` / `yq --front-matter=process` — directly replaces `han parse yaml-set` for `unit-*.md` and `intent.md` files
- **YAML-to-JSON:** `yq -o=json`

### Dependency Management: `jq` and `yq` (Go)

The `han` CLI bundled both parsing utilities and state storage in one tool. Replacing it means the plugin now depends on two standard CLI tools:

- **`jq`** (v1.7+) — JSON parsing and manipulation
- **`yq`** (mikefarah/yq, Go version, v4+) — YAML parsing with native `--front-matter` support

**Why Go `yq` specifically:** The Go version (`mikefarah/yq`) has a `--front-matter` flag that can extract/modify YAML frontmatter from markdown files directly — exactly what `han parse yaml-set` did for `unit-*.md` and `intent.md` files. The Python `yq` (kislyuk/yq) is just a jq wrapper and lacks this.

**Install check at plugin load time (SessionStart hook):**

Create `plugin/lib/deps.sh` sourced by `inject-context.sh` (and other hooks). Each hook calls `dlc_check_deps` early — replacing the current `command -v han` check.

On failure: **`exit 2` with install instructions on stderr**. In Claude Code hooks, `exit 0` means stdout gets injected as context; `exit 2` means stdout is discarded and only stderr is shown to the user. This is the correct way to signal a missing dependency without polluting Claude's context.

```bash
dlc_check_deps() {
  local missing=()
  command -v jq &>/dev/null || missing+=("jq")

  if command -v yq &>/dev/null; then
    if ! yq --version 2>&1 | grep -q "mikefarah"; then
      echo "AI-DLC requires mikefarah/yq (Go), but kislyuk/yq (Python) is installed." >&2
      echo "Install: https://github.com/mikefarah/yq#install" >&2
      exit 2
    fi
  else
    missing+=("yq")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo "AI-DLC requires: ${missing[*]}" >&2
    echo "Install with:" >&2
    echo "  brew install ${missing[*]}          # macOS" >&2
    echo "  sudo snap install ${missing[*]}     # Ubuntu/Debian" >&2
    echo "  go install github.com/mikefarah/yq/v4@latest  # Go (yq only)" >&2
    exit 2
  fi
}
```

This replaces the implicit `han` dependency with explicit, well-known tools that most developers already have.

### State Management Helper Library

Create a new `plugin/lib/state.sh` that provides a clean API matching the current `han keep` interface but using files:

```bash
# Save state (writes file)
dlc_state_save <key> <content> [--scope intent|unit] [--unit <unit-slug>]

# Load state (reads file)
dlc_state_load <key> [--scope intent|unit] [--unit <unit-slug>]

# Delete state (removes file)
dlc_state_delete <key> [--scope intent|unit] [--unit <unit-slug>]

# List state keys
dlc_state_list [--scope intent|unit] [--unit <unit-slug>]

# Clear all state
dlc_state_clear [--scope intent|unit] [--unit <unit-slug>]
```

### Parse Helper Library

Create `plugin/lib/parse.sh` replacing all `han parse` commands:

```bash
# JSON operations (thin wrappers around jq)
dlc_json_get <field> [-r]           # → jq -r '.<field>'
dlc_json_set <field> <value>        # → jq '.<field> = <value>'
dlc_json_validate [--schema <s>]    # → jq validation

# YAML operations (using yq Go)
dlc_yaml_get <field> [-r]           # → yq '.<field>'
dlc_yaml_set <field> <value>        # → yq '.<field> = <value>' -i
dlc_yaml_to_json                    # → yq -o=json

# Frontmatter operations (yq's killer feature)
dlc_frontmatter_get <field> <file>  # → yq --front-matter=extract '.<field>' <file>
dlc_frontmatter_set <field> <val> <file>  # → yq --front-matter=process '.<field> = <val>' -i <file>
```

This directly replaces `han parse yaml-set` which is used in `dag.sh:update_unit_status` and several skills.

---

## Improvement Opportunities for Intent State Management

Beyond removing `han keep`, the migration presents an opportunity to improve how state flows through the system:

### 1. Single Source of Truth for Iteration State

**Current problem:** `iteration.json` stores `unitStates` as a nested object that duplicates status from `unit-*.md` frontmatter. Two sources of truth for unit status.

**Improvement:** Remove `unitStates` from `iteration.json`. The unit files already have `status` in frontmatter — the DAG library (`dag.sh`) already reads status from unit files, not from `iteration.json`. The `unitStates` field is redundant.

Simplified `iteration.json`:
```json
{
  "iteration": 3,
  "hat": "builder",
  "workflow": ["planner", "builder", "reviewer"],
  "workflowName": "default",
  "status": "active",
  "currentUnit": "unit-02-auth",
  "targetUnit": null,
  "phase": "execution",
  "maxIterations": 0,
  "needsAdvance": false
}
```

### 2. Explicit Phase State Machine

**Current problem:** The `phase` field was added as a migration (see `inject-context.sh:316-331`) and inferred from the current hat. There's no formal phase transition logic.

**Improvement:** Define a formal phase state machine:
```
elaboration → execution → [operation] → [reflection] → closed
                ↑                              |
                └──────────── iterate ─────────┘
```

Each transition should be explicit (e.g., `/execute` transitions from elaboration to execution, `/operate` transitions to operation, etc.).

### 3. Reduce State Parsing Overhead

**Current problem:** The `inject-context.sh` hook spawns 10+ subprocesses to parse iteration.json (one `han parse json` call per field). This is slow on session start.

**Improvement:** Parse iteration.json **once** using `jq` and extract all needed fields in a single call:
```bash
eval "$(echo "$ITERATION_JSON" | jq -r '@sh "
  ITERATION=\(.iteration // 1)
  HAT=\(.hat // "planner")
  STATUS=\(.status // "active")
  WORKFLOW_NAME=\(.workflowName // "default")
  PHASE=\(.phase // "execution")
"')"
```

### 4. State Validation

**Current problem:** State validation is minimal — just a basic JSON schema check on iteration.json. Invalid state can cause silent failures.

**Improvement:** Add validation on load:
- Required fields check for iteration.json
- Hat must exist in current workflow
- Phase must be valid enum
- currentUnit must reference an existing unit file
- Warn (don't crash) on validation failures

### 5. State Observability

**Current problem:** State is stored in opaque `han keep` storage, making debugging difficult. Users can't easily see what state exists or inspect it.

**Improvement:** Since state moves to files:
- `git diff .ai-dlc/*/state/` shows all state changes
- `cat .ai-dlc/{slug}/state/iteration.json | jq .` inspects current state
- State changes appear in commit diffs
- Add a `/status` skill that pretty-prints current state

---

## Success Criteria
- [ ] Zero references to `han keep`, `han parse`, or `han hook` remain in any plugin file
- [ ] `plugin/lib/deps.sh` exists and validates `jq` (v1.7+) and `yq` (mikefarah/Go v4+) at plugin load
- [ ] `plugin/lib/parse.sh` exists with JSON/YAML/frontmatter utility functions wrapping `jq` and `yq`
- [ ] `plugin/lib/state.sh` exists with file-based state management in `.ai-dlc/{slug}/state/`
- [ ] All hooks that used `han keep load/save` now read/write state files directly
- [ ] All hooks that used `han parse json/yaml` now use `jq`/`yq` via parse.sh
- [ ] `hooks.json` no longer references `han hook wrap-subagent-context`
- [ ] SessionStart hook runs `dlc_check_deps` and exits cleanly with install instructions if deps missing
- [ ] All existing plugin functionality works identically after migration

---

## Out of Scope

- Removing git as a dependency (git remains the foundation)
- Changing the DAG resolution logic (works well as-is)
- Changing workflow/hat definitions
- Website/UI changes beyond documentation
- jj VCS support (not implemented anyway)

## Risk Assessment

- **Low risk:** State files are a simpler, more transparent mechanism
- **Migration path:** Can keep `han keep` as optional fallback during transition
- **Testing:** Each unit can be validated independently since hooks/skills have clear boundaries
