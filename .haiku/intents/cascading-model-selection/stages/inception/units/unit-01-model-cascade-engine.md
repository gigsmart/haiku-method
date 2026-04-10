---
type: research
depends_on: []
discipline: backend
model: sonnet
---

# Model Cascade Engine

## Scope

Implement the core cascading model resolution system across the type system, studio reader, and orchestrator.

## Deliverables

1. **Type system** — Add `model?: string` to `UnitFrontmatter` in `packages/haiku/src/types.ts`
2. **Studio reader** — Read `default_model` from STAGE.md and STUDIO.md frontmatter in `packages/haiku/src/studio-reader.ts`. Expose via `readStageDef` and `listStudios` return values.
3. **Orchestrator cascade** — In `packages/haiku/src/orchestrator.ts` around line 1571, resolve model with cascade: `unit.model > hat.model > stageDef.default_model > studioDefault`. Read unit frontmatter `model` field at line 1561 where unit data is already parsed.
4. **Explicit spawn instructions** — The orchestrator's Mechanics section (line 1603) must output the resolved model as a mandatory Agent tool parameter, not just informational prose. The spawn instruction must read: `Spawn with \`model: "${resolvedModel}"\`` so the orchestrating agent passes it to the Agent tool's `model` parameter. When no model is resolved (all levels null), omit the model instruction entirely (inherit session default).

## Completion Criteria

- [ ] `UnitFrontmatter` interface includes `model?: string`
- [ ] `readStageDef` returns `default_model` when present in STAGE.md frontmatter
- [ ] Studio reader exposes `default_model` from STUDIO.md frontmatter
- [ ] Orchestrator resolves model cascade: unit > hat > stage > studio
- [ ] Spawn instructions explicitly include `model: "X"` parameter for the Agent tool call when a model is resolved
- [ ] When no model is resolved at any level, no model instruction is emitted (session default inherited)
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)

## References

- `packages/haiku/src/types.ts:30` — UnitFrontmatter
- `packages/haiku/src/studio-reader.ts:25` — HatDef with existing model field
- `packages/haiku/src/orchestrator.ts:1566-1606` — Hat resolution and spawn mechanics
