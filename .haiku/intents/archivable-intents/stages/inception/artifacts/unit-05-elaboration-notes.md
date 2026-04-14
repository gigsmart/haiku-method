---
unit: unit-05-docs-sync
hat: elaborator
created: 2026-04-14
---

# Elaboration Notes — unit-05-docs-sync

## Refinements vs. the original spec

The original spec told the builder to "audit `website/content/docs/` for files that list MCP tools, skills, or intent-management workflows." Research already did that audit and landed on a single file. The spec has been rewritten to reflect the pinned reality:

- **Target is one file**: `website/content/docs/cli-reference.md`. Nothing else.
- **Three concrete edits**, not an open-ended audit:
  1. `### /haiku:archive` section after line 124.
  2. `### /haiku:unarchive` section immediately after.
  3. `## Managing Intents` prose subsection (≤5 sentences) colocated with the new entries.
- **Out-of-scope list is explicit** so the builder doesn't drift: `concepts.md` (covered by wildcard glob), `getting-started.md` / `quick-start.md` / `migration.md` (curated shortlists), all other docs (narrative only), paper, prototype, sidebar (dynamic).

## Why `npm run build` stays

Research flagged that docs are rendered at runtime via `getAllDocs()`. I kept the build success criterion anyway — Next.js static build still traverses the content tree and catches broken frontmatter and broken links, which are the two most likely regressions when editing markdown. Cheap guard, real value.

## Scope boundaries

- Content-shape boundary: the builder writes markdown only. No TypeScript, no JSON schema, no prompt, no hook.
- Cross-unit boundary: unit-02 owns the tool/flag shape, unit-03 owns the skill frontmatter. The builder reads those as ground truth before writing the `**Arguments:**` line — do not invent argument names.
- Cross-stage boundary: no paper edits, no prototype edits, no source edits. Docs-only.

## Model assignment

`sonnet` — default tier. This is not mechanical copy-paste (wording and prose require judgment to match the house style and stay under the 5-sentence ceiling), but it's also not architectural. Standard docs edit with clear scope.

## Dependency chain

`unit-05` depends on `unit-03-archive-skills` (skill definitions must exist before we document them). Transitively depends on `unit-02` (tool signatures) and `unit-01` (flag semantics). All three are already completed, so the dependency chain is unblocked.

## Anti-pattern check

- [x] Unit is completable in one bolt (3 edits to one file + build verify).
- [x] No circular dependencies.
- [x] Success criteria are verifiable (grep for the two headings, grep for `## Managing Intents`, run `npm run build`).
- [x] Clear boundary (one file, three edits, explicit out-of-scope list).
- [x] Feature slice, not a layer slice (docs for this feature, not "all docs for everything").
