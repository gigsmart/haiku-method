---
intent: cascading-model-selection
unit: unit-03-ui-model-display
created: 2026-04-10
type: research-notes
---

# Unit 03 — UI Model Display: Research Findings

All line references verified against `haiku/cascading-model-selection/unit-03-ui-model-display` HEAD.

---

## 1. Intent Review Units Table — `packages/haiku/src/templates/intent-review.ts`

### Current table structure (lines 103–145)

Five columns: `#`, `Name`, `Discipline`, `Status`, `Dependencies`.

**Header row** (lines 133–139):
```html
<th>#</th>
<th>Name</th>
<th>Discipline</th>
<th>Status</th>
<th>Dependencies</th>
```

**Data row** (lines 109–116):
```ts
<td>${u.number.padStart(2, "0")}</td>
<td>${escapeHtml(u.title)}</td>
<td>${escapeHtml(u.frontmatter.discipline ?? u.frontmatter.type ?? "")}</td>
<td>${renderBadge("Status", u.frontmatter.status)}</td>
<td>${escapeHtml(deps)}</td>
```

Mockup colspan row (line 116) uses `colspan="5"` — this must be updated to `colspan="6"` when the Model column is added.

**Where Model column goes:** Between `Discipline` (col 3) and `Status` (col 4). The unit frontmatter field is `model` (type `string | undefined`). Display as plain text (not a badge) matching the Discipline column style. When unset, display `—` (em-dash) to match the `deps` empty-state pattern.

**Data source:** `u.frontmatter.model` — this field must be added to `UnitFrontmatter` in `types.ts` (unit-01 scope; unit-03 builder should verify it's present before implementing). The `ParsedUnit` interface wraps `UnitFrontmatter` so it's available automatically via `u.frontmatter.model`.

---

## 2. Unit Review Badge Area — `packages/haiku/src/templates/unit-review.ts`

### Current badge area (lines 60–64):
```ts
<div class="flex flex-wrap items-center gap-2 mb-6">
  ${renderBadge("Unit", "unit")}
  ${renderBadge("Status", unit.frontmatter.status)}
  ${unit.frontmatter.discipline ? renderBadge("Discipline", unit.frontmatter.discipline) : ""}
</div>
```

**Where Model badge goes:** After the Discipline badge (line 63 position). Pattern matches: only render if `unit.frontmatter.model` is truthy:
```ts
${unit.frontmatter.model ? renderBadge("Model", unit.frontmatter.model) : ""}
```

The label should be `"Model"` and the status value should be the raw model string (e.g., `"opus"`, `"sonnet"`, `"haiku"`). `renderBadge` normalizes to lowercase and replaces spaces with underscores — model tier names are already lowercase single words so no normalization concern.

---

## 3. `renderBadge` Component — `packages/haiku/src/templates/components.ts`

### Current implementation (lines 111–117):
```ts
export function renderBadge(label: string, status: string): string {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  const colors = statusColors[normalized] ?? statusColors.pending;
  return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
    ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}"
    aria-label="${escapeAttr(label)}: ${escapeAttr(status)}">${escapeHtml(status.replace(/_/g, " "))}</span>`;
}
```

Color lookup is via `statusColors` from `packages/haiku/src/templates/styles.ts`.

### Current `statusColors` (styles.ts lines 7–12):
```ts
export const statusColors: Record<string, {...}> = {
  completed: { bg: "bg-green-100", text: "text-green-800", darkBg: "dark:bg-green-900/40", darkText: "dark:text-green-300" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-800", darkBg: "dark:bg-blue-900/40", darkText: "dark:text-blue-300" },
  pending:    { bg: "bg-gray-100", text: "text-gray-800", darkBg: "dark:bg-gray-700/40", darkText: "dark:text-gray-300" },
  blocked:    { bg: "bg-red-100", text: "text-red-800", darkBg: "dark:bg-red-900/40", darkText: "dark:text-red-300" },
};
```

**What needs to change:** Add model tier color entries. The fallback (`statusColors.pending`) is gray — that's correct for `"default"` / unset. The named tiers need distinct colors per the unit spec:

| Model | Intended Color | Rationale |
|-------|---------------|-----------|
| `opus` | Purple/indigo | Highest tier, visually premium |
| `sonnet` | Blue | Mid-tier, matches `in_progress` vibe |
| `haiku` | Green | Lightest tier, matches `completed` vibe |

Suggested Tailwind classes (consistent with existing palette depth):
```ts
opus:   { bg: "bg-purple-100", text: "text-purple-800", darkBg: "dark:bg-purple-900/40", darkText: "dark:text-purple-300" },
sonnet: { bg: "bg-blue-100",   text: "text-blue-800",   darkBg: "dark:bg-blue-900/40",   darkText: "dark:text-blue-300" },
haiku:  { bg: "bg-green-100",  text: "text-green-800",  darkBg: "dark:bg-green-900/40",  darkText: "dark:text-green-300" },
```

Note: `sonnet` duplicates `in_progress` colors — that's intentional (same blue family). `haiku` duplicates `completed` green — also intentional. The `aria-label` will distinguish them semantically (`"Model: sonnet"` vs `"Status: completed"`).

**Important:** Tailwind CSS is pre-generated via `tailwind-generated.js`. Any new color classes (e.g., `bg-purple-100`, `text-purple-800`) must be present in the generated file or they'll be no-ops. The builder must verify `packages/haiku/src/templates/tailwind-generated.ts` (or `.js`) contains these classes, or add them.

---

## 4. Unit List Tool — `packages/haiku/src/state-tools.ts`

### Current `haiku_unit_list` (lines 529–537):
```ts
case "haiku_unit_list": {
  const dir = join(stageDir(args.intent as string, args.stage as string), "units")
  if (!existsSync(dir)) return text("[]")
  const files = readdirSync(dir).filter(f => f.endsWith(".md"))
  const units = files.map(f => {
    const { data } = parseFrontmatter(readFileSync(join(dir, f), "utf8"))
    return { name: f.replace(".md", ""), status: data.status, bolt: data.bolt, hat: data.hat }
  })
  return text(JSON.stringify(units, null, 2))
}
```

**Current returned fields:** `name`, `status`, `bolt`, `hat`.

**Change:** Add `model: data.model` (or `data.model || null` to make absent values explicit rather than `undefined`-omitted). The `data` object already contains all frontmatter via `parseFrontmatter` — no structural change needed, just add `model` to the returned object:
```ts
return { name: f.replace(".md", ""), status: data.status, bolt: data.bolt, hat: data.hat, model: data.model ?? null }
```

This is a purely additive change — existing callers receive an extra field and don't break.

---

## 5. Dashboard Tool — `packages/haiku/src/state-tools.ts`

### Current `haiku_dashboard` (lines 838–868):
```ts
case "haiku_dashboard": {
  // ... reads all intents, outputs markdown
  out += `- Status: ${data.status || "unknown"}\n`
  out += `- Studio: ${data.studio || "none"}\n`
  out += `- Active Stage: ${data.active_stage || "none"}\n`
  out += `- Mode: ${data.mode || "interactive"}\n`
  // Stage table: | Stage | Status | Phase |
}
```

The dashboard currently shows intent-level metadata and a per-stage status table. It does **not** enumerate units per stage.

**Required change (per unit spec):** When iterating stages, also enumerate units from `stages/{stage}/units/` and show model assignment if present. This requires reading unit frontmatter files inside the dashboard loop.

**Proposed addition** (inside the `stages` loop, after the stage table):
```ts
const unitsDir = join(stagesPath, s, "units")
if (existsSync(unitsDir)) {
  const unitFiles = readdirSync(unitsDir).filter(f => f.endsWith(".md"))
  const unitsWithModel = unitFiles.filter(f => {
    const { data } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
    return !!data.model
  })
  if (unitsWithModel.length > 0) {
    out += `\n**Unit models:**\n`
    for (const f of unitFiles) {
      const { data } = parseFrontmatter(readFileSync(join(unitsDir, f), "utf8"))
      if (data.model) out += `- ${f.replace(".md", "")}: \`${data.model}\`\n`
    }
  }
}
```

Note: The dashboard is text output (markdown), not HTML — no badge rendering. Model tier is shown as inline code for readability.

---

## 6. `UnitFrontmatter` Dependency (types.ts)

`UnitFrontmatter` in `packages/haiku/src/types.ts` (lines 30–53) **currently has no `model` field**. Unit-01's scope included adding `model?: string` to this interface.

The unit-03 builder must verify `model?: string` is present in `UnitFrontmatter` before referencing `unit.frontmatter.model` in the templates. If unit-01 was completed only as a research/knowledge artifact (no code change), the builder may need to add this field as part of unit-03 work, or coordinate with the development stage where the actual implementation lands.

**Current state confirmed:** `model` is NOT in `UnitFrontmatter` as of this branch HEAD. The inception stage for unit-03 is research-only — the development stage builder handles the actual code change.

---

## 7. Tailwind Class Coverage

The template system uses pre-generated Tailwind CSS (`packages/haiku/src/templates/tailwind-generated.ts`). Before using new color classes for model badges, the builder must confirm coverage. If `bg-purple-100`, `text-purple-800`, etc. are not in the generated file, they'll need to be added manually or the generation process must be re-run.

---

## 8. Summary of Changes Required

| File | Change | Scope |
|------|--------|-------|
| `packages/haiku/src/types.ts` | Add `model?: string` to `UnitFrontmatter` | Likely unit-01 scope; verify before building |
| `packages/haiku/src/templates/styles.ts` | Add `opus`, `sonnet`, `haiku` entries to `statusColors` | Unit-03 |
| `packages/haiku/src/templates/intent-review.ts` | Add Model column header + cell; update colspan from 5 to 6 | Unit-03 |
| `packages/haiku/src/templates/unit-review.ts` | Add model badge after discipline badge | Unit-03 |
| `packages/haiku/src/state-tools.ts` (unit_list) | Add `model` field to returned object | Unit-03 |
| `packages/haiku/src/state-tools.ts` (dashboard) | Add per-unit model display inside stage loop | Unit-03 |
| `packages/haiku/src/templates/tailwind-generated.ts` | Verify/add purple color utilities | Unit-03 (if needed) |

---

## 9. No-Change Zones

- `studio-reader.ts` — no change needed; `HatDef.model` already parsed
- `orchestrator.ts` — not in unit-03 scope; cascade resolution is unit-01 scope
- `plugin/` hat files — not in unit-03 scope
- Website docs — not in unit-03 scope for inception stage research
