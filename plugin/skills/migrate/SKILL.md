---
name: migrate
description: Migrate legacy AI-DLC intents to H·AI·K·U format
---

# Migrate

Convert legacy `.ai-dlc/` intents to `.haiku/` format.

## Process

1. Scan `.ai-dlc/` for directories containing `intent.md`
2. If a specific intent is specified, migrate just that one. Otherwise, list available intents and ask.
3. Run `haiku migrate <slug>` to perform the migration
4. The migration:
   - Moves files from `.ai-dlc/{slug}/` to `.haiku/intents/{slug}/`
   - Transforms frontmatter (passes → stages, adds studio/mode metadata)
   - Maps units to stages based on their `pass:` field
   - Creates backward-compat symlink
   - Produces a MIGRATION-PLAN.md gap analysis
5. After migration, suggest `/haiku:resume <slug>` to continue execution
