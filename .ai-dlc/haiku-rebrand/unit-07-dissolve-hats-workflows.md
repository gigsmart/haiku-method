---
status: completed
last_updated: "2026-04-03T02:50:41Z"
depends_on: [unit-01-lib-hooks-rename, unit-05-stage-definitions, unit-06-stage-orchestrator]
branch: ai-dlc/haiku-rebrand/07-dissolve-hats-workflows
discipline: backend
stage: ""
workflow: ""
ticket: ""
hat: reviewer
---

# unit-07-dissolve-hats-workflows

## Description

Remove the `plugin/hats/` directory and `plugin/workflows.yml` file. Hat instructions now live as files in each stage's `hats/` directory (e.g., `stages/development/hats/builder.md`). Workflow definitions are replaced by the stage's `hats:` field (the hat sequence IS the workflow). Update all context injection hooks and skills that reference the old hat or workflow system.

## Discipline

backend - File deletion, hook rewiring, and skill reference updates.

## Domain Entities

### Files to Delete

- `plugin/hats/builder.md`
- `plugin/hats/reviewer.md`
- `plugin/hats/planner.md`
- `plugin/hats/designer.md`
- `plugin/hats/product-owner.md` (if exists)
- Any other `.md` files in `plugin/hats/`
- `plugin/workflows.yml`

### Files to Modify

- `plugin/hooks/inject-context.sh` — hat context injection
- `plugin/hooks/subagent-context.sh` — subagent hat context
- `plugin/lib/hat.sh` — hat resolution logic
- Any skill SKILL.md that references `plugin/hats/` or `plugin/workflows.yml`

## Technical Specification

### What Dissolves

The current system has:

1. **`plugin/hats/*.md`** — standalone hat definition files read by inject-context.sh and subagent-context.sh to inject role-specific guidance into the agent context
2. **`plugin/workflows.yml`** — defines named workflows as ordered hat sequences (e.g., `default: [planner, builder, reviewer]`, `design: [designer, builder, reviewer]`)
3. **Hat resolution in `plugin/lib/hat.sh`** — resolves hat names to file paths

All three are replaced by the stage system:

| Old System | New System |
|-----------|-----------|
| `plugin/hats/builder.md` | `stages/development/hats/builder.md` |
| `plugin/hats/reviewer.md` | `stages/development/hats/reviewer.md` |
| `plugin/hats/designer.md` | `stages/design/hats/designer.md` |
| `plugin/workflows.yml` workflow sequences | `STAGE.md` frontmatter `hats:` field |
| `hat.sh` `resolve_hat()` | `stage.sh` `hku_resolve_stage()` + read hat files from `hats/` dir |

### Hook Updates

#### `inject-context.sh`

Currently reads the active hat from state and injects `plugin/hats/{hat}.md` content into the agent context. Update to:

1. Read the active stage from intent frontmatter (`active_stage:`)
2. Resolve the stage directory
3. Read the hat file from `stages/{stage}/hats/{hat}.md`
4. Inject that file's content as hat context

```bash
# Before:
hat_file="${CLAUDE_PLUGIN_ROOT}/hats/${active_hat}.md"
if [[ -f "$hat_file" ]]; then
  cat "$hat_file"
fi

# After:
stage_dir=$(hku_resolve_stage_dir "$active_stage" "$studio")
hat_file="${stage_dir}/hats/${active_hat}.md"
if [[ -f "$hat_file" ]]; then
  cat "$hat_file"
fi
```

Hat resolution reads the file directly from the `hats/` directory -- no markdown parsing needed.

#### `subagent-context.sh`

Same pattern — replace hat file reads with stage-scoped hat file reads. Subagents get the same hat context as the main agent.

### Hat Library Update (`plugin/lib/hat.sh`)

Replace `resolve_hat()` (or equivalent) with:

```bash
# Resolve hat instructions from the active stage.
# Falls back to the ideation studio's "research" stage for projects with no
# stage configured (legacy projects before migration). This ensures the
# backwards-compat guarantee holds: agents always have hat context even
# on unmigrated projects — it just comes from ideation/research defaults.
hku_resolve_hat_instructions() {
  local hat_name="$1"
  local stage_name="${2:-}"
  local studio_name="${3:-ideation}"
  local stage_file

  # Primary: resolve from the active stage if one is configured
  if [[ -n "$stage_name" ]]; then
    stage_file=$(hku_resolve_stage "$stage_name" "$studio_name")
  fi

  # Fallback: if no stage is configured (legacy project with no settings file),
  # use the ideation studio's "research" stage for general-purpose hat context.
  if [[ -z "$stage_file" || ! -f "$stage_file" ]]; then
    stage_file=$(hku_resolve_stage "research" "ideation")
  fi

  cat "${stage_dir}/hats/${hat_name}.md"
}

# Get the hat sequence for a stage (replaces workflow lookup)
hku_get_hat_sequence() {
  local stage_name="$1"
  local studio_name="$2"
  # Read hats: field from STAGE.md frontmatter
  # Returns: space-separated hat names in order
}
```

### Workflow References

Remove all references to `plugin/workflows.yml` and the workflow selection mechanism:

- Skills that reference `available_workflows` or `default_workflow` — these are now implicit in the stage's `hats:` field
- The workflow selection sub-skill (`plugin/skills/elaborate/subskills/workflow-select/`) — remove or deprecate
- Any `workflow:` field in unit frontmatter — can be kept for backward compat but is no longer primary

### Skills to Update

Grep for skills that reference hats or workflows:

| Skill | Reference | Update |
|-------|-----------|--------|
| `execute/SKILL.md` | References hat files, workflow sequence | Use stage hat sequence instead |
| `elaborate/SKILL.md` | References workflow selection | Remove workflow selection, use stage `hats:` |
| `review/SKILL.md` | May reference reviewer hat | Use stage's reviewer hat section |
| `advance/SKILL.md` | Hat transition logic | Transition within stage's hat sequence |
| `resume/SKILL.md` | Resume at a specific hat | Resume within stage's hat sequence |

### Backward Compatibility

- If a project has `.haiku/hats/` custom hat files (project-level overrides), check for those as a fallback before reading from STAGE.md. This preserves the ability to customize hat behavior.
- The `workflow:` field in unit frontmatter remains accepted but is ignored — the stage determines the hat sequence.
- **Legacy projects (no `.haiku/settings.yml`)**: `hku_resolve_hat_instructions` falls back to the ideation studio's `research` stage when no active stage is configured. This means agents on unmigrated projects still have hat context — it comes from general-purpose ideation defaults rather than software-specific hat files. The `architecture-spec.md` backwards-compat guarantee (elaboration/execution flows unchanged) is upheld because the agent context is equivalent to before: a general-purpose builder/reviewer posture.

### Deletion Verification

After removing `plugin/hats/` and `plugin/workflows.yml`:

```bash
# These directories/files should not exist:
ls plugin/hats/          # Should fail: No such file or directory
ls plugin/workflows.yml  # Should fail: No such file or directory

# No remaining references to deleted paths:
grep -r 'plugin/hats/' plugin/ --include='*.sh' --include='*.md'      # 0 results
grep -r 'workflows\.yml' plugin/ --include='*.sh' --include='*.md'    # 0 results
grep -r 'available_workflows' plugin/ --include='*.md'                 # 0 results (or only in STAGE.md if kept)
```

## Success Criteria

- [ ] `plugin/hats/` directory deleted (all `.md` files removed)
- [ ] `plugin/workflows.yml` deleted
- [ ] `inject-context.sh` reads hat instructions from active stage's `hats/` directory
- [ ] `subagent-context.sh` reads hat instructions from active stage's `hats/` directory
- [ ] Hat files are read directly from `stages/{stage}/hats/{hat}.md`
- [ ] `hku_get_hat_sequence` function exists and reads from STAGE.md frontmatter
- [ ] No remaining references to `plugin/hats/` in any hook or skill file
- [ ] No remaining references to `plugin/workflows.yml` in any file
- [ ] Workflow selection sub-skill removed or deprecated
- [ ] Hat transitions in execute/advance skills use stage hat sequence
- [ ] Backward compat: `.haiku/hats/` project-level overrides still checked as fallback
- [ ] `hku_resolve_hat_instructions` falls back to ideation studio `research` stage when no active stage is configured (legacy projects without `.haiku/settings.yml` always have hat context)

## Risks

- **Lost hat content**: The existing `plugin/hats/*.md` files contain battle-tested guidance that must be preserved in stage STAGE.md files. Mitigation: unit-05 adapts this content into stages BEFORE this unit deletes the files. Verify content parity before deletion.
- **Orphan references**: Some skill or hook may reference hats in a non-obvious way (e.g., string interpolation). Mitigation: comprehensive grep sweep including generated/interpolated patterns.
- **Subagent context**: Subagents have their own context injection path. Mitigation: update both inject-context.sh and subagent-context.sh in lockstep.

## Boundaries

This unit removes old hat/workflow infrastructure and rewires context injection. It does NOT create stage definitions (unit-05), build the orchestrator (unit-06), or touch persistence (unit-08). It assumes stage STAGE.md files with hat sections already exist.
