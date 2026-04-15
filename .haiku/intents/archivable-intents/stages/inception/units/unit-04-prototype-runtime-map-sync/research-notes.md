---
name: research-notes
unit: unit-04-prototype-runtime-map-sync
hat: researcher
created: 2026-04-14
---

# Research Notes: Prototype Runtime-Map Sync for Archive Tools

## Target file
`website/public/prototype-stage-flow.html` (single-file SPA; ~5000 lines).

## 1. `TOOL_SPECS` registry

**Location:** lines **4585 – 4709** (constant `const TOOL_SPECS = { ... }`).
**Declaration header:** line 4584 — `// Tool spec registry — for any clickable tool-call chip`.
**Closing brace:** line 4709.

**Existing entries (in order):** `haiku_intent_create` (4586), `haiku_run_next` (4605), `haiku_select_studio` (4616), `haiku_intent_reset` (4631), `haiku_unit_start` (4647), `haiku_unit_advance_hat` (4663), `haiku_unit_reject_hat` (4679), `ask_user_visual_question` (4695).

**Shape every entry follows:**
```js
tool_name: {
  description: "…",
  input: { field: "type · description", … },
  output: { field: "type · description", … },
  writes: [
    { path: "…", change: "…" },
    // OR a plain string when there are no disk writes
  ],
},
```

**Closest template — `haiku_intent_reset` (lines 4631 – 4646):**
```js
haiku_intent_reset: {
  description: "Nukes an intent's FSM state — wipes `state.json`, unit files, worktrees, and frontmatter mutations — leaving the original `intent.md` body intact. Used when the work needs a clean restart from elaborate.",
  input: {
    intent: "string · the intent slug",
    confirm: "boolean · must be true (safety guard)",
  },
  output: {
    ok: "boolean",
    reset: "object · summary of what was wiped",
  },
  writes: [
    { path: ".haiku/intents/{slug}/stages/", change: "deletes every stage's `state.json` and `units/` directory" },
    { path: ".haiku/intents/{slug}/intent.md", change: "frontmatter: `active_stage: null`, `status: \"pending\"`, `intent_reviewed: false`" },
    { path: ".haiku/worktrees/", change: "deletes worktrees that belonged to this intent's units" },
  ],
},
```

**Insertion recommendation:** add `haiku_intent_archive` and `haiku_intent_unarchive` **immediately after** `haiku_intent_reset` (i.e. at line 4647, pushing the unit-* entries down). Keeps all `haiku_intent_*` tools grouped.

**Per unit-02 (the developer builder hat), the new tools take only `{ intent: string }` as input and write a single frontmatter field** (`archived: true|false`) to `.haiku/intents/{slug}/intent.md`. No elicitation, no disk-shape mutation, no worktree deletion. The registry entries should reflect that minimal surface — do NOT copy the `confirm` guard from `haiku_intent_reset`; archive is reversible.

## 2. Orchestrator actor modal — tool list insertion point

**Location:** `ACTORS.orchestrator.notes` at line **4025** (the long multi-line string inside `orchestrator:` which starts at line 4008).

**Structure of the notes string** (parsed as markdown by `renderMarkdown`):
- `**FSM drivers** (orchestrator.ts):` — lists `haiku_run_next`, `haiku_intent_create`, `haiku_select_studio`, `haiku_revisit`, `haiku_intent_reset`
- `**State tools** (state-tools.ts):` — lists `haiku_intent_get`, `haiku_intent_list`, `haiku_stage_get`, `haiku_unit_*`, `haiku_knowledge_*`, `haiku_studio_*`, `haiku_settings_get`, `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_review`, `haiku_backlog`, `haiku_seed`, `haiku_release_notes`
- `**Review-server tool** (server.ts):` — lists `haiku_feedback`

**Where the archive tools belong:** The FSM-drivers group holds the mutating lifecycle tools (`haiku_intent_create`, `haiku_select_studio`, `haiku_revisit`, `haiku_intent_reset`). `haiku_intent_archive` / `haiku_intent_unarchive` are lifecycle mutations of the same kind, so **add them under "FSM drivers"** alongside `haiku_intent_reset`. That mirrors where unit-02 puts them in the orchestrator code surface.

**Also bump the tool count:** line 4011 currently says `exposes 27 haiku_* tools`. With two new tools that becomes **29**. Update the number in the same line.

## 3. `haiku_run_next` payload registry — archived error branch

**`payloadFor(...)` location:** lines **3627 – 3900+** (`function payloadFor(stage, idx, mStage, key, opts = {})` with `const map = { … }`).
**Header comment:** lines 3623 – 3626 (`haiku_run_next payload registry — what the orchestrator returns at each transition point, distilled from packages/haiku/src/orchestrator.ts`).

**Grep confirms:** zero occurrences of `archived` / `archive` anywhere in the prototype today. There is no existing archived-intent error branch in the `map`. The `haiku_run_next` `TOOL_SPECS` entry (line 4605) also does not mention the refusal.

**Options for reflecting the archive-refusal path** (developer/builder hat in unit-04 decides):
1. **Minimal (recommended):** amend the existing `haiku_run_next` TOOL_SPECS entry (4605 – 4615) — add a one-line note in `output.action` (or `description`) that `haiku_run_next` errors when the intent is archived, with a hint to call `haiku_intent_unarchive` first. Lowest-risk edit, no new map key.
2. **Full:** add a new `payloadFor` map key (e.g. `"archived-refusal"`) describing the error shape. More faithful but there is no call-chip in the rendered diagram to attach it to, so it would be unreachable UI. Not worth it.

**Recommendation: option 1.** Update the `haiku_run_next` description string to mention the archived refusal, and add a `writes` entry noting no state mutation occurs on refusal.

## 4. Sidecar rebuild?

**Not needed.** `.claude/rules/architecture-prototype-sync.md` table: rebuilds are only required for studio/stage/hat/review-agent/discovery/output template changes. Tool-spec additions are inline HTML edits. Confirmed by reading the sync-rule table (rows 1–8) in the worktree copy.

Command **NOT to run:** `node website/_build-prototype-content.mjs`.

## 5. Verification steps for the developer/builder hat

1. Edit `website/public/prototype-stage-flow.html` in place.
2. `cd website && npm run dev`, open `http://localhost:3000/prototype-stage-flow.html`.
3. Open the Orchestrator actor modal (click the 🧠 actor chip at the top of the page) — verify both new tools appear under `FSM drivers`.
4. Check browser console — no errors.
5. Open existing tool modals (click any `haiku_run_next` pill) — verify nothing broke in the rendering path.
6. Confirm tool-count text at the top of the modal reads "29 haiku_* tools".

## 6. Summary for implementer

| Thing to change | File / line | Insert after |
|---|---|---|
| Add `haiku_intent_archive` to `TOOL_SPECS` | 4646 → new 4647 | `haiku_intent_reset` closing `},` |
| Add `haiku_intent_unarchive` to `TOOL_SPECS` | directly after the above | new `haiku_intent_archive` entry |
| List both tools under "FSM drivers" | inside `ACTORS.orchestrator.notes` string, ~line 4025 | existing `haiku_intent_reset` bullet |
| Update tool count `27` → `29` | line 4011 | `exposes 27 haiku_* tools` |
| Mention archived refusal in `haiku_run_next` description | line 4606 (description) and/or 4614 (writes) | existing text |
| Rebuild sidecar? | **NO** | — |
