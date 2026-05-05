# Schema Definitions

Every shape that crosses a process boundary — MCP tool inputs, MCP tool outputs, frontmatter on disk, the SPA wire payload — gets a real, runtime-checked schema. No hand-rolled validation. No "the handler will catch it." No `args.foo as string` faith-based casts that break two callers downstream.

This rule is non-negotiable because we got burned by it. Every drift between "what the schema says" and "what the handler actually validates" turned into a class of bugs the agent could trip on and a class of footguns users could hit. The fix is one source of truth per shape — TypeBox builders that yield both the JSONSchema runtime check **and** the TypeScript type, never written by hand.

## The two runtimes (and the boundary)

We use exactly two schema runtimes. Use the right one for the right surface.

| Surface                                 | Runtime               | Lives in                                      |
| --------------------------------------- | --------------------- | --------------------------------------------- |
| MCP tool inputs                         | TypeBox + AJV         | `packages/haiku/src/state/schemas/inputs/*.ts`|
| MCP tool outputs                        | TypeBox               | (inline in tool def, or `state/schemas/output-envelope.ts` for shared envelopes) |
| On-disk frontmatter (units, intents, FB)| TypeBox + AJV         | `packages/haiku/src/state/schemas/{unit,intent,feedback,stage-state}.ts` |
| SPA wire payload                        | Zod                   | `packages/haiku-api/src/session.ts`           |
| Settings.yml                            | AJV (raw JSONSchema, legacy) | `plugin/schemas/settings.schema.json`  |

**TypeBox is the default.** Zod stays only where the SPA already lives — different consumer (the React app), no JSONSchema-shape consumers (no MCP runtime to feed). Don't introduce a third runtime.

## TypeBox + AJV pattern (every MCP tool input)

Every MCP tool input schema follows the same five-part recipe. Look at `packages/haiku/src/state/schemas/inputs/units.ts` or `feedback-variants.ts` for canonical examples; the diff between them is just the field shapes.

### 1. One file per concern, one schema per tool

```
state/schemas/
  feedback.ts           # frontmatter shapes that callers reuse (FEEDBACK_STATUSES, FB_ID_PATTERN, etc.)
  unit.ts
  intent.ts
  stage-state.ts
  inputs/
    _validate.ts        # validateToolInput + jsonSchemaOf helpers (don't touch unless extending)
    units.ts            # one schema per haiku_unit_* tool
    intents.ts
    stages.ts
    feedback-variants.ts
    long-tail.ts        # smaller registry / report tools grouped together
```

Per-tool files when the family is large (units = 9 tools, feedback variants = 8). Grouped file when the surface is small and tools share targeting shapes (long-tail = 20 tools, mostly one or two args). Don't fragment the long-tail further — the file count starts hurting more than the per-tool clarity helps.

Add the new schema to `state/schemas/index.ts` (the barrel) so callers `import { HAIKU_FOO_INPUT_SCHEMA } from "./state/schemas"` without thinking about which file owns it.

### 2. TypeBox is the source of truth

```ts
import { type Static, Type } from "@sinclair/typebox"
import { stateAjv } from "../_ajv.js"

export const HAIKU_FOO_INPUT_SCHEMA = Type.Object(
  {
    intent: Type.String({ minLength: 1, description: "Intent slug" }),
    optional_thing: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)
export type HaikuFooInput = Static<typeof HAIKU_FOO_INPUT_SCHEMA>
export const validateHaikuFooInputSchema = stateAjv.compile(
  HAIKU_FOO_INPUT_SCHEMA,
)
```

Three exports per tool, every time. The schema, the `Static<>` type, the compiled validator. No hand-written `interface FooInput {}` next to a hand-written `if (typeof args.intent !== "string")`.

### 3. `additionalProperties: false` on every input

Strict typespec. Unknown fields get rejected at the gate with the stable named code. Drop this and the gate becomes a suggestion — agents can pass garbage and only find out via downstream behavior, which is the bug class we're trying to kill.

The only exception is when the substance validation belongs to a dedicated validator that needs the raw object — e.g. `haiku_unit_write`'s `frontmatter` field stays loose at the gate (`Type.Object({}, { additionalProperties: true })`) so `validateUnitFrontmatter` can run with rich rule-by-rule errors. The reason has to be that specific. "I might want to add a field later" is not the reason.

### 4. Use `enum` on `Type.String`, not `Type.Union(Literals)`

```ts
// good
origin: Type.String({ enum: [...FEEDBACK_ORIGINS] })

// bad — AJV reports N+1 errors for a single failure
origin: Type.Union(FEEDBACK_ORIGINS.map((o) => Type.Literal(o)))
```

`Type.String({ enum: [...] })` produces a single AJV error with `keyword: "enum"`. The union form produces one error per literal. Both `Static<>` correctly to the literal-union type when the source array is `as const`, so there's no TS-side reason to prefer the union form.

### 5. Multi-type values use `Type.Unsafe`

When a field genuinely accepts any JSON value (set-style tools that route the value through a per-field validator after the gate — `haiku_unit_set`, `haiku_intent_set`, `haiku_settings_set`):

```ts
value: Type.Unsafe<unknown>({
  type: ["string", "array", "number", "boolean", "null", "object"],
  description:
    "New value. Must match the field's declared type in <SCHEMA>. Mismatches return `<tool>_field_type_mismatch`.",
}),
```

`Type.Unknown` emits `{}` — no `type` field — which trips the server-tools assertion that every inputSchema property carries a type. JSONSchema's `type: [...]` array form is exactly the right shape; `Type.Unsafe` lets us emit it while keeping `Static<typeof Schema>` working.

## The handler-gate pattern

Every state-tool case starts with the validate-gate. Always.

```ts
case "haiku_foo": {
  const fooInputErr = validateToolInput(
    args,
    validateHaikuFooInputSchema,
    "haiku_foo",
  )
  if (fooInputErr) return fooInputErr
  // ... real handler work, args is now type-safe ...
}
```

`validateToolInput` returns `null` on pass, or a structured MCP error response on miss. The error code is `<toolName>_input_invalid`, the body lists `errors[]` with `path`, `keyword`, `message`, `params` — agents and tests match on the named code, not on prose.

The gate replaces every "if (!args.intent) return missing-arg-error" string. Delete those when the gate goes in. Two paths to the same rejection means two error shapes, which means tests assert against whichever fired and the contract drifts.

## Wire it up

When you add a new tool:

1. Add the TypeBox schema + `Static<>` type + compiled validator in the right file under `state/schemas/inputs/`.
2. Re-export from `state/schemas/index.ts`.
3. In the tool def, set `inputSchema: jsonSchemaOf(HAIKU_FOO_INPUT_SCHEMA)`. The `jsonSchemaOf()` widener is purely a type-level cast (runtime identity) — it keeps TypeBox brand symbols out of the exported `stateToolDefs` array signature so we don't trip TS4023.
4. In the handler case, gate with `validateToolInput(...)` as the **first** line of work.
5. If a test asserts on a prose error string ("intent is required"), update it to assert on the stable named code (`haiku_foo_input_invalid`) and the relevant field path in `errors[]`.

## Stable named error codes

Every error the agent might match on is a stable, lowercase, snake_case named code in the response body's `error` field. The contract is: agents match on `error`, never on `message`. `message` is human-prose and may evolve.

Examples:

- `haiku_feedback_input_invalid` — gate-level shape rejection
- `feedback_not_found` — handler-level semantic miss
- `intent_field_engine_only` — handler-level FSM-protected field
- `frontmatter_validation_failed` — dedicated validator (with rule-by-rule `errors[]`)

Don't introduce a new error code unless agents (or tests) need to distinguish the case from existing codes. Don't reuse a code across two unrelated rejection paths.

## What to do when the gate and the handler disagree

Two cases come up:

**The gate is more strict than the handler.** Trust the gate. Delete the handler's redundant check; the gate already rejected. If a test was asserting on the handler's prose, update the test to the named code.

**The handler is more strict than the gate** (semantic checks the gate can't express — FB lookup, FSM transitions, conditional fields, on-disk state). Keep the handler's check. Both paths return stable named codes; the test asserts on which one it expects.

Never use the handler to "soften" the gate. If the gate is too strict, fix the gate; don't paper over it in the handler.

## Don't

- **Don't** hand-write a parallel TS interface next to a TypeBox schema. `Static<typeof Schema>` is the type. Hand-written interfaces drift.
- **Don't** skip `additionalProperties: false`. The strict typespec is load-bearing.
- **Don't** keep prose error strings in handlers when the AJV gate covers the same rejection. Two paths means two error shapes.
- **Don't** introduce a third schema runtime. TypeBox + AJV for the MCP / on-disk surface, Zod for the SPA wire. That's it.
- **Don't** put schema-adjacent helpers (validators, error-translators) in the barrel (`index.ts`). They live next to their schema.
- **Don't** assume `Type.Unknown()` works as a multi-type value — it emits `{}` and breaks the server-tools assertion. Use `Type.Unsafe<unknown>({ type: [...] })`.
