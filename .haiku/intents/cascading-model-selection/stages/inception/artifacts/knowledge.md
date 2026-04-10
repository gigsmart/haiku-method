# Discovery Document: Cascading Model Selection

## Problem Statement

H·AI·K·U currently runs every hat on whatever model the parent session uses. A trivial rename unit burns the same tokens as a complex architectural redesign. There's no mechanism to match model capability to task complexity, leading to unnecessary token spend on simple work.

## Goal

Implement cascading model resolution so hat definitions set baseline model preferences and the elaborator overrides per-unit based on complexity assessment. Resolution order: `unit.model > hat.model > stage default > studio default > session default`. Model selections must be visible in the intent review UI and browse views.

## Domain Model

```
Unit frontmatter (model?: string)
  ↓ first non-null wins
Hat definition frontmatter (model?: string)
  ↓
STAGE.md frontmatter (default_model?: string)
  ↓
STUDIO.md frontmatter (default_model?: string)
  ↓
Session default (implicit — whatever the parent process is running)
```

## Technical Landscape

### Existing Infrastructure (already in place)

- **`HatDef.model`** — `packages/haiku/src/studio-reader.ts:28` already defines `model?: string` and parses it from hat frontmatter at line 47
- **Orchestrator reads `hatModel`** — `packages/haiku/src/orchestrator.ts:1571` already extracts `hatDef?.model`; it appears in spawn instructions as prose, not as a structured parameter
- **`readStageDef` returns all frontmatter** — `data.default_model` is already available from the return value; the orchestrator just doesn't read it yet

### What's Missing

1. **`UnitFrontmatter` has no `model` field** — `packages/haiku/src/types.ts:30–53` needs `model?: string`
2. **Orchestrator cascade** — Unit model not extracted; no cascade resolution logic; spawn instruction not structured as an explicit `model:` parameter
3. **Elaborator instructions** — `plugin/studios/software/stages/inception/hats/elaborator.md` has no complexity assessment or model assignment guidance
4. **Intent review UI** — `packages/haiku/src/templates/intent-review.ts` has no Model column (5 cols today; needs 6)
5. **Unit review UI** — `packages/haiku/src/templates/unit-review.ts:63` has no model badge
6. **`statusColors`** — `packages/haiku/src/templates/styles.ts` has no color entries for `opus`, `sonnet`, `haiku`
7. **Dashboard** — `haiku_dashboard` doesn't enumerate unit models
8. **Unit list tool** — `haiku_unit_list` doesn't include `model` in returned objects

## Unit Map

### unit-01-model-cascade-engine (backend, sonnet)

Core cascade resolution in the orchestrator. Changes:
- Add `model?: string` to `UnitFrontmatter` in `packages/haiku/src/types.ts`
- Extract `unitModel` from unit frontmatter in `packages/haiku/src/orchestrator.ts`
- Resolve cascade (`unitModel ?? hatModel ?? stageDefaultModel ?? studioDefaultModel`)
- Replace prose model mention in spawn instructions with structured `model: "${resolvedModel}"` parameter

### unit-02-elaborator-model-guidance (documentation, sonnet)

Single-file update to `plugin/studios/software/stages/inception/hats/elaborator.md`:
- Add Model Assignment section requiring `model:` in every unit spec
- Define three complexity tiers (opus/sonnet/haiku) with concrete signals
- Decision heuristic: start at `sonnet`, justify up to `opus` or down to `haiku`
- Anti-patterns: MUST NOT default all units to opus, MUST NOT leave model unset

Only the software/inception/elaborator hat qualifies — confirmed by exhaustive survey of all 21 studios.

### unit-03-ui-model-display (frontend, sonnet)

Surface model in all user-facing views:
- `packages/haiku/src/templates/styles.ts` — add `opus` (purple), `sonnet` (blue), `haiku` (green) entries to `statusColors`
- `packages/haiku/src/templates/tailwind-generated.ts` — verify/add purple Tailwind classes
- `packages/haiku/src/templates/intent-review.ts` — add Model column (colspan 5→6, em-dash for unset)
- `packages/haiku/src/templates/unit-review.ts` — add model badge (conditional on model being set)
- `packages/haiku/src/state-tools.ts` — add `model` to `haiku_unit_list` returned object; add per-unit model listing in `haiku_dashboard` stage loop

## Key Risks

- **Tailwind purge** — Purple classes may not be in `tailwind-generated.ts`; must verify before deploying badges
- **`UnitFrontmatter` dependency** — unit-03 UI templates reference `unit.frontmatter.model`; this requires unit-01's type change to be in place first
- **Spawn parameter format** — The orchestrator currently emits model as prose; changing to a structured parameter may affect how subagents interpret their spawn prompt; test end-to-end after unit-01 implementation
- **`start_units` parallel path** — `orchestrator.ts:1646` spawns units in parallel but doesn't pass model to subagents; this path is out of scope for this intent but warrants a follow-up

## Key File Paths

| File | Unit | Change |
|------|------|--------|
| `packages/haiku/src/types.ts:30–53` | 01 | Add `model?: string` to `UnitFrontmatter` |
| `packages/haiku/src/orchestrator.ts:1546–1624` | 01 | Cascade resolution + structured spawn instruction |
| `plugin/studios/software/stages/inception/hats/elaborator.md` | 02 | Model Assignment section |
| `packages/haiku/src/templates/styles.ts:7–12` | 03 | Add opus/sonnet/haiku statusColors entries |
| `packages/haiku/src/templates/tailwind-generated.ts` | 03 | Verify/add purple classes |
| `packages/haiku/src/templates/intent-review.ts:103–145` | 03 | Add Model column, colspan 5→6 |
| `packages/haiku/src/templates/unit-review.ts:60–64` | 03 | Add model badge |
| `packages/haiku/src/state-tools.ts:529–537` | 03 | Add model to haiku_unit_list |
| `packages/haiku/src/state-tools.ts:838–868` | 03 | Add unit model listing to haiku_dashboard |
