---
depends_on: []
discipline: backend
model: sonnet
status: completed
bolt: 1
hat: reviewer
started_at: '2026-04-11T01:22:51Z'
hat_started_at: '2026-04-11T01:32:20Z'
completed_at: '2026-04-11T01:35:18Z'
---

# Model Cascade Engine — Implementation

## Scope

Implement the cascading model resolution system: type update, studio reader addition, orchestrator cascade logic, and explicit spawn instructions.

## Deliverables

1. Add `model?: string` to `UnitFrontmatter` in `packages/haiku/src/types.ts`
2. Add `readStudio(studio)` function to `packages/haiku/src/studio-reader.ts` — mirrors `readStageDef`, reads a single STUDIO.md, returns `{ data, body } | null`
3. In `packages/haiku/src/orchestrator.ts` at the unit frontmatter parse block (~line 1561), extract `unitModel` from `data.model`
4. Compute `resolvedModel = unitModel ?? hatModel ?? stageDefault ?? studioDefault` using `readStageDef` and `readStudio`
5. Replace the prose model hint in the Mechanics spawn section with: `Spawn with \`model: "${resolvedModel}"\` — pass this as the Agent tool's \`model:\` parameter.` when resolvedModel is set; omit entirely when undefined
6. Add a log line in the spawn output showing the resolved model and which cascade level it came from (for observability)

## Completion Criteria

- [x] `UnitFrontmatter` in `types.ts` includes `model?: string`
- [x] `readStudio(studio)` function exists in `studio-reader.ts`, exported
- [x] Orchestrator extracts `unitModel` from unit frontmatter `data`
- [x] Orchestrator resolves `resolvedModel` using nullish coalescing cascade
- [x] Spawn instructions include explicit `model:` parameter directive when resolved
- [x] No model line emitted when resolvedModel is undefined
- [x] Resolved model source logged for observability
- [x] `npx tsc --noEmit` passes in `packages/haiku/`

## References

- `packages/haiku/src/types.ts:30` — UnitFrontmatter
- `packages/haiku/src/studio-reader.ts:11-21` — readStageDef pattern to mirror
- `packages/haiku/src/orchestrator.ts:1557-1606` — hat resolution and spawn mechanics
- `.haiku/intents/cascading-model-selection/knowledge/unit-01-implementation-notes.md` — detailed implementation notes
