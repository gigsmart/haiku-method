---
type: research
depends_on: []
discipline: backend
model: sonnet
---

# Model Cascade Engine

## Scope

Implement the core cascading model resolution system across the type system, studio reader, and orchestrator. Does NOT include UI display (unit-03) or elaborator hat guidance (unit-02).

## Deliverables

1. **Type system** — Add `model?: string` to `UnitFrontmatter` interface in `packages/haiku/src/types.ts` (line 30).

2. **Unit model extraction** — In `packages/haiku/src/orchestrator.ts` at the unit frontmatter parse block (lines 1560-1563), extract `const unitModel = (data.model as string) || undefined` from the already-parsed `data` object alongside the existing `unitRefs` extraction.

3. **Studio reader — stage default** — `readStageDef` already returns `{ data, body }` where `data` contains all STAGE.md frontmatter. No reader change needed for stages — the orchestrator reads `stageDef?.data?.default_model`. However, add a `readStudio(studio: string)` function to `packages/haiku/src/studio-reader.ts` that reads a single studio's STUDIO.md and returns `{ data, body } | null`, mirroring `readStageDef`. Export it so the orchestrator can call it without iterating all studios.

4. **Orchestrator cascade** — After extracting `unitModel` and `hatModel` (already at line 1571), compute:
   ```typescript
   const stageDefault = (stageDef?.data?.default_model as string) || undefined
   const studioData = readStudio(studio)
   const studioDefault = (studioData?.data?.default_model as string) || undefined
   const resolvedModel = unitModel ?? hatModel ?? stageDefault ?? studioDefault
   ```

5. **Explicit spawn instruction** — Replace the current prose model hint in the Mechanics section (line 1605: `Agent type: \`${hatAgentType}\`${hatModel ? \` | Model: \`${hatModel}\`\` : ""}`) with a structured spawn block. When `resolvedModel` is set, the spawn line must read:
   ```
   Spawn with `model: "${resolvedModel}"` — pass this as the Agent tool's `model:` parameter.
   ```
   When `resolvedModel` is undefined, omit the model line entirely so the subagent inherits the session default.

## Completion Criteria

- [ ] `UnitFrontmatter` in `packages/haiku/src/types.ts` includes `model?: string`
- [ ] `readStudio(studio)` function exists in `packages/haiku/src/studio-reader.ts`, exported, reads STUDIO.md using the same search paths as `readStageDef`
- [ ] Orchestrator extracts `unitModel` from unit frontmatter `data` at the same location it extracts `unitRefs`
- [ ] Orchestrator resolves `resolvedModel` using: `unitModel ?? hatModel ?? stageDefault ?? studioDefault`
- [ ] When `resolvedModel` is set, spawn instruction includes `Spawn with \`model: "${resolvedModel}"\`` (exact phrasing so orchestrating agent passes it to the Agent tool `model:` parameter)
- [ ] When `resolvedModel` is undefined, no model line is emitted in spawn instructions
- [ ] `npx tsc --noEmit` passes with zero errors in `packages/haiku/`

## Out of Scope

- UI display of model in review templates or dashboard (unit-03)
- Elaborator guidance for complexity assessment (unit-02)
- Adding `default_model` to any actual STAGE.md or STUDIO.md files (those are content files, not this unit's responsibility)

## References

- `packages/haiku/src/types.ts:30` — `UnitFrontmatter` interface (confirmed: line 30)
- `packages/haiku/src/studio-reader.ts:25` — `HatDef` interface with existing `model?: string` field
- `packages/haiku/src/studio-reader.ts:11-21` — `readStageDef` — pattern to mirror for `readStudio`
- `packages/haiku/src/orchestrator.ts:1557-1571` — Unit frontmatter parse + hat model extraction
- `packages/haiku/src/orchestrator.ts:1600-1606` — Mechanics section / spawn instruction to update
