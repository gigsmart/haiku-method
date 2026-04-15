---
name: research-notes
unit: unit-05-docs-sync
hat: researcher
created: 2026-04-14
---

# Docs Sync Research — unit-05-docs-sync

## Rendering pipeline (no sidebar nav to update)

- Docs live at `website/content/docs/*.md`. Rendered dynamically by `website/app/docs/[slug]/page.tsx` and listed by `website/app/docs/page.tsx` via `getAllDocs()` in `website/lib/docs.ts`.
- **No hand-maintained sidebar / nav registry.** New files auto-appear; no nav file needs editing.
- **No auto-generated MCP tool reference.** All skill/tool mentions in docs are hand-written prose — there is no TypeScript source that gets transformed into a tools doc page.
- Docs page itself (`website/app/docs/page.tsx:30-43`) hard-codes a four-item skill list (`/haiku:start`, `/haiku:pickup`, `/haiku:execute`, `/haiku:gate-review`). Out of scope for this unit (not an enumeration of all skills — it's a curated "get started" shortlist), but flag it if we want.

## Existing `archive` / `archived` mentions

- `grep -i archiv` across `website/content/docs/` → **zero matches**. No collision, no duplication. Safe green field.

## Files that enumerate skills

The one canonical skill reference — must get entries for the two new skills:

### `website/content/docs/cli-reference.md` (PRIMARY TARGET)
- Frontmatter: "Complete reference for all /haiku:* commands".
- Pattern: one `### \`/haiku:<name>\`` heading per skill, followed by 1-3 line description and optional `**Arguments:**` line.
- Current skill sections (L11-146): `start`, `pickup`, `gate-review`, `autopilot`, `quick`, `refine`, `reflect`, `ideate`, `adopt`, `capacity`, `changelog`, `pressure-testing`, `composite`, `triggers`, `operate`, `backlog`, `dashboard`, `scaffold`, `migrate`, `seed`, `setup`.
- **Action:** add `### \`/haiku:archive\`` and `### \`/haiku:unarchive\`` sections. Logical placement is near `/haiku:dashboard` (L121) and `/haiku:backlog` (L115) since they're all intent-management commands. Recommend inserting after `/haiku:dashboard` block (around L124) as a new pair.
- Each entry needs: 1-line description, `**Arguments:** \`intent\` (required) — slug of intent to archive/unarchive.`

Other docs mentioning skills do so *contextually*, not as a complete enumeration. They teach users the workflow (`/haiku:start` → `/haiku:pickup` → `/haiku:operate`) and we don't need to force archive/unarchive into every one. Specifically:

- `getting-started.md` L83-89 — "Core Commands" mini-table. Curated 6-row list (`start`, `pickup`, `gate-review`, `pickup [slug]`, `quick`, `reset`, `autopilot`). Recommend **skipping** — this is the beginner shortlist, not a full catalog. Archive is advanced.
- `quick-start.md` L78-80 — similar curated mini-table. Skip.
- `workflows.md` — narrative usage only, no enumeration. Skip.
- `migration.md` L18-38 — AI-DLC→H·AI·K·U mapping table. Skip (archive is net-new, no AI-DLC equivalent).
- `concepts.md`, `elaboration.md`, `operations-guide.md`, `example-*.md`, `checklist-*.md`, `providers.md`, `stages.md`, `studios.md`, `hats.md`, `customization.md`, `adoption-roadmap.md`, `cowork.md`, `guide-developer.md`, `installation.md`, `index.md`, `operation-schema.md` — all use skill names in narrative context only. Skip.

## Files that enumerate MCP tools

- **Zero docs enumerate MCP tools as a reference list.** The only mention is one sentence in `concepts.md:411`:
  > "MCP tools (`haiku_intent_*`, `haiku_stage_*`, `haiku_unit_*`) are the primary interface for reading and writing state."
  That's a wildcard glob, not an enumeration. New tools are automatically covered by `haiku_intent_*` — no edit needed.
- There is **no dedicated tools reference page** like a `tools-reference.md`. Conclusion: we do **not** need to edit a tools schema doc.
- The canonical full tool list lives in the prototype runtime map (`website/public/prototype-stage-flow.html`'s `TOOL_SPECS` registry) — handled by unit-04, not this unit.

## Intent-lifecycle / workflow prose explainer (where to put the user-facing archive/restore explanation)

Success criterion 3 requires one docs location that explains the archive/restore flow end-to-end in prose. Two viable homes:

### Option A (recommended): `website/content/docs/cli-reference.md`
- The new `/haiku:archive` and `/haiku:unarchive` sections already live here. Add a short prose callout under the `/haiku:archive` entry (3-5 sentences): what archive does, how to trigger, what happens to dashboard/list views, how to restore.
- Pro: colocated with the command entries the reader is already looking at. No cross-doc hop.
- Con: cli-reference is usually terse.

### Option B: `website/content/docs/workflows.md`
- Narrative workflow doc. Could add a new `## Managing Multiple Intents` subsection after the main flow (around L234).
- Pro: fits the "intent lifecycle" framing literally.
- Con: workflows.md is focused on stage pipeline, not intent-level management. New section feels orthogonal.

**Recommendation:** Option A for minimum churn. Add a single `## Managing Intents` subsection in `cli-reference.md` just above the per-command reference (or right after the two new command entries) with a 4-5 sentence prose explanation. Keep it short — per unit spec: "No one reads 800 words about a soft-hide flag."

## Build verification

- Success criterion: `cd website && npm run build` succeeds. No custom linker for docs — plain markdown + frontmatter. Build risk is near-zero unless a bad link is introduced.

## Exact edit list for the executor

| File | Edit | Approx location |
|---|---|---|
| `website/content/docs/cli-reference.md` | Add `### \`/haiku:archive\`` section | After L124 (after `/haiku:dashboard`) |
| `website/content/docs/cli-reference.md` | Add `### \`/haiku:unarchive\`` section | Immediately after the archive section |
| `website/content/docs/cli-reference.md` | Add `## Managing Intents` prose subsection (4-5 sentences) explaining archive/restore flow | Either just before the `## Core Commands` heading (L9) as an intro, OR right after the two new command entries. Executor picks. |

Total file touches: **1 file** (`cli-reference.md`), **3 edits**. Nothing else.

## Out-of-scope confirmations

- Paper: no edit (discovery confirmed).
- Prototype: handled by unit-04.
- MCP tool reference docs: don't exist; nothing to edit.
- Sidebar/nav: auto-generated; nothing to edit.
- Getting-started / quick-start / migration: curated shortlists, intentionally skipped.
