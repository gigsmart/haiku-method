# Unit-03 Research Notes — Archive Skills

## Skills directory layout

- Path: `plugin/skills/{name}/SKILL.md` (one dir per skill, single file inside)
- New files to create:
  - `plugin/skills/archive/SKILL.md`
  - `plugin/skills/unarchive/SKILL.md`

## Registration / discovery

- **No manifest.** Skills are auto-discovered from `plugin/skills/*/SKILL.md` by Claude Code. `plugin/.claude-plugin/plugin.json` does not list skills.
- No hook, no prompt handler, no TypeScript wiring. Creating the SKILL.md file is sufficient.
- The `name` frontmatter field becomes the invocation slug (`/haiku:archive`, `/haiku:unarchive`).

## Frontmatter shape

Only two fields, both required:

```yaml
---
name: <skill-name>
description: <one-line description shown in skill picker>
---
```

No args schema, no version, no category. The body markdown is the prompt.

## Structural reference to clone

**`plugin/skills/reset/SKILL.md`** is the closest match — it is the cleanest "take an intent slug, do one thing, delegate to an MCP tool" pattern in the codebase. Three-step numbered list, ~10 lines total:

1. `haiku_intent_list` to find the intent (ask user if multiple active)
2. Call the single MCP tool with `{ intent: "<slug>" }`
3. Follow returned instructions

Both new skills should copy this exact shape. Swap `haiku_intent_reset` for `haiku_intent_archive` / `haiku_intent_unarchive` (from unit-02).

Secondary reference: `plugin/skills/pickup/SKILL.md` (same pattern, even shorter).

## Argument parsing

Existing skills don't parse args explicitly — they just reference `<slug>` in the tool call and rely on `haiku_intent_list` + natural-language disambiguation when the user didn't provide one. No `$ARGUMENTS` or CLI-style flag parsing in any current skill.

## AskUserQuestion / list-picking

- **Only `start/SKILL.md` references `AskUserQuestion`** — and only for prelaboration Q&A, not list-picking.
- `reset` and `pickup` use plain prose: *"If multiple active, ask the user which one."* No structured picker.
- Recommendation: follow the `reset` pattern. The prompt says "ask the user which one" and lets the model use whatever mechanism fits (plain text or `AskUserQuestion`). Don't over-specify.

## Body length target

5–15 lines of markdown. Numbered list, no headers beyond the H1 title. Keep it thin — the MCP tool returns the real instructions.
