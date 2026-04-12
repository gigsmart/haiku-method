---
intent: cascading-model-selection
unit: unit-03-ui-model-display
type: plan
created: 2026-04-10
---

# Unit 03 — UI Model Display: Implementation Plan

## Pre-Flight Checks

Before writing any code, verify:

1. `model?: string` exists in `UnitFrontmatter` in `packages/haiku/src/types.ts` (lines 30–53).
   **Already confirmed present** — unit-01 added it. No change needed.

2. `tailwind-generated.ts` does not exist yet — it's a build artifact from `scripts/build-css.mjs`.
   Adding new Tailwind classes to `styles.ts` is sufficient; the build script scans `src/templates/*.ts`
   and will pick them up automatically. No manual editing of the generated file needed.

3. `npx tsc --noEmit` currently fails with two pre-existing errors:
   - `Cannot find module './tailwind-generated.js'` (from styles.ts)
   - `Cannot find module './review-app-html.js'` (from http.ts)
   Both are missing build artifacts. The builder must run `npm run prebuild` first to generate them,
   then verify `tsc --noEmit` passes with zero errors.

---

## Change Set (ordered by dependency)

### Step 1 — `packages/haiku/src/templates/styles.ts`

Add three model-tier entries to `statusColors` after the `blocked` entry:

```ts
opus:   { bg: "bg-purple-100", text: "text-purple-800", darkBg: "dark:bg-purple-900/40", darkText: "dark:text-purple-300" },
sonnet: { bg: "bg-blue-100",   text: "text-blue-800",   darkBg: "dark:bg-blue-900/40",   darkText: "dark:text-blue-300" },
haiku:  { bg: "bg-green-100",  text: "text-green-800",  darkBg: "dark:bg-green-900/40",  darkText: "dark:text-green-300" },
```

Notes:
- `sonnet` intentionally duplicates `in_progress` blue — semantically distinct (different aria-label).
- `haiku` intentionally duplicates `completed` green — same rationale.
- Purple classes (`bg-purple-100`, `text-purple-800`, `dark:bg-purple-900/40`, `dark:text-purple-300`)
  are new. Adding them to `styles.ts` is sufficient — the Tailwind scanner will pick them up on next
  `npm run prebuild`. No manual action needed on `tailwind-generated.ts`.

**Do this first** so the badge colors are ready before the templates reference them.

---

### Step 2 — `packages/haiku/src/templates/intent-review.ts`

Two edits to the units table (currently lines 103–145):

**Edit A — Data row (around line 112):** Insert Model cell between Discipline and Status:

```ts
// Before (existing):
<td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.discipline ?? u.frontmatter.type ?? "")}</td>
<td class="py-3 pr-3">${renderBadge("Status", u.frontmatter.status)}</td>

// After:
<td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.discipline ?? u.frontmatter.type ?? "")}</td>
<td class="py-3 pr-3 text-sm">${escapeHtml(u.frontmatter.model ?? "—")}</td>
<td class="py-3 pr-3">${renderBadge("Status", u.frontmatter.status)}</td>
```

- Model displayed as plain text (same style as Discipline), not a badge.
- `u.frontmatter.model ?? "—"` — em-dash when unset, matching the `deps` empty-state pattern.

**Edit B — Mockup colspan row (around line 116):** Change `colspan="5"` to `colspan="6"`:

```ts
// Before:
${um.length > 0 ? `<tr><td colspan="5" class="pb-4">${renderMockupEmbeds(um)}</td></tr>` : ""}

// After:
${um.length > 0 ? `<tr><td colspan="6" class="pb-4">${renderMockupEmbeds(um)}</td></tr>` : ""}
```

**Edit C — Header row (around lines 136–138):** Insert Model `<th>` between Discipline and Status:

```ts
// Before (existing order):
<th ...>Discipline</th>
<th ...>Status</th>

// After:
<th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Discipline</th>
<th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Model</th>
<th class="py-2 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
```

Use the identical class string from adjacent `<th>` elements (copy-paste, don't invent).

---

### Step 3 — `packages/haiku/src/templates/unit-review.ts`

Edit the badge area (lines 60–64). Add model badge after discipline badge:

```ts
// Before:
<div class="flex flex-wrap items-center gap-2 mb-6">
  ${renderBadge("Unit", "unit")}
  ${renderBadge("Status", unit.frontmatter.status)}
  ${unit.frontmatter.discipline ? renderBadge("Discipline", unit.frontmatter.discipline) : ""}
</div>

// After:
<div class="flex flex-wrap items-center gap-2 mb-6">
  ${renderBadge("Unit", "unit")}
  ${renderBadge("Status", unit.frontmatter.status)}
  ${unit.frontmatter.discipline ? renderBadge("Discipline", unit.frontmatter.discipline) : ""}
  ${unit.frontmatter.model ? renderBadge("Model", unit.frontmatter.model) : ""}
</div>
```

`renderBadge("Model", unit.frontmatter.model)` will normalize `"opus"/"sonnet"/"haiku"` to lowercase
(already lowercase) and look up `statusColors[normalized]` — which will now find the entries added in Step 1.

---

### Step 4 — `packages/haiku/src/state-tools.ts` — `haiku_unit_list` (line 535)

Add `model` to the returned unit object. Change the return map line:

```ts
// Before:
return { name: f.replace(".md", ""), status: data.status, bolt: data.bolt, hat: data.hat }

// After:
return { name: f.replace(".md", ""), status: data.status, bolt: data.bolt, hat: data.hat, model: data.model ?? null }
```

`data.model ?? null` makes absent values explicit as `null` rather than being omitted from the JSON
(undefined is stripped by JSON.stringify). Purely additive — existing callers unaffected.

---

### Step 5 — `packages/haiku/src/state-tools.ts` — `haiku_dashboard` (lines 856–865)

Inside the existing `stages` loop (after the stage table is written), add unit model enumeration.
Insert after the `for (const s of stages)` block closes but still inside `if (stages.length > 0)`:

```ts
// After the existing stage table loop, inside `if (existsSync(stagesPath))`:
for (const s of stages) {
  const unitsDir = join(stagesPath, s, "units")
  if (existsSync(unitsDir)) {
    const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
    const modeled = unitFiles.filter(f => {
      const { data } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
      return !!data.model
    })
    if (modeled.length > 0) {
      out += `\n**${s} unit models:**\n`
      for (const f of unitFiles) {
        const { data } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
        if (data.model) out += `- ${f.replace(".md", "")}: \`${data.model}\`\n`
      }
    }
  }
}
```

Place this **after** the existing stage table loop, still inside `if (existsSync(stagesPath))`.
Dashboard output is plain markdown — no badge rendering. Model shown as inline code for readability.

---

### Step 6 — Build + Typecheck

```bash
cd packages/haiku
npm run prebuild   # generates tailwind-generated.ts and review-app-html.js
npx tsc --noEmit  # must pass with zero errors
```

If `npm run prebuild` fails for unrelated reasons, the builder must investigate and fix before claiming done.

---

## Risks & Watch-Outs

1. **Dashboard loop placement is delicate.** The stage loop reads `state.json` files. The new unit-model
   loop reads unit `.md` files in `stages/{stage}/units/`. Make sure the insertion point is inside
   `if (existsSync(stagesPath))` but not accidentally inside the existing `if (stages.length > 0)`
   block in a way that changes the table output. Read the full dashboard block (lines 838–868) before editing.

2. **Double file-read in dashboard.** The proposed code reads each unit file twice (once to filter, once
   to output). Acceptable given small unit counts, but the builder can optimize to a single pass if preferred:
   read once, store `data`, filter and output in the same pass.

3. **`tsc --noEmit` without prebuild.** If the builder runs typecheck before `npm run prebuild`,
   it will fail on the two missing-module errors. These are not regressions — run prebuild first.

4. **Tailwind purple classes.** After `npm run prebuild`, verify the generated `tailwind-generated.ts`
   contains the string `bg-purple-100` (or equivalent). If it doesn't appear, the Tailwind config's
   `content` glob (`./src/templates/*.ts`) should have picked it up from `styles.ts`. If still missing,
   add the classes to the `safelist` array in `tailwind.config.cjs`.

5. **No change to `renderBadge` needed.** It already normalizes to lowercase and handles the `statusColors`
   lookup with `pending` as the fallback. Model tier values (`opus`, `sonnet`, `haiku`) are already
   lowercase single tokens — no edge cases.

---

## Completion Checklist

- [ ] `statusColors` in `styles.ts` has `opus`, `sonnet`, `haiku` entries
- [ ] Intent review table has 6 columns: `#`, `Name`, `Discipline`, `Model`, `Status`, `Dependencies`
- [ ] Intent review colspan updated from `5` to `6`
- [ ] Unit review badge row shows model badge when `unit.frontmatter.model` is set
- [ ] `haiku_unit_list` returns `model` field (`null` when unset)
- [ ] `haiku_dashboard` shows per-unit model info grouped by stage
- [ ] `npm run prebuild` succeeds
- [ ] `npx tsc --noEmit` passes with zero errors
