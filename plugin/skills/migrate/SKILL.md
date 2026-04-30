---
name: migrate
description: Migrate legacy AI-DLC intents to H·AI·K·U format
---

# Migrate

Convert legacy `.ai-dlc/` intents to `.haiku/` format.

**Never apply a migration without showing a dry-run first.** Bare `haiku migrate` is rejected by the binary, but the rule still holds when you pass `--all` or a specific slug: dry-run, get the user's OK, then apply.

## Steps

1. List candidates: `ls .ai-dlc/`. If the user named a slug, use that. Otherwise show the list and ask which one(s).
2. **Dry-run**: `haiku migrate <slug>` (dry-run is the default). Show the user the output — what would be written, where, how many files.
3. **Get explicit approval** from the user before applying. Don't infer consent from prior context.
4. **Apply**: `haiku migrate <slug> --apply`. One slug at a time unless the user explicitly approved `--all`.
5. After migration, suggest `/haiku:pickup <slug>` to continue execution.

## Flags

- `--apply` — actually write. Default is dry-run.
- `--all` — migrate every intent in `.ai-dlc/`. Pair with `--apply` to commit.
- `--force` — re-migrate intents that already exist under `.haiku/`. Use sparingly.
- `--allow-dirty` — skip the git-clean precheck. Don't pass this without user approval; a dirty tree means the migration output gets tangled with unrelated in-progress work.

## Why these rules exist

Bare `haiku migrate --apply` rewrites every intent in `.ai-dlc/` at once. In a monorepo, one such commit shows up in every open MR. The dry-run-then-confirm flow exists so this can't happen by accident.
