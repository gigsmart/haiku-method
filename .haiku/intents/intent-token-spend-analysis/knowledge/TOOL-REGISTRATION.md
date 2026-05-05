---
artifact: tool-registration
stage: inception
intent: intent-token-spend-analysis
scope: intent
unit: unit-05-tool-registration-and-validation
---

# Tool Registration and Input Validation

This artifact pins the implementation contract for `haiku_token_spend` at the registration and validation layer. Every decision here is grounded in how existing tools in `packages/haiku/src/state-tools.ts` behave — the implementer should treat this as a recipe, not a proposal.

## Registration Site

**File:** `packages/haiku/src/state-tools.ts`

The `haiku_token_spend` tool entry goes in the `STATE_TOOLS` array (the exported registry array, same file that carries `haiku_dashboard`, `haiku_capacity`, `haiku_reflect`, `haiku_review_open`, etc.). The entry shape mirrors the existing aggregate tools:

```ts
{
  name: "haiku_token_spend",
  description:
    "Returns a structured token-spend analysis for a H·AI·K·U intent — per-intent total, per-stage/hat breakdown, per-subagent (Task spawn) correlation, and per-model split — by reading and correlating Claude Code session jsonl logs at `~/.claude/projects/<project-slug>/*.jsonl`. Works on running and completed intents; degrades gracefully when subagent logs are absent or partial.",
  inputSchema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        description:
          "Intent slug to analyze. When omitted, the tool resolves the intent from the current git branch (mirrors haiku_review_open's resolution rule); when no branch match exists and exactly one intent is active, that intent is used; otherwise an error lists the active intents.",
      },
      project_slug: {
        type: "string",
        description:
          "Override the auto-derived ~/.claude/projects/<project-slug> directory. Defaults to the slug derived from cwd via the same rule the inject-state-file hook uses (leading slash → '-', '/' and '.' → '-'). Pass this when reading logs from a worktree whose cwd doesn't match the originating project root.",
      },
      since: {
        type: "string",
        description:
          "ISO 8601 timestamp. Only events with ts >= since are counted. Defaults to the intent's created_at frontmatter when present, otherwise no lower bound.",
      },
      until: {
        type: "string",
        description:
          "ISO 8601 timestamp. Only events with ts <= until are counted. Defaults to the intent's completed_at when present and the intent is completed, otherwise no upper bound.",
      },
      include_raw_events: {
        type: "boolean",
        description:
          "Experimental. When true, include the per-event token records the analysis was built from in events[]. Off by default to keep responses small. May be removed or restructured without a major version bump.",
      },
    },
    required: [],
  },
  outputSchema: { /* full schema from API-SURFACE.md §outputSchema */ },
}
```

**Description string:** The description registered with `tools/list` is the verbatim string from API-SURFACE.md §Tool description. It is the consumer's first contact with the tool. Drift between this string and API-SURFACE.md is itself a documentation bug.

**Handler dispatch:** The handler is dispatched through `handleStateTool` — the same function that handles all `STATE_TOOLS` entries — with a `case "haiku_token_spend":` branch in the switch.

**Result envelope:** On success, the handler calls `reply(structuredContent)` (the local helper defined at the top of `handleStateTool`), which atomically produces both `content[0].text` (JSON-stringified payload) and `structuredContent` matching the outputSchema. On error, the handler calls `reply(errorObj, { isError: true })` where `errorObj` carries the `error.code`, `error.message`, and optional `error.details` shape from API-SURFACE.md §Error model.

## Codebase Pattern Verification

These are the actual helpers the implementer uses — all confirmed to exist in the current codebase:

| Helper | Source | Used for |
|---|---|---|
| `validateSlugArgs(args)` | `state-tools.ts:7218` | Step 1 slug-shape validation |
| `intentFromCurrentBranch()` | `state-tools.ts:3989` | Step 2 branch-based slug resolution |
| `listVisibleIntents(intentsDir)` | `state-tools.ts:3952` | Step 2 active-intent fallback |
| `intentDir(slug)` | `state-tools.ts` (used pervasively) | Step 3 intent.md existence check |
| `getCurrentBranch()` | `git-worktree.ts:52` (re-exported through `state-tools.ts:51`) | Imported via existing import |
| `reply(payload)` / `reply(payload, { isError: true })` | `handleStateTool` inner function | All returns |
| `pathToSlug(cwd)` | `hooks/inject-state-file.ts:13` — `fsPath.replace(/^\//, "-").replace(/[/.]/g, "-")` | Step 5 project-slug derivation |

**Note on `pathToSlug`:** This function lives in `inject-state-file.ts`. For the handler, copy the two-line transform inline (or extract to a shared utility) rather than importing from the hook file — hook files import from the server, not the other way.

**Note on `TypedHaikuError`:** This class does not currently exist in the codebase. The error-mapping pattern in the unit spec uses it as a typed-throw convention. The implementer must either: (a) create `TypedHaikuError` in a shared location (e.g. `packages/haiku/src/errors.ts`) and import it, or (b) use a discriminated-union alternative. The typed-throw convention itself is load-bearing — the catch-all-to-`internal` rule is Stable — but the class name is Internal.

## Input Validation Sequence

The handler runs these checks in order. First failure short-circuits with the matching Stable error code.

### Step 1 — Slug-shape validation

```ts
if (args.intent !== undefined) {
  const validationError = validateSlugArgs({ intent: args.intent })
  if (validationError) {
    return reply(
      { error: { code: "invalid_slug", message: validationError.content[0].text, details: { cause: validationError.content[0].text } } },
      { isError: true }
    )
  }
}
```

`validateSlugArgs` (line 7218) checks for `/`, `\`, and `..` in slug-typed fields. On match it returns a `{ content, isError }` already formatted — the handler maps this to the `invalid_slug` structured error envelope.

**Open question resolved:** `validateSlugArgs` rejection → `invalid_slug` (not `intent_not_found`). The API-SURFACE error table explicitly calls out path-separator/traversal as the `invalid_slug` case.

### Step 2 — Intent resolution

If `intent` was provided and validated → use it directly.

If `intent` was omitted → auto-resolution:

1. Call `intentFromCurrentBranch()`. If it returns a match (`haiku/<slug>/main` or `haiku/<slug>/<stage>`) → use `slug`.
2. Otherwise: list active intents via `listVisibleIntents(intentsDir, {})` filtered to `status !== "archived"` and `status !== "complete"`. If exactly one → use it. If zero or multiple → return `intent_unresolvable`:

```ts
return reply(
  {
    error: {
      code: "intent_unresolvable",
      message: "Cannot resolve intent: no branch match and multiple (or zero) active intents. Pass `intent` explicitly.",
      details: { candidates: activeIntents.map(i => i.slug) }
    }
  },
  { isError: true }
)
```

### Step 3 — Intent existence

```ts
const iFile = join(intentDir(resolvedSlug), "intent.md")
if (!existsSync(iFile)) {
  return reply(
    { error: { code: "intent_not_found", message: `Intent '${resolvedSlug}' not found.` } },
    { isError: true }
  )
}
```

### Step 4 — Window validation

When `since` or `until` is provided, parse with `new Date(value)`. Reject `NaN`.

```ts
if (args.since !== undefined) {
  const d = new Date(args.since as string)
  if (isNaN(d.getTime())) {
    return reply(
      { error: { code: "invalid_window", message: "`since` is not a valid ISO 8601 timestamp.", details: { cause: "since" } } },
      { isError: true }
    )
  }
}
// same for until
if (since && until && since > until) {
  return reply(
    { error: { code: "invalid_window", message: "`since` must be <= `until`.", details: { cause: "since > until" } } },
    { isError: true }
  )
}
```

### Step 5 — Project-slug resolution

If `project_slug` was provided → use it directly.

If omitted → derive from `process.cwd()` using the same transform as `inject-state-file.ts:13`:

```ts
const derivedSlug = process.cwd().replace(/^\//, "-").replace(/[/.]/g, "-")
```

Verify `join(homedir(), ".claude", "projects", projectSlug)` exists:

```ts
const projectDir = join(homedir(), ".claude", "projects", projectSlug)
if (!existsSync(projectDir)) {
  return reply(
    {
      error: {
        code: "project_logs_missing",
        message: `Project logs directory not found at ~/.claude/projects/${projectSlug}/`,
        details: { derived_slug: derivedSlug, cwd: process.cwd() }
      }
    },
    { isError: true }
  )
}
```

**Open question resolved:** Strip trailing `/` from cwd before applying the transform — matches `inject-state-file.ts` hook behavior (`process.cwd()` does not ordinarily produce trailing slashes on Node, but defensive strip is correct).

### Step 6 — Window-default substitution

```ts
const intentData = parseFrontmatter(readFileSync(iFile, "utf8")).data
const effectiveSince = since ?? (intentData.created_at as string | undefined) ?? undefined
const effectiveUntil = until ?? (intentData.status === "complete" ? (intentData.completed_at as string | undefined) : undefined) ?? undefined
```

No error on absent defaults — the window simply has no lower/upper bound.

### Step 7 — Analysis dispatch

```ts
const result = analyzeTokenSpend({ intent: resolvedSlug, projectSlug, since: effectiveSince, until: effectiveUntil, includeRawEvents })
if (result.coverage.events_parsed === 0) {
  return reply(
    {
      error: {
        code: "no_events_in_window",
        message: `No token events found for intent '${resolvedSlug}' in the specified window.`
      }
    },
    { isError: true }
  )
}
```

Note: `no_events_in_window` is the only validation that happens post-analysis. An empty `events_parsed` means there is literally nothing to report — this is a hard failure for standard calls, not for partial-correlation runs where the caller has already widened the window.

## Error Mapping Pattern

The handler wraps the entire body in a try/catch:

```ts
try {
  // ... validation sequence + analysis
  return reply(structuredContent)
} catch (err) {
  if (err instanceof TypedHaikuError) {
    // explicit typed throws carry one of the six non-internal Stable codes
    return reply(
      { error: { code: err.code, message: err.message, details: err.details } },
      { isError: true }
    )
  }
  // unknown throw → internal
  return reply(
    {
      error: {
        code: "internal",
        message: err instanceof Error ? err.message : String(err),
        details: { cause: err instanceof Error ? err.message : String(err) }
      }
    },
    { isError: true }
  )
}
```

**Contract invariants (both Stable):**

1. The six non-`internal` Stable codes (`intent_not_found`, `intent_unresolvable`, `invalid_slug`, `invalid_window`, `project_logs_missing`, `no_events_in_window`) are reachable ONLY via explicit typed throws inside the validation sequence. Nothing from `analyzeTokenSpend`'s internal I/O reaches the MCP boundary as a named code.
2. `internal` is the catch-all. Its `details.cause` carries a sanitized message. No raw exception object or stack trace crosses the MCP boundary.

## Output Sanity Check

Before calling `reply(structuredContent)` on the success path, the handler asserts the `outputSchema.required` fields are all present and the right type:

```ts
const REQUIRED_OUTPUT_FIELDS = [
  "intent", "project_slug", "window", "coverage",
  "totals", "by_stage", "by_hat", "by_subagent", "by_model", "by_tick", "by_origin"
] as const
for (const field of REQUIRED_OUTPUT_FIELDS) {
  if (!(field in result) || result[field as keyof typeof result] === undefined) {
    throw new Error(`Output schema violation: required field '${field}' missing from analyzeTokenSpend result`)
  }
}
```

A failed assertion throws — caught by the outer try/catch and mapped to `internal`. This is a defense against schema drift between the analyzer's emitted shape and the published contract.

## Stability Tier Classification

| Surface | Tier | Rationale |
|---|---|---|
| Registration pattern (file path `state-tools.ts`, registry array name, handler signature) | **Internal** | We may refactor `state-tools.ts` — split it, rename the array, move tools — without bumping major. The tool name `haiku_token_spend` itself is Stable; where it's registered is not. |
| Exact mapping from validation failure to error code (§Input validation sequence) | **Stable** | This is how the seven Stable error codes are surfaced to consumers. Changing which condition triggers which code (e.g. swapping `invalid_slug` and `intent_not_found`) is a breaking change. |
| Fall-through-to-`internal` rule | **Stable** | Consumers MUST treat unknown codes as `internal`. Any code not in the enumeration reaching the MCP boundary would violate that contract. |
| `TypedHaikuError` class itself | **Internal** | It is an implementation mechanism for the Stable error-mapping rule. The class can be renamed, restructured, or replaced with a discriminated union without bumping major, as long as the Stable error-code table stays unchanged. |

## Open Questions

| Question | Proposed default | Veto window |
|---|---|---|
| Should `validateSlugArgs` rejection produce `invalid_slug` or `intent_not_found`? | **`invalid_slug`** — the API-SURFACE error table explicitly calls out path-separator/traversal as the `invalid_slug` case. | Veto before implementer picks up. |
| Should the project-slug derivation accept a trailing `/` in cwd or strip it first? | **Strip first** — matches `inject-state-file.ts` hook behavior. `process.cwd()` on Node does not normally emit trailing slashes, but defensive strip is correct. | Veto before implementer picks up. |
| Where should `TypedHaikuError` be defined? | **New file `packages/haiku/src/errors.ts`** — keeps it isolated from both state-tools.ts and the hook layer. Exported and imported wherever needed. | Veto before implementer picks up. |

## Quality Gates

```yaml
quality_gates:
  - name: tool-registered
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "registered"
  - name: error-codes-reachable
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "error code"
  - name: output-schema-valid
    command: bun test packages/haiku/test/token-spend-registration.test.mjs --grep "output schema"
```

**What the test file `packages/haiku/test/token-spend-registration.test.mjs` must cover:**

- `haiku_token_spend` appears in `tools/list` with the exact API-SURFACE description string (no drift).
- Each of the seven Stable error codes is reachable via a specific input:
  - `invalid_slug` — pass `intent: "bad/slug"`
  - `intent_unresolvable` — no `intent`, no branch, zero or multiple active intents
  - `intent_not_found` — pass a valid-shaped slug that doesn't exist on disk
  - `invalid_window` — pass `since: "not-a-date"`
  - `invalid_window` (since > until) — pass both with since > until
  - `project_logs_missing` — pass `project_slug` pointing to a non-existent directory
  - `no_events_in_window` — valid intent + project, but window produces zero parsed events
- Unknown input combinations (e.g. `analyzeTokenSpend` throws an unexpected error) produce `internal`, not a raw throw.
- The success result satisfies `outputSchema.required` — all eleven required fields are present.
