# Unit 01 Planner Output — Model Cascade Engine

## Overview

Three files change. One new exported function. Five targeted edits. All changes are
additive or backward-compatible. TypeScript catches any mistakes at compile time.

---

## Change 1 — `packages/haiku/src/types.ts`: Add `model?` to `UnitFrontmatter`

**Lines:** Insert after line 37 (`hat: string;`)

**Change:** Add `model?: string` after the `hat` field declaration:

    hat: string;
    model?: string;       // ADD THIS LINE
    started_at?: string;

**Risk:** None. Pure additive optional field, no downstream breakage.

---

## Change 2 — `packages/haiku/src/studio-reader.ts`: Add `readStudio` export

Add after `readStageDef` (after line 22). Mirrors the exact same pattern:

```ts
/** Read a studio definition file */
export function readStudio(studio: string): { data: Record<string, unknown>; body: string } | null {
  validateIdentifier(studio, "studio")
  for (const base of studioSearchPaths()) {
    const file = join(base, studio, "STUDIO.md")
    if (existsSync(file)) {
      return parseFrontmatter(readFileSync(file, "utf8"))
    }
  }
  return null
}
```

`validateIdentifier`, `studioSearchPaths`, `existsSync`, `readFileSync`, and
`parseFrontmatter` are all already in scope. No new imports needed.

**Risk:** None. Pure new export.

---

## Change 3 — `packages/haiku/src/orchestrator.ts`: Import `readStudio`

**Line 36 (current):**
```ts
import { readStageDef, readHatDefs, readReviewAgentDefs, listStudios, studioSearchPaths } from "./studio-reader.js"
```

**Change:** Add `readStudio` to the named imports:
```ts
import { readStageDef, readStudio, readHatDefs, readReviewAgentDefs, listStudios, studioSearchPaths } from "./studio-reader.js"
```

---

## Change 4 — `packages/haiku/src/orchestrator.ts`: Extract `unitModel`, resolve cascade

**Location:** Inside `case "start_unit": case "continue_unit":` block (~line 1546).

**Step A — Declare `unitModel` before the existsSync guard (lines ~1557-1564).**

TypeScript scoping: `data` only exists inside the `if` block, so `unitModel` must be
declared outside with `let`:

```ts
let unitModel: string | undefined = undefined   // DECLARE BEFORE if block

if (existsSync(unitFile)) {
  const { data, body } = parseFrontmatter(readFileSync(unitFile, "utf8"))
  unitContent = body
  unitRefs = (data.refs as string[]) || []
  unitModel = (data.model as string) || undefined   // ASSIGN INSIDE if block
}
```

**Step B — Read studio default and resolve cascade.**

Insert immediately after line 1571 (`const hatModel = hatDef?.model`):

```ts
// Studio default model
const studioData = readStudio(studio)
const studioDefaultModel = (studioData?.data?.default_model as string) || undefined

// Stage default model
const stageDefaultModel = (stageDef?.data?.default_model as string) || undefined

// Cascade: unit > hat > stage > studio
const resolvedModel = unitModel ?? hatModel ?? stageDefaultModel ?? studioDefaultModel

// Observability: log which level resolved the model
if (resolvedModel) {
  const source =
    unitModel ? "unit" :
    hatModel ? "hat" :
    stageDefaultModel ? "stage" :
    "studio"
  console.error(`[haiku] resolved model: ${resolvedModel} (source: ${source})`)
}
```

**Risk — scoping:** Declare `unitModel` with `let` before the `existsSync` block.
If declared inside, TypeScript will error at the cascade line.

**Risk — null safety:** `studioData` may be `null` if no STUDIO.md found.
Optional chaining `studioData?.data?.default_model` handles this.

---

## Change 5 — `packages/haiku/src/orchestrator.ts`: Replace prose model hint with explicit spawn directive

**Location:** Line 1606 inside the Mechanics `sections.push(...)` call.

**Current:**
```ts
`Agent type: \`${hatAgentType}\`${hatModel ? ` | Model: \`${hatModel}\`` : ""}\n` +
```

**Replacement:**
```ts
`Agent type: \`${hatAgentType}\`\n` +
(resolvedModel ? `Spawn with \`model: "${resolvedModel}"\` — pass this as the Agent tool's \`model:\` parameter.\n` : "") +
```

When `resolvedModel` is `undefined`, no spawn model line is emitted.
When resolved, the directive is explicit — no guessing by the orchestrating agent.

**Risk:** None. `resolvedModel` is in scope at this point.

---

## Execution Order

1. Edit `types.ts` — add `model?` field (1 line).
2. Edit `studio-reader.ts` — add `readStudio` export (~10 lines).
3. Edit `orchestrator.ts` — update import, then unitModel extract+cascade, then spawn directive.
4. Run `cd packages/haiku && npx tsc --noEmit`.
5. Commit.

---

## Verification Steps

**TypeScript compile check** (the only automated gate):
```bash
cd packages/haiku && npx tsc --noEmit
```
Must exit 0 with no output.

**Manual logic checks:**
- All cascade levels undefined → `resolvedModel` undefined → no spawn line. Correct.
- Unit frontmatter `model: claude-haiku-4-5` → `unitModel` wins → spawn line included.
- No unit model, hat has `model: sonnet` in its frontmatter → `hatModel` wins.
- Only STAGE.md has `default_model: sonnet` → `stageDefaultModel` wins.
- Only STUDIO.md has `default_model: opus` → `studioDefaultModel` wins.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `unitModel` declared inside `if` block → TS scoping error | High if careless | Declare `let` before the block, assign inside |
| `readStudio` not exported | Low | Include `export` keyword |
| `studioData` is null | Possible | Optional chaining handles it |
| Empty string treated as defined | Low | `(value as string) \|\| undefined` coerces `""` to undefined |
| `console.error` polluting tool output | Minimal | Goes to stderr; acceptable for observability |
| Existing tests breaking | None | No test suite for this path |

---

## Files to Touch (Summary)

| File | Change | Nature |
|------|--------|--------|
| `packages/haiku/src/types.ts` | Add `model?: string` after `hat: string` (~line 38) | 1 line insert |
| `packages/haiku/src/studio-reader.ts` | Add `readStudio` export after `readStageDef` (after line 22) | ~10 lines |
| `packages/haiku/src/orchestrator.ts` | Update import (L36), scoped unitModel (L1557-1564), cascade block (after L1571), spawn directive (L1606) | 4 targeted edits |
