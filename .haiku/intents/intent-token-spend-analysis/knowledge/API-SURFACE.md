# API Surface

The public contract for the new token-spend-analysis MCP tool. The surface is a single new tool, `haiku_token_spend`, registered alongside the existing `haiku_*` registry in `packages/haiku/src/state-tools.ts` (definition) and dispatched through `handleStateTool` in the same file. The output is structured data (`structuredContent` per MCP 2025-06-18 §Tool Result), with a serialized JSON `text` block for backwards compatibility — matching the convention every other aggregate tool (`haiku_dashboard`, `haiku_capacity`, `haiku_reflect`) already follows via the local `reply()` helper.

The contract below is the canonical reference. Once shipped, every signature, field name, status enum, and error code listed here is part of the semver-stable surface unless explicitly marked Experimental or Internal.

## Target Consumers

Two concrete callers drive this surface. Both live inside the H·AI·K·U MCP boundary; there is no external library consumer.

1. **The orchestrator / hat subagent mid-run.** Calls `haiku_token_spend` programmatically to inform routing decisions before the next bolt dispatch (e.g. "the last bolt of `implementer` spent 4× the median on Opus output; route the next one to Sonnet"). Needs structured JSON, small response, no UI surface. Drives the `include_raw_events: false` default and the bias toward terse `coverage` diagnostic.
2. **The human running an intent via the `/haiku:burn` skill.** Receives the same structured response rendered by the SPA at `/intents/{slug}/burn`. Needs the coverage diagnostic surfaced prominently as a banner, plus exportable JSON / Markdown so the report can be shared or re-fed back into a later agent conversation. Drives the SPA contract (unit-01) and the export contract (unit-04).

## Public Entry Points

### Tool: `haiku_token_spend`

One MCP tool. No CLI. No HTTP route. The agent (or any MCP client) invokes it via `tools/call`; the response carries the analysis as both `structuredContent` and a JSON text block.

**Description (from registry):**
> Returns a structured token-spend analysis for a H·AI·K·U intent — per-intent total, per-stage/hat breakdown, per-subagent (Task spawn) correlation, and per-model split — by reading and correlating Claude Code session jsonl logs at `~/.claude/projects/<project-slug>/*.jsonl`. Works on running and completed intents; degrades gracefully when subagent logs are absent or partial.

#### `inputSchema`

```ts
{
  type: "object",
  properties: {
    intent: {
      type: "string",
      description:
        "Intent slug to analyze. When omitted, the tool resolves the intent from the current git branch (mirrors haiku_review_open's resolution rule); when no branch match exists and exactly one intent is active, that intent is used; otherwise an error lists the active intents."
    },
    project_slug: {
      type: "string",
      description:
        "Override the auto-derived ~/.claude/projects/<project-slug> directory. Defaults to the slug derived from cwd via the same rule the inject-state-file hook uses (leading slash → '-', '/' and '.' → '-'). Pass this when reading logs from a worktree whose cwd doesn't match the originating project root."
    },
    since: {
      type: "string",
      description:
        "ISO 8601 timestamp. Only events with ts >= since are counted. Defaults to the intent's created_at frontmatter when present, otherwise no lower bound."
    },
    until: {
      type: "string",
      description:
        "ISO 8601 timestamp. Only events with ts <= until are counted. Defaults to the intent's completed_at when present and the intent is completed, otherwise no upper bound."
    },
    include_raw_events: {
      type: "boolean",
      description:
        "Experimental. When true, include the per-event token records the analysis was built from in events[]. Off by default to keep responses small. May be removed or restructured without a major version bump.",
    },
  },
  required: []
}
```

#### `outputSchema` (Stable)

```ts
{
  type: "object",
  properties: {
    intent: { type: "string", description: "Echoed intent slug." },
    project_slug: { type: "string", description: "Echoed/derived project slug used to locate jsonl files." },
    window: {
      type: "object",
      properties: {
        since: { type: ["string", "null"] },
        until: { type: ["string", "null"] },
      },
      required: ["since", "until"],
    },
    coverage: {
      type: "object",
      description:
        "Diagnostic about source completeness. Consumers should surface this — degraded coverage is a normal operating state, not an error.",
      properties: {
        parent_session_files: { type: "integer", description: "Number of parent session jsonl files matched and parsed." },
        subagent_session_files: { type: "integer", description: "Number of Task-subagent jsonl files matched and parsed." },
        events_parsed: { type: "integer" },
        events_skipped_unparseable: { type: "integer" },
        events_skipped_no_usage: { type: "integer" },
        events_skipped_duplicate: { type: "integer", description: "Events that had all three id fields (session_id, message_id, request_id) and a token-bearing usage block, but whose fingerprint was already counted in this analysis invocation. Non-zero signals that the input had replayed messages and dedup is doing real work." },
        subagent_correlation: {
          type: "string",
          enum: ["full", "partial", "none"],
          description:
            "full = every Task spawn observed in parent logs has a matching subagent jsonl. partial = at least one missing. none = no subagent jsonl files found at all.",
        },
        unmatched_subagent_sessions: {
          type: "array",
          items: { type: "string" },
          description: "Subagent session ids found on disk but not referenced from any observed parent Task spawn.",
        },
      },
      required: [
        "parent_session_files",
        "subagent_session_files",
        "events_parsed",
        "events_skipped_unparseable",
        "events_skipped_no_usage",
        "events_skipped_duplicate",
        "subagent_correlation",
      ],
    },
    totals: { "$ref": "#/definitions/SpendBucket" },
    by_stage: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stage: { type: "string" },
          spend: { "$ref": "#/definitions/SpendBucket" },
        },
        required: ["stage", "spend"],
      },
    },
    by_hat: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stage: { type: "string", description: "Stage the hat ran in (hats are stage-scoped per architecture)." },
          hat: { type: "string" },
          spend: { "$ref": "#/definitions/SpendBucket" },
        },
        required: ["stage", "hat", "spend"],
      },
    },
    by_subagent: {
      type: "array",
      description:
        "One row per Task dispatch. Parent + spawned tokens are summed into spend; the parent_only and subagent_only sub-buckets let consumers see the split when needed.",
      items: {
        type: "object",
        properties: {
          dispatch_id: {
            type: "string",
            description:
              "Stable id derived from {parent_session_id}:{tool_use_id}. Same dispatch always produces the same id.",
          },
          parent_session_id: { type: "string" },
          subagent_session_id: { type: ["string", "null"], description: "Null when correlation failed." },
          unit: { type: ["string", "null"] },
          stage: { type: ["string", "null"] },
          hat: { type: ["string", "null"] },
          bolt: { type: ["integer", "null"] },
          prompt_file: {
            type: ["string", "null"],
            description: "Absolute path to the haiku-prompts/<session>/<unit>-<hat>-<bolt>.prompt.md when reconstructible.",
          },
          spend: { "$ref": "#/definitions/SpendBucket" },
          parent_only: { "$ref": "#/definitions/SpendBucket" },
          subagent_only: { "$ref": "#/definitions/SpendBucket" },
        },
        required: ["dispatch_id", "parent_session_id", "spend", "parent_only", "subagent_only"],
      },
    },
    by_model: {
      type: "array",
      items: {
        type: "object",
        properties: {
          model: { type: "string", description: "Family-normalized: opus | sonnet | haiku | <raw> for unknown." },
          model_id_raw: { type: "string", description: "First raw model id observed in this bucket." },
          spend: { "$ref": "#/definitions/SpendBucket" },
        },
        required: ["model", "model_id_raw", "spend"],
      },
    },
    by_tick: {
      type: "array",
      description:
        "One row per haiku_run_next call (a 'tick'). Tick boundary source is the `event: \"run_next\"` records in `haiku.jsonl` written by `logSessionEvent` in `packages/haiku/src/session-metadata.ts`. Numbering is sequential across the intent's lifetime, derived from the ordering of those events for the intent.",
      items: {
        type: "object",
        properties: {
          tick_number: { type: "integer", description: "Sequential, 0-based, monotonically increasing across the intent lifetime. tick_number=0 is the synthetic 'pre-intent' tick (any messages before the first haiku_run_next call)." },
          action: {
            type: "string",
            description:
              "Orchestrator action returned by haiku_run_next for this tick. Stable display anchors: 'elaborate' | 'execute' | 'review_fix' | 'gate' | 'integrate_fix_chains' | 'intent_completion_review' | 'intent_completion_fix' | 'feedback_dispatch' | 'feedback_triage' | 'start_stage' | 'advance_phase' | 'complete' | 'pre-intent' (synthetic). Unknown action strings fall through to 'other' rendering.",
          },
          stage: { type: ["string", "null"], description: "Stage the action targeted; null for intent-scope actions (e.g. intent_completion_review)." },
          started_at: { type: "string", description: "ISO 8601 timestamp from the run_next event in haiku.jsonl. Stored at write time, not recomputed at analysis time — stable across re-runs." },
          ended_at: { type: ["string", "null"], description: "ISO 8601 timestamp of the next tick's started_at, or null for the most recent tick." },
          spend: { "$ref": "#/definitions/SpendBucket" },
        },
        required: ["tick_number", "action", "started_at", "spend"],
      },
    },
    by_origin: {
      type: "array",
      description:
        "Aggregate spend split by who/what produced the tokens. Stable enum values: 'user' | 'agent' | 'engine'. Adding a value at the end is non-breaking; renaming or removing one is breaking.",
      items: {
        type: "object",
        properties: {
          origin: { type: "string", enum: ["user", "agent", "engine"] },
          spend: { "$ref": "#/definitions/SpendBucketCore" },
        },
        required: ["origin", "spend"],
      },
    },
    events: {
      type: "array",
      description: "Experimental — only present when include_raw_events=true. Shape may change without a major bump.",
      items: { "$ref": "#/definitions/RawEvent" },
    },
  },
  required: [
    "intent",
    "project_slug",
    "window",
    "coverage",
    "totals",
    "by_stage",
    "by_hat",
    "by_subagent",
    "by_model",
    "by_tick",
    "by_origin",
  ],

  definitions: {
    SpendBucketCore: {
      type: "object",
      description: "The base spend shape with no recursive origin breakdown. Used inside SpendBucket.by_origin and inside by_origin[] rows so origin slices don't recurse infinitely.",
      properties: {
        input_tokens: { type: "integer" },
        output_tokens: { type: "integer" },
        cache_creation_input_tokens: { type: "integer" },
        cache_read_input_tokens: { type: "integer" },
        total_tokens: {
          type: "integer",
          description: "Sum of input + output + cache_creation + cache_read. Convenience field; consumers MAY recompute.",
        },
        message_count: { type: "integer", description: "Number of assistant messages contributing to this bucket." },
      },
      required: [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
        "total_tokens",
        "message_count",
      ],
    },
    SpendBucket: {
      type: "object",
      properties: {
        input_tokens: { type: "integer" },
        output_tokens: { type: "integer" },
        cache_creation_input_tokens: { type: "integer" },
        cache_read_input_tokens: { type: "integer" },
        total_tokens: {
          type: "integer",
          description: "Sum of input + output + cache_creation + cache_read. Convenience field; consumers MAY recompute.",
        },
        message_count: { type: "integer", description: "Number of assistant messages contributing to this bucket." },
        by_origin: {
          type: "object",
          description: "Optional per-origin slice of this bucket. Omitted when zero on every origin. Keys with zero spend are omitted, never present-but-zero.",
          properties: {
            user: { "$ref": "#/definitions/SpendBucketCore" },
            agent: { "$ref": "#/definitions/SpendBucketCore" },
            engine: { "$ref": "#/definitions/SpendBucketCore" },
          },
        },
      },
      required: [
        "input_tokens",
        "output_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
        "total_tokens",
        "message_count",
      ],
    },
    RawEvent: {
      type: "object",
      properties: {
        ts: { type: "string" },
        session_id: { type: "string" },
        role: { type: "string" },
        model_id_raw: { type: "string" },
        model: { type: "string" },
        usage: { "$ref": "#/definitions/SpendBucket" },
        dispatch_id: { type: ["string", "null"] },
        stage: { type: ["string", "null"] },
        hat: { type: ["string", "null"] },
        unit: { type: ["string", "null"] },
        bolt: { type: ["integer", "null"] },
      },
      required: ["ts", "session_id", "model_id_raw", "model", "usage"],
    },
  },
}
```

#### Purpose of each entry-point field

- **`intent`** — which intent the analysis applies to. Echoing it lets consumers route results when a single agent call analyzes several intents in sequence.
- **`project_slug`** — the directory under `~/.claude/projects/` whose `*.jsonl` files were read. Echoing it lets consumers verify the right project was used (worktree cwd ambiguity is a real failure mode).
- **`window`** — the time bound applied. Defaults make "spend for this completed intent" the natural one-line call.
- **`coverage`** — the source-completeness diagnostic. Required so consumers can render "partial / degraded" UI without making a second call to figure out why.
- **`totals` / `by_stage` / `by_hat` / `by_subagent` / `by_model`** — the four side-by-side breakdowns the goal calls for. Each shares a single `SpendBucket` shape so a renderer that handles totals handles every other view.
- **`events`** — Experimental escape hatch; off by default; lets advanced consumers do their own grouping without round-tripping through the file system.

### Companion exports (Internal)

These are not part of the public MCP surface but are exported from `packages/haiku/src/token-spend.ts` for unit tests and for future programmatic use inside the workflow engine. They are **Internal** by the rules below — not for consumer code, no semver guarantee.

```ts
export interface SpendBucket { /* mirrors definitions/SpendBucket above */ }

export interface TokenSpendOptions {
  intent: string
  projectSlug?: string
  since?: string
  until?: string
  includeRawEvents?: boolean
}

export interface TokenSpendReport { /* mirrors outputSchema above */ }

export function analyzeTokenSpend(opts: TokenSpendOptions): TokenSpendReport
```

## Error Model

### Mechanism

Errors follow the shape every other `haiku_*` tool already uses: a `CallToolResult` whose `isError` is true and whose `content[0].text` is a human-readable message. There are no thrown exceptions across the MCP boundary — internal throws are caught in `handleStateTool`'s outer try/catch (mirrors existing handler convention) and converted to `isError` results. This is the surface contract for consumers.

When `structuredContent` is present on an error result, it carries a structured `error` object. `structuredContent` shape on errors:

```ts
{
  error: {
    code: "<ErrorCode>",      // see enumeration below
    message: string,           // same string as content[0].text
    details?: unknown,         // optional; shape is per-code, opaque to consumers
  }
}
```

### Error codes (Stable enumeration)

| Code | Meaning | Recoverable by consumer? |
|---|---|---|
| `intent_not_found` | The resolved intent slug has no `intent.md` on disk. | Yes — pick a different intent. |
| `intent_unresolvable` | No `intent` arg, no branch match, and not exactly one active intent. `details.candidates: string[]` lists active slugs. | Yes — pass `intent` explicitly. |
| `invalid_slug` | `intent` arg failed `validateSlugArgs` (path separators / traversal). | Yes — fix the slug. |
| `invalid_window` | `since` or `until` failed ISO 8601 parse, or `since > until`. | Yes — fix the timestamps. |
| `project_logs_missing` | `~/.claude/projects/<project-slug>/` does not exist. | Sometimes — pass `project_slug` explicitly when running in a worktree. |
| `no_events_in_window` | Logs exist but contained zero matching events for this intent in the window. | Yes — widen the window or check the intent ran with telemetry on. |
| `internal` | Catch-all for unexpected I/O or parse failures. `details.cause` carries a sanitized message. | Sometimes — retry, or report. |

Partial / degraded reads do **not** raise an error. A run with missing subagent jsonl files returns a normal report with `coverage.subagent_correlation: "partial"` (or `"none"`). This is by design — the goal explicitly says "degrade gracefully when subagent logs are absent or partial."

### Stability of the error model

`code` values listed above are part of the public contract. Adding a new code is a non-breaking change; renaming, removing, or reusing one is breaking. `message` is best-effort human text — consumers MUST NOT pattern-match against it. `details` shape is per-code; only fields documented above (`candidates`, `cause`) are stable.

## Extension Points

`haiku_token_spend` is a leaf tool — there are no plugins, middleware, or subclassing hooks. The only customization seams are the public input fields described above. Three lower-tier extension points exist; consumers and operators should know which ones they may rely on.

| Extension point | Tier | Stability notes |
|---|---|---|
| `project_slug` arg | Stable | Documented escape hatch for non-default cwd-to-project mapping. |
| `since` / `until` args | Stable | Documented window override. Default-resolution behavior (intent's `created_at` / `completed_at` frontmatter) is also stable. |
| `include_raw_events` arg + `events[]` field | Experimental | Off by default. May be removed or replaced with a separate `haiku_token_spend_events` tool without a major version bump. Consumers building dashboards SHOULD use `by_*` aggregates instead. |
| `_session_context` injection | Internal | Used by the `inject-state-file` hook; not part of the consumer-facing surface. Identical to every other `haiku_*` tool; documented here only because the same hook drives the project-slug default. |
| Internal `analyzeTokenSpend()` export | Internal | For tests and intra-package use. No semver. Consumers MUST go through MCP. |
| Source jsonl file format | Not ours | The `~/.claude/projects/<slug>/*.jsonl` schema is owned by Claude Code, not by this library. We read it; we do not specify it. Format drift is a known fragility (see Boundary Notes). |

## Semver Policy

This tool joins the existing `haiku_*` MCP surface and inherits the H·AI·K·U plugin's semver discipline.

### What constitutes a breaking change

For `haiku_token_spend` specifically, every one of the following is a major-version-eligible breaking change:

- Removing or renaming the tool itself.
- Removing or renaming any required field of `outputSchema` (`intent`, `project_slug`, `window`, `coverage`, `totals`, `by_stage`, `by_hat`, `by_subagent`, `by_model`).
- Removing or renaming any required field of `SpendBucket` (the six counters + `message_count`).
- Removing or renaming any required field on rows inside `by_stage` / `by_hat` / `by_subagent` / `by_model`.
- Changing the type of any of the above (e.g. `total_tokens` integer → string).
- Removing or renaming any of the **Stable** error codes in the table above.
- Tightening accepted input — e.g. making `intent` required, or rejecting an ISO timestamp shape that previously parsed.
- Changing the default time window in a way that produces a different report for the same inputs (yes, this is breaking — silent drift in totals is exactly the failure mode this contract exists to prevent).
- Changing the model-family normalization rule for `by_model[].model` — collapsing what was two buckets into one, or splitting one into two.
- Changing the `dispatch_id` derivation rule. Consumers may persist these for trend tracking; rotating the formula invalidates every stored id.
- Removing or renaming any of the four `coverage` counters (`events_parsed`, `events_skipped_unparseable`, `events_skipped_no_usage`, `events_skipped_duplicate`), or violating the partition invariant (`total_lines_read == events_parsed + events_skipped_unparseable + events_skipped_no_usage + events_skipped_duplicate`).
- Changing the "first occurrence wins" dedup rule or removing the lexicographic file-list sort guarantee. Both are load-bearing for byte-identity determinism (unit-04 guarantee).

### What is **not** a breaking change

- Adding new optional input fields.
- Adding new optional output fields.
- Adding a new value to the **end** of the `coverage.subagent_correlation` enum (consumers MUST treat unknown enum values as a fall-through, not a hard error).
- Adding a new `error.code` value (consumers MUST treat unknown codes as `internal`).
- Adding new fields under `details` for an existing error code, provided the documented ones still appear when relevant.
- Improving precision of any counter (e.g. starting to count cache tokens that were previously rolled into `input_tokens` is breaking; fixing a rounding bug is not, even though totals shift).
- Refinements to the origin-classification heuristic (the per-content-block rule defined in the unit-03 knowledge unit) that produce `by_origin` and `SpendBucket.by_origin` shifts of ≤1% on any given intent's event corpus. The ±1% tolerance exists because the heuristic uses byte-length apportionment for messages that mix origin classes — the derivation is inherently approximate. Shifts exceeding 1% on the same input, or any change to the three-value `origin` enum, are breaking.
- Adding new orchestrator action names to the `by_tick[].action` field. The 13 display anchors named in the field's schema description are Stable; new action strings beyond that set arrive without bumping major and consumers must render them as 'other'.
- Changes to `events[]` (Experimental), the `analyzeTokenSpend()` export (Internal), or the human-readable `message` string (best-effort).

### Deprecation policy

Deprecated fields stay in the response, with their documented semantics, for one full major version after the deprecation lands in `CHANGELOG.md`. The release notes name the field, the replacement, and the removal version. Experimental fields skip this — they may be removed in any minor release once they've been documented as Experimental for at least one minor cycle.

## Stability Tiers

- **Stable** — full semver guarantees per the policy above.
  - The tool name `haiku_token_spend`.
  - All required output fields, including `by_tick` and `by_origin`.
  - All `SpendBucket` counters and `message_count`. `SpendBucket.by_origin` is Stable-as-optional (adding it was non-breaking; removing it would be).
  - All `by_tick[]` required fields (`tick_number`, `action`, `started_at`, `spend`).
  - The 13 Stable display anchor values for `by_tick[].action` (see schema description).
  - The three-value `by_origin[].origin` enum (`user`, `agent`, `engine`).
  - All error codes listed in the Stable table.
  - The `dispatch_id` derivation.
  - The model-family normalization rule.
  - The skill name `/haiku:burn`.
  - The SPA route `/intents/{slug}/burn` and the export routes `/intents/{slug}/burn.json`, `/intents/{slug}/burn.md`.
  - All four `coverage` counters: `events_parsed`, `events_skipped_unparseable`, `events_skipped_no_usage`, `events_skipped_duplicate`. All four are required and form a partition invariant: their sum equals `total_lines_read` for any input.
  - The "first occurrence wins" dedup rule: the first event with a given `(session_id, message_id, request_id)` fingerprint is counted; subsequent occurrences are counted in `events_skipped_duplicate`. This rule, combined with lexicographic file-list ordering, is load-bearing for the byte-identity guarantee from unit-04.
  - The lexicographic file-list ordering: parent session files sorted lexicographically under `~/.claude/projects/<project_slug>/`; subagent files sorted lexicographically per `subagents/` directory. Required to make `events_skipped_duplicate` deterministic across runs.
- **Experimental** — opt-in only, may change without a major bump.
  - `include_raw_events` input + `events[]` output.
  - Any future field guarded by a similar opt-in flag.
- **Internal** — not part of the public contract; consumers must not depend on.
  - The `analyzeTokenSpend()` TypeScript export.
  - The `_session_context` arg injected by the hook.
  - Console-error log lines and Sentry breadcrumbs the tool emits.
  - The on-disk jsonl format (owned by Claude Code, not by H·AI·K·U).

## Boundary Notes (cross-cutting context, sibling axes)

- **SPA and skill delivery layer.** `haiku_token_spend` is consumed by the `/haiku:burn` skill (defined in unit-01), which opens a SPA at the Stable route `/intents/{slug}/burn` served by the existing review-UI Fastify instance. The tool's `structuredContent` is the rendering source — the SPA does not make a second HTTP request for data. Two companion routes carry Stable path contracts and re-call `haiku_token_spend` server-side: `GET /intents/{slug}/burn.json` (verbatim outputSchema as UTF-8 JSON, `Content-Disposition: attachment`) and `GET /intents/{slug}/burn.md` (Markdown export per unit-04). Adding new query-string filters to these routes is non-breaking. Renaming the routes is breaking. The export-format contracts and round-trip determinism live in unit-04.
- **Source-format coupling.** The on-disk jsonl format at `~/.claude/projects/<slug>/*.jsonl` is owned by Claude Code, not by this library. The contract above intentionally exposes counters with stable names (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) chosen to survive plausible upstream renames; the parser layer maps from whatever the harness writes to these stable names. *Depends on the data-model artifact to fix the parser-side schema.*
- **Dispatch metadata flow.** Stage / hat / unit / bolt attribution depends on metadata recorded at Task dispatch time; today those values exist in `subagent-prompt-file.ts`'s tmpfile naming (`{unit}-{hat}-{bolt}.prompt.md`) and in the `_session_context` the inject-state-file hook injects into MCP calls. Whether attribution travels via the prompt-file path, the parent session jsonl's tool_use record, or a sidecar metadata file is *out of scope for this artifact* — the contract just says these four fields appear on `by_subagent` rows when reconstructible, null otherwise.
- **Performance / caching.** Whether the analyzer streams jsonl files or memoizes a digest is a non-functional / data-model concern. The output contract is the same either way.
- **Auth / privacy.** No new auth surface. The tool reads files the running MCP process can already read (its own `~/.claude/projects/` directory). This is consistent with every other `haiku_*` tool.
