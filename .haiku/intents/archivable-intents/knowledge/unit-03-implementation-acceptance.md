---
intent: archivable-intents
unit: unit-03-archive-skills
created: 2026-04-14
type: implementation-acceptance
---

# Unit 03 — Archive Skills: Implementation Acceptance Criteria

These are verified by the implementer / reviewer hats in the development stage.

## Files to create

- [ ] `plugin/skills/archive/SKILL.md` exists.
- [ ] `plugin/skills/unarchive/SKILL.md` exists.

## Frontmatter shape (both skills)

- [ ] Frontmatter has exactly two fields: `name` and `description`.
- [ ] `plugin/skills/archive/SKILL.md` has `name: archive` and a one-line description.
- [ ] `plugin/skills/unarchive/SKILL.md` has `name: unarchive` and a one-line description.

## Body shape (both skills — clone of `plugin/skills/reset/SKILL.md`)

- [ ] Body is a single H1 heading followed by a numbered list (3 steps).
- [ ] Total file length is 5–15 lines of markdown.
- [ ] No embedded behavioral logic — only redirection to the MCP tool.
- [ ] No `AskUserQuestion` references; list-picking uses plain prose matching `reset` / `pickup`.

## archive skill — behavioral delegation

- [ ] Step 1 calls `haiku_intent_list` to find candidate intents. If multiple, asks the user which one in plain prose.
- [ ] Step 2 calls `haiku_intent_archive { intent: "<slug>" }`.
- [ ] Step 3 follows the returned instructions from the tool.

## unarchive skill — behavioral delegation

- [ ] Step 1 calls `haiku_intent_list { include_archived: true }` and filters to archived entries. If multiple, asks the user which one in plain prose.
- [ ] Step 2 calls `haiku_intent_unarchive { intent: "<slug>" }`.
- [ ] Step 3 follows the returned instructions from the tool.

## No other changes

- [ ] `plugin/.claude-plugin/plugin.json` is NOT modified — skills are auto-discovered.
- [ ] No changes to hooks, prompt handlers, or TypeScript files.
- [ ] Both skills pass any plugin linting / skill-file validation.
- [ ] Invocable via Claude Code as `/haiku:archive` and `/haiku:unarchive`.
