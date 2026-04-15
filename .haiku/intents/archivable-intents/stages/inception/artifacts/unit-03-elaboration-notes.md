# Unit-03 Elaboration Notes

Refinements applied to `unit-03-archive-skills.md` based on fresh research notes.

## Pinned reference skill

`plugin/skills/reset/SKILL.md` is the canonical clone target. Both new skills MUST
match its shape: two-field frontmatter (`name`, `description`), 3-step numbered
list, ~10 lines total. Secondary reference: `plugin/skills/pickup/SKILL.md`.

## Frontmatter confirmed

Only two fields required:

```yaml
---
name: <skill-name>
description: <one-line description>
---
```

No args schema, no version, no category, no invocation surface field.

## No manifest edits

Skills are auto-discovered from `plugin/skills/{name}/SKILL.md` by Claude Code.
`plugin/.claude-plugin/plugin.json` does not list skills and MUST NOT be touched
by this unit. No hooks, prompt handlers, or TypeScript wiring either.

## List-picking pattern: plain prose, not AskUserQuestion

The original spec recommended `AskUserQuestion` for the "no slug provided" path.
Dropped. Both `reset` and `pickup` use plain prose ("If multiple active, ask the
user which one") and the new skills MUST follow that pattern. `AskUserQuestion`
appears in `start/SKILL.md` only for prelaboration Q&A, not list-picking.

## Files to create

- `plugin/skills/archive/SKILL.md` → delegates to `haiku_intent_archive`
- `plugin/skills/unarchive/SKILL.md` → delegates to `haiku_intent_unarchive`
  (uses `haiku_intent_list { include_archived: true }` for the list path)

## Dependency preserved

Unit still depends on `unit-02-archive-tools-and-fsm-refusal` — both tools are
introduced there. Unit-03 must not start before unit-02 is merged.
