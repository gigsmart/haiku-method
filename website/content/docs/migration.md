---
title: Migration Guide
description: Migrating from AI-DLC to H·AI·K·U — terminology, commands, paths, and concepts
order: 35
---

This guide covers migrating from AI-DLC to H·AI·K·U. Most migration is automatic, but some manual steps may be needed for CI scripts, team documentation, and custom configurations.

## Terminology Map

| AI-DLC Term | H·AI·K·U Term | Notes |
|-------------|---------------|-------|
| AI-DLC | H·AI·K·U | The methodology and plugin name |
| Workflow | Studio | Named lifecycle templates (default, adversarial, etc. → software, ideation, custom) |
| Pass | Stage | Typed disciplinary phases (design, product, dev → inception, design, product, development, etc.) |
| Standalone hats | Stage-scoped hats | Hats are now per-stage files in `stages/{stage}/hats/{hat}.md` |
| `.ai-dlc/` | `.haiku/` | Project directory |
| `/ai-dlc:*` | `/haiku:*` | Command prefix |

**Unchanged concepts:** Intent, Unit, Bolt, Completion Criteria, Backpressure, Operating Modes (HITL/OHOTL/AHOTL), Quality Gates, Providers.

## Command Map

| Old Command | New Command |
|-------------|-------------|
| `/ai-dlc:elaborate` | `/haiku:start` + `/haiku:resume` |
| `/ai-dlc:execute` | `/haiku:resume` |
| `/ai-dlc:review` | `/haiku:review` |
| `/ai-dlc:autopilot` | `/haiku:autopilot` |
| `/ai-dlc:quick` | `/haiku:quick` |
| `/ai-dlc:operate` | `/haiku:operate` |
| `/ai-dlc:resume` | `/haiku:resume` |
| `/ai-dlc:reset` | `/haiku:reset` |
| `/ai-dlc:refine` | `/haiku:refine` |
| `/ai-dlc:followup` | `/haiku:followup` |
| `/ai-dlc:compound` | `/haiku:compound` |
| `/ai-dlc:adopt` | `/haiku:adopt` |
| `/ai-dlc:reflect` | `/haiku:reflect` |
| `/ai-dlc:setup` | `.haiku/settings.yml` (direct edit) |

## Directory Map

| Old Path | New Path |
|----------|----------|
| `.ai-dlc/` | `.haiku/` |
| `.ai-dlc/settings.yml` | `.haiku/settings.yml` |
| `.ai-dlc/providers/` | `.haiku/providers/` |
| `.ai-dlc/knowledge/` | `.haiku/knowledge/` |
| `.ai-dlc/{intent}/` | `.haiku/intents/{intent}/` |
| `.ai-dlc/{intent}/operations/` | `.haiku/intents/{intent}/operations/` |
| `.ai-dlc/workflows.yml` | `.haiku/studios/` (directory with STUDIO.md files) |
| `.ai-dlc/passes/{name}.md` | `.haiku/studios/{studio}/stages/{name}/STAGE.md` |

## Concept Map

### Workflows → Studios

AI-DLC's named workflows (default, adversarial, design, hypothesis, TDD) defined hat sequences. H·AI·K·U replaces these with **studios** — lifecycle templates that define stages, each with their own per-stage hat files.

| Old Workflow | New Approach |
|-------------|--------------|
| `default` | Software studio, development stage (planner → builder → reviewer) |
| `adversarial` | Software studio, security stage (threat-modeler → red-team → blue-team → security-reviewer) |
| `design` | Software studio, design stage (designer → design-reviewer) |
| `hypothesis` | Not a separate workflow; use the ideation studio or define a custom stage |
| `tdd` | A custom stage or configuration within the development stage |

### Passes → Stages

AI-DLC's passes (design, product, dev) were typed iterations through the full loop. H·AI·K·U replaces these with **stages** — discrete phases that each define their own hats, review mode, and completion signals.

The multi-pass configuration:
```yaml
# Old: .ai-dlc intent frontmatter
passes: [design, product, dev]
active_pass: "design"
```

Becomes stage configuration in the studio:
```yaml
# New: STUDIO.md
stages: [inception, design, product, development, operations, security]
```

### Custom Workflows → Custom Studios

```yaml
# Old: .ai-dlc/workflows.yml
research-first:
  hats: [researcher, planner, builder, reviewer]
```

Becomes a custom studio with stages:
```
# New: .haiku/studios/research-first/STUDIO.md
# with stages defined in .haiku/studios/research-first/stages/
```

## Automatic Migration

On first load, H·AI·K·U automatically migrates project configuration:

1. **Settings** — `.ai-dlc/settings.yml` is copied to `.haiku/settings.yml`
2. **Providers** — `.ai-dlc/providers/` is copied to `.haiku/providers/`
3. **Knowledge** — `.ai-dlc/knowledge/` is copied to `.haiku/knowledge/`
4. **Backward-compat symlinks** — Old paths get symlinks pointing to the new locations

All migrations are **idempotent** — re-running is a no-op if the new path already exists.

**Note:** Intent directory migration (`.ai-dlc/{intent}/` → `.haiku/intents/{intent}/`) is handled separately and may require manual intervention for in-progress intents.

## Manual Steps

### Update .gitignore

If you have `.ai-dlc/` in your `.gitignore`, add `.haiku/`:

```gitignore
# H·AI·K·U artifacts
.haiku/

# Legacy (can be removed after full migration)
.ai-dlc/
```

### Update CI Scripts

Search your CI configuration for references to `.ai-dlc/` and update:

```bash
# Find references
grep -r '\.ai-dlc' .github/ Makefile Dockerfile
grep -r 'ai-dlc' .github/ Makefile Dockerfile
```

### Update Team Documentation

Search team docs, READMEs, and wikis for:
- `AI-DLC` → `H·AI·K·U`
- `/ai-dlc:` → `/haiku:`
- `.ai-dlc/` → `.haiku/`

### Remove Backward-Compat Symlinks

After confirming everything works with the new paths, you can remove the symlinks:

```bash
# Only after verifying the migration is complete
rm -f .ai-dlc/settings.yml  # if it's a symlink
rm -rf .ai-dlc/providers     # if it's a symlink
rm -rf .ai-dlc/knowledge     # if it's a symlink
```

## Existing Intents

Intents that were in progress during the migration continue to work:

- **Completed intents** — No action needed. Artifacts remain in `.ai-dlc/` as historical records.
- **In-progress intents** — Continue using `/haiku:resume` which reads from both old and new paths.
- **New intents** — Created in `.haiku/intents/` using the new studio/stage model.

## Breaking Changes

1. **Standalone hat files** — `plugin/hats/*.md` are no longer the primary hat definitions. Hats are now defined as files in `stages/{stage}/hats/`.
2. **Workflow selection during elaboration** — Replaced by studio selection during `/haiku:start`.
3. **`/ai-dlc:elaborate`** — Deprecated. Use `/haiku:start` to create intents, then `/haiku:resume` to execute stages.
4. **Pass-specific workflow constraints** — Replaced by stage-level hat definitions.
5. **Custom workflow files** (`.ai-dlc/workflows.yml`) — Replaced by custom studio directories.

## Next Steps

- [Getting Started](/docs/getting-started/) — Tutorial with the new commands
- [Studios](/docs/studios/) — Understanding lifecycle templates
- [Stages](/docs/stages/) — The stage-based model
- [CLI Reference](/docs/cli-reference/) — Complete command reference
