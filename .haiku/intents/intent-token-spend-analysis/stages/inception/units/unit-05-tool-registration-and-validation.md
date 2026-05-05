---
title: Tool registration and input validation
model: sonnet
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: researcher
started_at: '2026-05-05T13:49:53Z'
hat_started_at: '2026-05-05T13:49:53Z'
iterations:
  - hat: researcher
    started_at: '2026-05-05T13:49:53Z'
    completed_at: null
    result: null
---
# Tool registration and input validation

The api-surface knowledge artifact pins the contract for `haiku_token_spend`. This unit pins how that contract is realized in code: where the tool is registered, how its inputs are validated, how `project_slug` defaults from cwd, and how the outer try/catch maps thrown errors to the seven Stable error codes. Without this unit, the implementer derives input handling from context, and error-code mapping (the most stability-sensitive part of the contract) lands ad-hoc.

## Registration site

- **File:** `packages/haiku/src/state-tools.ts` — the same file that registers `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_intent_get`, etc.
- **Pattern:** the tool is added to the `STATE_TOOLS` registry (or the equivalent registry array exported by that file) with `name: "haiku_token_spend"`, an `inputSchema` matching api-surface §`inputSchema`, and a `handler` function dispatched through `handleStateTool`.
- **Description string:** the description registered with the MCP `tools/list` response is the verbatim string from api-surface §Tool description ("Returns a structured token-spend analysis…"). The string is the consumer's first contact with the tool — drift between this string and the api-surface knowledge artifact is itself a documentation bug.
- **Result envelope:** the handler returns a `CallToolResult` whose `content[0].text` is the JSON-stringified `structuredContent` (matching the convention every other aggregate handler uses via the local `reply()` helper). On error, the handler returns `isError: true` and the `structuredContent.error` shape from api-surface §Error model.

## Input validation sequence

The handler runs these checks in order. The first failure short-circuits with the matching Stable error code from api-surface §Error codes.

1. **Slug-shape validation.** When the `intent` arg is provided, run `validateSlugArgs({ intent })` (the existing helper used by every `haiku_*` tool that accepts a slug). On failure → return `invalid_slug` with `details.cause: "<reason from validateSlugArgs>"`.
2. **Intent resolution.** If `intent` was provided and validated, use it directly. If omitted, run the auto-resolution sequence — same rule as `haiku_review_open` and unit-01's skill behavior:
   1. Parse the current branch via `getCurrentBranch()` (from `packages/haiku/src/git-worktree.ts`). If it matches `haiku/<slug>/main` or `haiku/<slug>/<stage>`, use that slug.
   2. Otherwise list active intents (status != `archived`, status != `complete`). If exactly one → use it. If zero or multiple → return `intent_unresolvable` with `details.candidates: <list of active slugs>`.
3. **Intent existence.** Verify `.haiku/intents/<slug>/intent.md` exists on disk. On failure → return `intent_not_found`.
4. **Window validation.** When `since` or `until` is provided, parse with `Date(value)` and reject `NaN`. When both are provided, require `since <= until`. On failure → return `invalid_window` with `details.cause` naming which arg failed.
5. **Project-slug resolution.** If `project_slug` was provided, use it. Otherwise derive it from `process.cwd()` using the same transform as the `inject-state-file` hook: leading `/` → `-`, then every `/` and `.` → `-`. Verify `~/.claude/projects/<project_slug>/` exists. On failure → return `project_logs_missing` with `details.derived_slug: "<value>"`, `details.cwd: "<value>"`.
6. **Window-default substitution.** If `since` was omitted, use the intent's `created_at` frontmatter; if absent, no lower bound. If `until` was omitted, use `completed_at` for completed intents; otherwise no upper bound.
7. **Analysis dispatch.** Call `analyzeTokenSpend({ intent, projectSlug, since, until, includeRawEvents })`. If the result has zero events (empty `coverage.events_parsed`) → return `no_events_in_window` (this is not a hard failure for partial-correlation runs, only for the case where the entire window had no matching events).

## Error mapping pattern

The handler wraps the entire body in a try/catch:

```ts
try {
  // ... validation sequence + analysis
  return reply(structuredContent)
} catch (err) {
  if (err instanceof TypedHaikuError) {
    // explicit typed throws carry one of the six non-internal Stable codes
    return errorReply(err.code, err.message, err.details)
  }
  // unknown throw → internal
  return errorReply("internal", err instanceof Error ? err.message : String(err), {
    cause: sanitize(err),
  })
}
```

The Stable error codes (`intent_not_found`, `intent_unresolvable`, `invalid_slug`, `invalid_window`, `project_logs_missing`, `no_events_in_window`) are reachable ONLY via explicit typed throws inside the validation sequence. Anything else maps to `internal` — the contract says `internal` is the catch-all and the message can carry a sanitized `cause`. No raw exception reaches the MCP boundary.

## Output sanity check

Before returning the success result, the handler asserts the assembled response satisfies the `outputSchema.required` array — every Stable required field is present and the right type. A failed assertion throws (caught by the outer try/catch and mapped to `internal`). This is a defense against schema drift between the analyzer's emitted shape and the published contract.

## Quality gates

```yaml
quality_gates:
  - name: tool-registered
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "registered"
  - name: error-codes-reachable
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "error code"
  - name: output-schema-valid
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "output schema"
```

The test file `packages/haiku/test/token-spend-registration.test.mjs` (authored in the development stage) covers: (a) `haiku_token_spend` appears in `tools/list` with the exact api-surface description string, (b) each of the seven Stable error codes is reachable via a specific input, (c) unknown input combinations produce `internal` not a raw throw, (d) the success result satisfies `outputSchema.required`.

## Stability tier

- The registration pattern (file path, registry array name, handler signature): **Internal**. We may refactor `state-tools.ts` without bumping major.
- The exact mapping from validation failure to error code (§"Input validation sequence"): **Stable** — it's how the seven Stable error codes are surfaced. Changing which condition triggers which code is breaking.
- The fall-through-to-`internal` rule: **Stable**.

## Open questions

- Should `validateSlugArgs` rejection produce `invalid_slug` or `intent_not_found`? **Proposed default:** `invalid_slug` — the api-surface error table specifically calls out path-separator/traversal as the `invalid_slug` case. Veto-able.
- Should the project-slug derivation accept a trailing `/` in cwd or strip it first? **Proposed default:** strip first (matches `inject-state-file` hook behavior). Veto-able.

## Completion criteria

- §"Registration site" names the file (`packages/haiku/src/state-tools.ts`), the registry pattern, and the description-string-from-api-surface convention.
- §"Input validation sequence" enumerates seven ordered steps with the matching Stable error code per failure path. No `TBD` / `etc.`.
- §"Error mapping pattern" pins the try/catch shape and the typed-throw vs internal-fallthrough rule.
- §"Output sanity check" requires schema validation before return.
- §"Quality gates" lists three executable gate commands targeting a named test file.
- §"Stability tier" classifies the registration pattern as Internal and the error-mapping as Stable, with rationale.
- §"Open questions" lists deferred decisions with proposed defaults.
