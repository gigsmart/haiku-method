---
name: unit-05-docs-sync
type: website
depends_on: ["unit-03-archive-skills"]
inputs:
  - intent.md
  - knowledge/DISCOVERY.md
---

# unit-05-docs-sync

## Description
Document the new archive feature in the one docs file that enumerates every `/haiku:*` skill: `website/content/docs/cli-reference.md`. Add skill reference entries for `/haiku:archive` and `/haiku:unarchive`, plus a short prose subsection explaining the archive/restore user flow end-to-end. Research confirmed this is the sole edit target — the rendering pipeline is dynamic (no sidebar to touch), there is no MCP tools reference page to update, and other docs use skills contextually rather than as enumerations.

## Discipline
website - Markdown edits in `website/content/docs/cli-reference.md` only.

## Scope

**In scope — exactly one file, three edits:**

Target: `website/content/docs/cli-reference.md`

1. Insert `### \`/haiku:archive\`` section **immediately after line 124** (the existing `/haiku:dashboard` block). Follow the house pattern used by every other entry:
   - 1-sentence description of what archival does (soft-hide a completed/stale/paused intent via a flag in state — files stay in `.haiku/intents/{slug}`, history preserved).
   - `**Arguments:** \`intent\` (required) — slug of intent to archive.`

2. Insert `### \`/haiku:unarchive\`` section immediately after the `/haiku:archive` block:
   - 1-sentence description of restoration (clear the archived flag; intent reappears in default list/dashboard views).
   - `**Arguments:** \`intent\` (required) — slug of intent to restore.`

3. Add a `## Managing Intents` prose subsection (4-5 sentences total, no more) immediately after the two new command entries. Cover, in order:
   - What archive does (flag on intent state, not a move or delete).
   - How to trigger it (`/haiku:archive <slug>`).
   - What changes in default `haiku_intent_list` / `/haiku:dashboard` output (archived intents are filtered out).
   - How to see archived intents when needed (any list flag that opts them back in — mirror whatever unit-02 shipped).
   - How to restore (`/haiku:unarchive <slug>`).

**Out of scope — do not edit:**

- `website/content/docs/concepts.md` — its lone MCP-tools mention uses the wildcard glob `haiku_intent_*`, which already covers the new tools.
- `website/content/docs/getting-started.md` — curated beginner shortlist of core commands. Archive is an advanced intent-management command, not a first-run flow. Skip.
- `website/content/docs/quick-start.md` — same curated shortlist pattern. Skip.
- `website/content/docs/migration.md` — AI-DLC → H·AI·K·U mapping table. Archive is net-new with no legacy equivalent. Skip.
- `website/content/docs/workflows.md` and all other docs — narrative mentions only, not enumerations. Skip.
- Sidebar/nav files — rendering is dynamic via `getAllDocs()` in `website/lib/docs.ts`. No manual nav file exists.
- MCP tool reference docs — none exist. The canonical tool list is the prototype runtime map (handled by unit-04).
- `website/content/papers/haiku-method.md` — paper-level change not required for this implementation-level UX.
- `website/public/prototype-stage-flow.html` — unit-04.

## Success Criteria

Inception-scoped elaboration deliverables (checked by elaborator on completion):

- [x] Single edit target pinned (`website/content/docs/cli-reference.md`) with zero ambiguity — no open-ended doc audit required by the builder.
- [x] Exact insertion point pinned (after line 124, i.e. end of `/haiku:dashboard` block) so the builder skips re-discovery.
- [x] Three concrete insertions enumerated with house-format references (`/haiku:dashboard` L121-123 and `/haiku:backlog` L115-119 as neighbor templates).
- [x] Out-of-scope files enumerated with justification (`concepts.md` covered by wildcard glob; `getting-started.md` / `quick-start.md` / `migration.md` are curated shortlists; all other docs are narrative-only; paper and prototype out-of-scope).
- [x] Build-verification success criterion retained with justification (Next.js build validates content tree even though runtime rendering is dynamic).
- [x] Cross-unit dependency stated (builder must read unit-02 tool signatures and unit-03 skill frontmatter before writing `**Arguments:**` lines — no invented names).
- [x] Elaboration-notes artifact captures scope decisions at `stages/inception/artifacts/unit-05-elaboration-notes.md`.

## Forward-Looking Dev-Stage Acceptance (reference only; checked during the development stage)

- [ ] `website/content/docs/cli-reference.md` contains a `### \`/haiku:archive\`` section following the house skill-entry pattern, placed after the `/haiku:dashboard` block.
- [ ] Same file contains a `### \`/haiku:unarchive\`` section immediately after the archive section.
- [ ] Same file contains a `## Managing Intents` subsection (≤5 sentences) that explains the archive/restore flow end-to-end in plain prose — what, how to trigger, what users see in list/dashboard output, how to restore.
- [ ] Both skill entries use the house format: heading, 1-3 line description, `**Arguments:**` line matching existing sibling entries.
- [ ] No other files in `website/content/docs/` are modified.
- [ ] `cd website && npm run build` succeeds without errors or broken-link warnings.

## Notes

- Insertion point is hard-pinned: **after line 124** of `cli-reference.md` (end of the `/haiku:dashboard` block). Don't re-audit — research already did this.
- Match the terse house style. Look at `/haiku:dashboard` (L121-123) and `/haiku:backlog` (L115-119) for formatting reference — these are the nearest neighbors both semantically (intent-management commands) and structurally.
- Keep the `## Managing Intents` prose under 5 sentences. Per intent spec: "No one reads 800 words about a soft-hide flag."
- The builder (development stage) should verify the exact flag/argument shape against what unit-02 and unit-03 actually shipped (read `haiku_intent_list` signature and `/haiku:archive` skill frontmatter before writing the docs) so the arguments line matches reality.
