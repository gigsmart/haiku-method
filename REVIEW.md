# Code Review Guidelines

## Validation (REQUIRED)

**Before approving any PR that modifies `plugin/`, `packages/haiku/`, or skill files:**

Read `plugin/VALIDATION.md` and verify the changed code against its criteria. Specifically:

1. **State integrity** — state writes go through MCP tools, lifecycle transitions auto-commit to git
2. **Orchestration** — `haiku_run_next` produces correct actions for the stage loop (elaborate → execute → review → gate)
3. **Quality enforcement** — `haiku_unit_advance_hat` (on last hat) rejects if criteria checkboxes are unchecked
4. **Hat isolation** — subagent context injects hat isolation directive; agents only receive their assigned hat's instructions
5. **Mode handling** — continuous auto-advances on `auto` gates; discrete always stops
6. **Composite intents** — sync points are checked; blocked stages are not returned as runnable

Trace any changed orchestration logic through the scenarios in VALIDATION.md.

## Cross-Component Sync

Three-component project: **plugin** (Claude Code plugin), **paper** (methodology spec), **website** (Next.js static site).

| Change Type | Check Paper | Check Plugin | Check Website |
|---|---|---|---|
| New skill | Mentioned in relevant section? | Primary source | CLI reference updated? |
| New studio/stage | Documented in Profiles section? | Primary source | Studios/stages docs updated? |
| New hat | Documented in relevant profile? | `stages/{stage}/hats/{hat}.md` exists? | Docs if user-facing? |
| New review agent | Quality Enforcement section? | `stages/{stage}/review-agents/{agent}.md` exists? | Docs if user-facing? |
| Terminology change | All references updated? | All references updated? | All references updated? |
| New provider category | Section 8 updated? | Provider instructions + schema? | providers.md updated? |

## Terminology Consistency

Flag any usage that confuses these distinct concepts:

| Term | Definition | NOT the same as |
|------|-----------|-----------------|
| **Studio** | Named lifecycle template (e.g., software, sales) | Stage |
| **Stage** | Lifecycle phase within a studio, with hats + review gate | Studio |
| **Unit** | Discrete piece of work with completion criteria | Bolt |
| **Bolt** | One iteration cycle through the hat sequence for a unit | Unit |
| **Hat** | Behavioral role scoped to a stage | Agent |
| **Review Agent** | Adversarial verification specialist per stage | Hat |

**Hierarchy:** Studio > Stage > Unit > Bolt

## Plugin-Specific

### Binary (`packages/haiku/` → `plugin/bin/haiku`)
- Source lives in `packages/haiku/` — only the compiled binary ships in `plugin/`
- The binary handles: MCP server, hooks, and migration
- Zero external runtime dependencies (no jq, yq, npm install)
- Build: `cd packages/haiku && npm run build` → `plugin/bin/haiku` (~485KB minified)

### Skills
- Must reference MCP tools (`haiku_run_next`, `haiku_unit_start`, etc.) — not shell functions
- The run skill follows `haiku_run_next` actions — no prose-based orchestration
- Skills must NOT reference `iteration.json`, `hku_state_load/save`, or `source parse.sh`

### Hooks
- All hooks are TypeScript in `packages/haiku/src/hooks/`
- Registered in `plugin/hooks/hooks.json` pointing to `bin/haiku hook <name>`
- No shell scripts for hooks
- Hooks read state from frontmatter + `state.json` — never from `iteration.json`

### State Model
- Intent state: `intent.md` frontmatter (`studio`, `stages`, `active_stage`, `status`, `started_at`, `completed_at`)
- Stage state: `stages/{stage}/state.json` (`phase`, `status`, `started_at`, `completed_at`, `gate_entered_at`, `gate_outcome`)
- Unit state: `unit-*.md` frontmatter (`bolt`, `hat`, `status`, `started_at`, `completed_at`)
- MCP tools are the primary state interface — hooks may read directly but should not write lifecycle state

### MCP Tools (21 total)
- 16 state/knowledge tools (`haiku_intent_*`, `haiku_stage_*`, `haiku_unit_*`, `haiku_knowledge_*`)
- 3 orchestrator tools (`haiku_run_next`, `haiku_intent_create`, `haiku_go_back`)
- 2 review/visual tools (`ask_user_visual_question`, `pick_design_direction`)

## Paper-Specific

- No time estimates anywhere
- 12 studios documented (engineering, go-to-market, general purpose)
- 4-step stage loop: elaborate, execute, adversarial review, gate
- 4 gate types: auto, ask, external, await
- Providers are bidirectional translation layers (6 categories)

## Website-Specific

- Next.js 15 App Router with static export (`trailingSlash: true`)
- `NEXT_PUBLIC_*` env vars must be passed to the build step in deploy workflows
- Studio/stage detail pages render from plugin source (dynamic at build time)
- Browse feature at `/browse/` — local filesystem + GitHub/GitLab API with OAuth

## Skip

- Version bump commits (`[skip ci]` in message)
- Auto-generated changelog entries
- `plugin/.claude-plugin/marketplace.json` version field (auto-synced)
