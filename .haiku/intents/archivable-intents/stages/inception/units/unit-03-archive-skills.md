---
name: unit-03-archive-skills
type: plugin
depends_on:
  - unit-02-archive-tools-and-fsm-refusal
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: elaborator
started_at: '2026-04-14T20:40:38Z'
hat_started_at: '2026-04-14T20:41:30Z'
outputs:
  - stages/inception/artifacts/unit-03-elaboration-notes.md
---

# unit-03-archive-skills

## Description
Add thin user-facing skills that wrap the new archive and unarchive tools, keeping H·AI·K·U consistent with its "all entry points are skills" pattern. The skills are small — they parse the intent slug argument, call the MCP tool, and report the result. All behavioral logic lives in the MCP tools from unit-02; the skills exist so users can type `/haiku:archive <slug>` or `/haiku:unarchive <slug>` instead of invoking the tool directly.

## Discipline
plugin - Skill files in `plugin/skills/`.

## Scope

**In scope:**
- Create `plugin/skills/archive/SKILL.md` that calls `haiku_intent_archive { intent: "<slug>" }`. If no slug is provided, the skill calls `haiku_intent_list` and asks the user which intent to archive in plain prose (matching `reset`/`pickup`).
- Create `plugin/skills/unarchive/SKILL.md` that calls `haiku_intent_unarchive { intent: "<slug>" }`. If no slug is provided, the skill calls `haiku_intent_list { include_archived: true }`, filters to archived entries, and asks the user which to unarchive in plain prose.
- Both skills MUST be a direct structural clone of `plugin/skills/reset/SKILL.md` — frontmatter with only `name` + `description`, followed by a short numbered list (3 steps, ~10 lines total). No embedded behavioral logic.

**Out of scope:**
- Any behavioral logic (belongs in the tools from unit-02).
- Confirmation prompts (archive is reversible — no elicitation needed).
- Editing `plugin/.claude-plugin/plugin.json` — skills are auto-discovered from `plugin/skills/*/SKILL.md`; no manifest registration.
- `AskUserQuestion` / structured pickers — reference skills use plain prose ("ask the user which one"), and these skills MUST follow that pattern.

## Completion Criteria

Elaborator-verifiable (checked during elaboration):

- [x] Reference skill to clone is pinned: `plugin/skills/reset/SKILL.md` (secondary: `plugin/skills/pickup/SKILL.md`).
- [x] Frontmatter shape confirmed: exactly two fields, `name` and `description`. No args schema, no version, no category.
- [x] No manifest / plugin.json / hook / prompt-handler / TypeScript wiring required — skills auto-discovered from `plugin/skills/{name}/SKILL.md`.
- [x] List-picking pattern specified as plain prose, not `AskUserQuestion`, matching reset/pickup behavior.
- [x] Exact file paths to create are named: `plugin/skills/archive/SKILL.md` and `plugin/skills/unarchive/SKILL.md`.
- [x] Dependency on `unit-02-archive-tools-and-fsm-refusal` is preserved — both skills delegate to tools introduced by unit-02.
- [x] Body length target documented: 5–15 lines, matching the structural shape of the reference skill.

## Implementation Acceptance Criteria

These are verified by the implementer / reviewer hats in the development stage:

- [ ] `plugin/skills/archive/SKILL.md` exists with frontmatter `name: archive` + one-line `description`, invokable as `/haiku:archive`, and its body delegates to `haiku_intent_archive { intent: "<slug>" }`.
- [ ] `plugin/skills/unarchive/SKILL.md` exists with frontmatter `name: unarchive` + one-line `description`, invokable as `/haiku:unarchive`, and its body delegates to `haiku_intent_unarchive { intent: "<slug>" }`.
- [ ] Each skill handles both the "slug provided" and "no slug — list and ask" paths using plain prose (no `AskUserQuestion`).
- [ ] Unarchive skill's listing step references `haiku_intent_list { include_archived: true }` and filters to archived entries.
- [ ] Both files are 5–15 lines of markdown total and structurally clone `plugin/skills/reset/SKILL.md`.
- [ ] No changes to `plugin/.claude-plugin/plugin.json`, hooks, prompt handlers, or TypeScript files.
- [ ] Both skills pass any plugin linting / skill-file validation.

## Notes
- **Reference to clone:** `plugin/skills/reset/SKILL.md` — the closest structural match (slug → single tool call → follow returned instructions). Secondary reference: `plugin/skills/pickup/SKILL.md`.
- **Frontmatter shape:** exactly two fields — `name` and `description`. No args schema, no version, no category. The `name` becomes the invocation slug.
- **No wiring required:** skills are auto-discovered from `plugin/skills/{name}/SKILL.md`. Do not touch `plugin/.claude-plugin/plugin.json`, hooks, prompt handlers, or TypeScript.
- **Dependency on unit-02:** both tools (`haiku_intent_archive`, `haiku_intent_unarchive`) are introduced by unit-02. This unit must not be picked up before unit-02 is merged.
- Per memory: skills are thin redirects; the tools return dynamic instructions. Do not embed behavioral logic in the skill body.
