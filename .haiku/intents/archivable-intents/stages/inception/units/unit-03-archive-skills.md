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
hat: researcher
started_at: '2026-04-14T20:40:38Z'
hat_started_at: '2026-04-14T20:40:38Z'
---

# unit-03-archive-skills

## Description
Add thin user-facing skills that wrap the new archive and unarchive tools, keeping H·AI·K·U consistent with its "all entry points are skills" pattern. The skills are small — they parse the intent slug argument, call the MCP tool, and report the result. All behavioral logic lives in the MCP tools from unit-02; the skills exist so users can type `/haiku:archive <slug>` or `/haiku:unarchive <slug>` instead of invoking the tool directly.

## Discipline
plugin - Skill files in `plugin/skills/`.

## Scope

**In scope:**
- Create `plugin/skills/archive/SKILL.md` that accepts an intent slug argument and calls `haiku_intent_archive { intent: "<slug>" }`. If no slug is provided, the skill prompts the user to pick from the non-archived intent list.
- Create `plugin/skills/unarchive/SKILL.md` that accepts an intent slug argument and calls `haiku_intent_unarchive { intent: "<slug>" }`. If no slug is provided, the skill lists archived intents (via `haiku_intent_list { include_archived: true }` filtered to archived) and prompts the user to pick one.
- Both skills follow the existing thin-skill pattern (see `plugin/skills/start/SKILL.md`) — redirect to tool calls, no embedded logic.

**Out of scope:**
- Any behavioral logic (belongs in the tools).
- Confirmation prompts beyond slug selection (archive is reversible, confirmation is unnecessary).

## Success Criteria
- [ ] `plugin/skills/archive/SKILL.md` exists, invokable as `/haiku:archive`, and correctly delegates to `haiku_intent_archive`.
- [ ] `plugin/skills/unarchive/SKILL.md` exists, invokable as `/haiku:unarchive`, and correctly delegates to `haiku_intent_unarchive`.
- [ ] Each skill handles both the "slug provided" and "no slug — pick from list" paths. The pick-from-list path uses `AskUserQuestion` (or equivalent) rather than inline option text.
- [ ] Both skills pass any plugin linting / skill-file validation.

## Notes
- Skill files are Markdown with a frontmatter preamble declaring the skill's name, description, and invocation surface. Copy the shape from `plugin/skills/start/SKILL.md` or `plugin/skills/reset/SKILL.md` (whichever is the closest structural match to a slug-targeted intent operation).
- Per memory: skills are thin redirects; the tools return dynamic instructions. Do not embed behavioral logic here.
