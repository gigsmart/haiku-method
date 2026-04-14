---
name: unit-03-implement-archive-skills
type: plugin
depends_on:
  - unit-02-implement-archive-tools-and-fsm-refusal
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
  - knowledge/ARCHITECTURE.md
  - stages/inception/units/unit-03-archive-skills.md
status: active
bolt: 1
hat: builder
started_at: '2026-04-14T22:07:51Z'
hat_started_at: '2026-04-14T22:08:47Z'
---

# unit-03-implement-archive-skills

## Description
Implement the specification in `stages/inception/units/unit-03-archive-skills.md`. That document is the source of truth for scope and success criteria. Read it end-to-end before writing anything. Also read `knowledge/unit-03-implementation-acceptance.md` — it's the full implementer checklist captured by the elaborator.

## Scope
- Create `plugin/skills/archive/SKILL.md` as a direct structural clone of `plugin/skills/reset/SKILL.md`. Frontmatter: `name` and `description` only. Body: 3-step numbered list delegating to `haiku_intent_archive { intent: "<slug>" }`. If no slug supplied, call `haiku_intent_list` and ask the user in plain prose which intent to archive.
- Create `plugin/skills/unarchive/SKILL.md` with the same shape, delegating to `haiku_intent_unarchive`. If no slug supplied, call `haiku_intent_list { include_archived: true }`, filter to archived entries, ask in plain prose.
- No behavioral logic in the skill body — skills are thin redirects, tools return the dynamic instructions.
- Do NOT edit `plugin/.claude-plugin/plugin.json`, hooks, or any TypeScript. Skills are auto-discovered.
- Do NOT use `AskUserQuestion` or structured pickers — plain prose, matching `reset`/`pickup`.

## Success Criteria
- [ ] `plugin/skills/archive/SKILL.md` exists with frontmatter containing exactly `name` and `description` fields and a body length of 5-15 lines structurally matching `plugin/skills/reset/SKILL.md`.
- [ ] `plugin/skills/unarchive/SKILL.md` exists with the same shape and delegates to `haiku_intent_unarchive`.
- [ ] Both skills auto-discover at runtime: `/haiku:archive <slug>` and `/haiku:unarchive <slug>` resolve through the plugin's skill loader without any manifest edits.
- [ ] End-to-end: `/haiku:archive <slug>` triggers `haiku_intent_archive` and the target intent's frontmatter gains `archived: true`. `/haiku:unarchive <slug>` reverses it.
- [ ] No embedded behavioral logic — diff the skill bodies against `plugin/skills/reset/SKILL.md` and confirm structural parity (same numbered-step shape, same delegation pattern).

## Notes
Depends on unit-02 — both tools must exist before these skills are usable. The inception spec and the implementation-acceptance checklist in `knowledge/unit-03-implementation-acceptance.md` together are authoritative. Do not invent tool names or argument shapes; read unit-02's handler code to confirm before writing the skill body.
