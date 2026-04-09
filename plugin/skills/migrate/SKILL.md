---
name: migrate
description: Migrate legacy AI-DLC intents to H·AI·K·U format
---

# Migrate

Convert legacy `.ai-dlc/` intents to `.haiku/` format.

1. Scan `.ai-dlc/` for intents. If a specific slug is given, migrate that one. Otherwise list and ask.
2. Run `haiku migrate <slug>` to perform the migration.
3. After migration, suggest `/haiku:resume <slug>` to continue execution.
