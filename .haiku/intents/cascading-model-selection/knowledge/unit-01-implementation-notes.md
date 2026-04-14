---
intent: cascading-model-selection
unit: unit-01-model-cascade-engine
created: 2026-04-10
type: research-notes
---

# Unit 01 — Model Cascade Engine: Implementation Notes

Detailed findings from code reading to support the implementer. All line references verified against current HEAD.

## 1. `UnitFrontmatter` — `packages/haiku/src/types.ts`

Current `UnitFrontmatter` (lines 30-53) has no `model` field. All other fields:

```ts
interface UnitFrontmatter {
  name?: string; type: string; status: string;
  depends_on: string[]; bolt: number; hat: string;
  started_at?: string; completed_at?: string | null;
  stage?: string;          // injected at parse time
  // legacy: last_updated, branch, discipline, pass, workflow, ticket, wireframe, design_ref, deployment, monitoring, operations
}
```

**Change:** Add `model?: string` after `hat: string`. This is a pure additive change — no downstream breakage since it's optional.

## 2. `HatDef` — `packages/haiku/src/studio-reader.ts`

`HatDef` (lines 25-31) **already has `model?: string`** and `readHatDefs` (lines 32-53) **already parses it** from hat frontmatter at line 47:

```ts
model: (data.model as string) || undefined,
```

No hat file currently has a `model:` frontmatter field — the parsing infrastructure is in place but unused. The implementer does **not** need to change `studio-reader.ts` for hat model support.

What **is** missing: `readStageDef` returns `{ data: Record<string, unknown>; body: string }`. The `data` object already contains all STAGE.md frontmatter including any `default_model` if present — but the orchestrator never reads `data.default_model` from the result. No type-level change is needed for `readStageDef`; the orchestrator just needs to extract `data.default_model as string | undefined` from the existing return value.

Similarly, `listStudios` returns `{ name, data, body }[]` — `data` will contain `default_model` from STUDIO.md if present. No change needed to the reader; the orchestrator must look it up.

## 3. Orchestrator — `packages/haiku/src/orchestrator.ts` (lines 1546-1624)

### Current unit data extraction (line 1561-1563)

```ts
const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
unitContent = body
unitRefs = (data.refs as string[]) || []
```

The `data` object is not otherwise used after this block. Adding `data.model as string | undefined` here requires no structural change — just extract it alongside `data.refs`.

### Current hat model extraction (lines 1566-1571)

```ts
// Hat definition (structured — includes agent_type and model)
const hatDefs = readHatDefs(studio, stage)
const hatDef = hatDefs[hat]
const hatContent = hatDef?.content || `No hat definition found for "${hat}"`
const hatAgentType = hatDef?.agent_type || "general-purpose"
const hatModel = hatDef?.model
```

`hatModel` is already extracted. The cascade just needs to be resolved after this block.

### Stage default: already available

`readStageDef(studio, stage)` is called at line 1553 and stored as `stageDef`. Its `data` property is immediately available:

```ts
const stageDef = readStageDef(studio, stage)
// stageDef.data.default_model is available — just unused today
```

### Studio default: requires a lookup

The orchestrator does not currently read the studio's STUDIO.md frontmatter at the `start_unit` path. It does have `studio` in scope (from the intent frontmatter). The implementer needs to call `listStudios()` and find the entry for the current studio, or call `parseFrontmatter(readFileSync(studioFile, "utf8"))` directly.

`listStudios()` is already imported from `studio-reader.ts`. The simpler approach: look for `studioSearchPaths()` and find the STUDIO.md directly — mirrors `readStageDef` pattern.

### Current spawn instructions (lines 1603-1606)

```ts
`Agent type: \`${hatAgentType}\`${hatModel ? ` | Model: \`${hatModel}\`` : ""}\n`
```

This outputs model as prose, not as a structured agent parameter. The unit spec requires this to become:

```
Spawn with `model: "${resolvedModel}"`
```

So the orchestrating agent knows to pass `model` as a named parameter to the Agent tool. When no model is resolved, this line should be omitted entirely.

## 4. Cascade Resolution — Recommended Implementation

```ts
// After extracting unitModel, hatModel, stageDef, studioData:
const unitModel = (data.model as string) || undefined
const stageDefaultModel = (stageDef?.data?.default_model as string) || undefined
// studioDefaultModel: read from STUDIO.md data for the current studio
const resolvedModel = unitModel ?? hatModel ?? stageDefaultModel ?? studioDefaultModel
```

Then in the Mechanics section:

```ts
(resolvedModel ? `Spawn with \`model: "${resolvedModel}"\`\n` : "")
```

This replaces the current prose model mention.

## 5. What Does NOT Need to Change for Unit 01

The unit-01 scope is the **cascade engine** only:

| File | In Scope | Notes |
|------|----------|-------|
| `types.ts` | YES | Add `model?: string` to `UnitFrontmatter` |
| `orchestrator.ts` (start_unit path) | YES | Cascade + explicit spawn instruction |
| `studio-reader.ts` | NO | `HatDef.model` already parsed; `readStageDef` already returns all frontmatter data |
| `state-tools.ts` (unit_list) | NO | That's unit-03 scope |
| `templates/intent-review.ts` | NO | That's unit-03 scope |
| `templates/unit-review.ts` | NO | That's unit-03 scope |
| `hats/elaborator.md` | NO | That's unit-02 scope |

## 6. TypeScript Compilation

The project uses `npx tsc --noEmit` for type checking. The only breaking risk: if `data.model` is accessed before the `existsSync(unitFile)` check — the `data` variable is only in scope inside the `if (existsSync(unitFile))` block at line 1560. The implementer must declare `unitModel` outside that block (defaulting to `undefined`) and assign inside.

## 7. No Test Suite

There are no unit tests for the orchestrator path. The completion criterion "TypeScript compiles without errors" is the only automated check available. Manual smoke testing via `/haiku:start` with a hat that has `model: haiku` in frontmatter would validate end-to-end.

## 8. start_units Path (line 1646)

The parallel `start_units` case spawns one subagent per unit with a prompt that includes the first hat. It does NOT currently pass model to subagents. This path is out of scope for unit-01 per the unit spec, but is worth noting for follow-up: the cascade resolution logic should eventually apply here too.
