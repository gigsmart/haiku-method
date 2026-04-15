# unit-05 Implementation Notes

## What was inserted

Single file modified: `website/content/docs/cli-reference.md` (16 insertions, 0 deletions).

Three insertions, placed immediately after the existing `/haiku:dashboard` block (which ends at line 123 with a trailing blank at line 124), pushing `### /haiku:scaffold` down:

1. **`### /haiku:archive` section** — line 125
   - 1-sentence description: soft-hide via `archived` frontmatter flag, files stay in `.haiku/intents/{slug}`, history preserved.
   - `**Arguments:** \`intent\` (required) — slug of intent to archive.`

2. **`### /haiku:unarchive` section** — line 131
   - 1-sentence description: clear the `archived` flag so intent reappears in default list and dashboard views.
   - `**Arguments:** \`intent\` (required) — slug of intent to restore.`

3. **`## Managing Intents` prose subsection** — heading line 137, prose line 139
   - 4 sentences covering: what archive does (flag, not a move), how to trigger (`/haiku:archive <slug>`), what changes (filtered from `/haiku:dashboard`, `/haiku:capacity`, default `haiku_intent_list`), how to see archived intents (`haiku_intent_list { include_archived: true }` which adds an `archived` field), how to restore (`/haiku:unarchive <slug>`).

## Pre-write verification

Confirmed tool shape against `packages/haiku/src/orchestrator.ts:2827-2845`:

- `haiku_intent_archive` — `required: ["intent"]`, `intent: { type: "string" }`. No other params.
- `haiku_intent_unarchive` — same shape.

Confirmed `haiku_intent_list` opt-in shape against `packages/haiku/src/state-tools.ts:1912-1923` and the handler at `:2233-2253`:

- `include_archived: boolean` opts archived intents back in.
- When true, each response object gains an `archived` boolean field.

Both `**Arguments:**` lines and the prose mirror these signatures — no invented parameters.

## House format match

Matched the neighbor entries `/haiku:backlog` (L115-119) and `/haiku:dashboard` (L121-123): `###` heading, 1-sentence description, blank line, `**Arguments:**` line (omitted for arg-less commands).

## Build output

`cd website && npm run build` failed at the webpack stage with:

```
Syntax error: tailwindcss: .../website/app/globals.css Can't resolve 'tailwindcss' in '.../website/app'
> 1 | @import "tailwindcss";
```

Diagnosis: the worktree has no `node_modules` of its own. `tailwindcss` is installed at the monorepo root (`../../../../../../node_modules/tailwindcss`), but Next's css/postcss pipeline resolves from the workspace package dir (`website/app`), which does not see the hoisted root install from inside the worktree. Running `npm install` inside the worktree would resolve it, but per unit instructions (node_modules absence is an out-of-scope environment issue), noting and proceeding. The edits here are content-layer markdown under `website/content/docs/`, which is loaded at runtime by `getAllDocs()` and is not touched by the tailwind/webpack css pipeline at all — the build failure is orthogonal to the markdown edits in this unit.

## Scope discipline

Only `website/content/docs/cli-reference.md` was touched. Confirmed via `git diff --stat website/content/docs/` showing exactly 1 file changed, 16 insertions.
