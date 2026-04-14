# unit-03 Implementation Notes

## Files created

- `plugin/skills/archive/SKILL.md` — thin wrapper skill delegating to `haiku_intent_archive`.
- `plugin/skills/unarchive/SKILL.md` — thin wrapper skill delegating to `haiku_intent_unarchive`.

## Pattern followed

Both skills are direct structural clones of `plugin/skills/reset/SKILL.md`:

- Frontmatter contains exactly two fields: `name` and `description`.
- Body is a short numbered list (3 steps) with no embedded behavioral logic.
- Slug handling: if an argument is provided, call the tool directly; otherwise list intents (archived-only for unarchive) and ask the user in plain prose — matching the reset/pickup pattern, not `AskUserQuestion`.
- No wiring in `plugin/.claude-plugin/plugin.json`, no hooks, no TypeScript edits — skills auto-discover from `plugin/skills/{name}/SKILL.md`.

## Tool dependencies

Both skills delegate to MCP tools shipped in unit-02:
- `haiku_intent_archive`
- `haiku_intent_unarchive`
- `haiku_intent_list` (already shipped; unarchive uses `include_archived: true` filtered to archived entries)

## Tests

No new tests — skills are thin redirects with no logic to unit-test. The underlying tools are covered by the unit-02 handler tests.
