---
intent: cascading-model-selection
created: 2026-04-10
status: active
---

# Discovery: Cascading Model Selection

## Problem

H·AI·K·U currently runs every hat on whatever model the parent session uses. This means a trivial rename unit burns the same opus tokens as a complex architectural redesign. There's no mechanism for the system to match model capability to task complexity, leading to unnecessary token spend on simple work.

## Solution

Cascading model resolution where hat definitions set baseline model preferences and the elaborator overrides per-unit based on complexity assessment. Resolution order: `unit.model > hat.model > stage default > studio default > session default`.

## Technical Landscape

### Existing Infrastructure (already in place)

1. **`HatDef.model` field** — `packages/haiku/src/studio-reader.ts:28` already defines `model?: string` on the `HatDef` interface and parses it from hat frontmatter at line 47.

2. **Orchestrator reads `hatModel`** — `packages/haiku/src/orchestrator.ts:1571` already reads `hatDef?.model` and includes it in spawn instructions at line 1606: `Agent type: \`${hatAgentType}\`${hatModel ? \` | Model: \`${hatModel}\`\` : ""}`.

3. **Hat frontmatter** — Hat `.md` files already support YAML frontmatter with `name`, `stage`, `studio`, `agent_type`. Adding `model` is already supported by the reader.

### What's Missing

1. **Unit-level model override** — `UnitFrontmatter` in `packages/haiku/src/types.ts:30` has no `model` field. The orchestrator at line 1561 reads unit frontmatter but doesn't extract a model field or cascade it with the hat model.

2. **Stage/Studio defaults** — `STAGE.md` and `STUDIO.md` frontmatter have no `default_model` field. The studio reader doesn't extract stage-level or studio-level model defaults.

3. **Elaborator instructions** — The `plugin/studios/software/stages/inception/hats/elaborator.md` hat has no guidance on assessing complexity or setting model per unit.

4. **Intent review UI** — `packages/haiku/src/templates/intent-review.ts` renders units with #, Name, Discipline, Status, Dependencies columns. No model column exists.

5. **Unit review UI** — `packages/haiku/src/templates/unit-review.ts:63` shows discipline badge but no model badge.

6. **Dashboard** — `packages/haiku/src/state-tools.ts:838` (`haiku_dashboard`) shows intent status but no model information per unit.

7. **Unit list tool** — `packages/haiku/src/state-tools.ts:529` (`haiku_unit_list`) returns name, status, bolt, hat — no model field.

8. **Spawn instructions not explicit enough** — The orchestrator mentions model in prose but doesn't structure it as a mandatory `model:` parameter in the spawn call. The agent needs to know this is a required Agent tool parameter, not just informational text.

### Entity Inventory

| Entity | Location | Current Fields | Needed |
|--------|----------|---------------|--------|
| `HatDef` | `studio-reader.ts:25` | content, agent_type, model, raw | *(already has model)* |
| `UnitFrontmatter` | `types.ts:30` | name, type, status, depends_on, bolt, hat, discipline, etc. | + `model?: string` |
| `STAGE.md` frontmatter | `studio-reader.ts:12` | name, description, hats, review, unit_types, inputs | + `default_model?: string` |
| `STUDIO.md` frontmatter | `studio-reader.ts:73` | name, description, stages, category | + `default_model?: string` |

### Resolution Cascade

```
unit.model → hat.model → stage.default_model → studio.default_model → (session default)
```

Each level is optional. First non-null value wins. Session default is implicit (whatever the parent process is running).

### Key Files to Modify

| File | Change |
|------|--------|
| `packages/haiku/src/types.ts` | Add `model?: string` to `UnitFrontmatter` |
| `packages/haiku/src/orchestrator.ts` | Resolve model cascade, make spawn instructions explicit |
| `packages/haiku/src/studio-reader.ts` | Read `default_model` from stage and studio frontmatter |
| `packages/haiku/src/state-tools.ts` | Include model in `haiku_unit_list` output |
| `packages/haiku/src/templates/intent-review.ts` | Add Model column to units table |
| `packages/haiku/src/templates/unit-review.ts` | Add model badge |
| `plugin/studios/software/stages/inception/hats/elaborator.md` | Add complexity assessment + model selection guidance |
| `plugin/VALIDATION.md` | Document model cascade behavior |

### Overlap Check

No other active H·AI·K·U branches detected working on these files.
