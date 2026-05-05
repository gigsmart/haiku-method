---
title: Exportable report — JSON and Markdown
model: sonnet
depends_on:
  - unit-01-burn-skill-and-spa
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: pending
---
# Exportable report — JSON and Markdown

The SPA from unit-01 is the live view. This unit pins the export contract: the report must be downloadable in two formats so it can be (a) sent to a human teammate as a portable artifact, and (b) re-fed into the H·AI·K·U agent's context as input for routing-optimization decisions.

## Two export formats

### JSON (machine-grade)

- File name: `haiku-burn-{slug}-{ISO8601}.json`.
- Body: the verbatim `structuredContent` returned by `haiku_token_spend` — same schema as the api-surface `outputSchema` (including `by_tick`, `by_origin`, and any future top-level breakdowns added under the same Semver Policy).
- Encoding: UTF-8, two-space indented (matching the existing `JSON.stringify(value, null, 2)` convention used elsewhere in the package — never minified, since the export is meant to be human-readable AND machine-readable).
- No transformation, no field stripping. The export is the contract response, on disk.

### Markdown (human + agent-grade)

- File name: `haiku-burn-{slug}-{ISO8601}.md`.
- Structure: one section per top-level breakdown in the api-surface response, in this order: header (intent slug, window, coverage banner), totals card, by_origin, by_tick, by_stage, by_hat, by_subagent, by_model.
- Each breakdown renders as a Markdown table with one row per item and columns matching the `SpendBucket` shape (input, output, cache_create, cache_read, total, message_count).
- The header carries enough metadata that the export stands alone — intent slug, project slug, window bounds, coverage diagnostic — so a reader (or an agent re-ingesting the file) doesn't need to infer context.
- The Markdown is intentionally pasteable back into a Claude Code conversation: the agent reads the file via `Read`, reasons about it directly, and can use it as input for routing decisions.

## Where exports live

- The SPA from unit-01 grows two download buttons in its header — "Export JSON" and "Export Markdown" — that trigger a browser download (no server round-trip; both formats are computable client-side from the cached response).
- The export server-side: a parallel pair of routes on the same Fastify server — `GET /intents/{slug}/burn.json` and `GET /intents/{slug}/burn.md` — that re-call `haiku_token_spend` and serve the result with the appropriate `Content-Type` and `Content-Disposition: attachment`. This lets `curl` + `wget` work without touching the SPA, useful for shell-based handoff.
- No persistence. Exports are computed on demand. The SPA does not write a copy to disk; the user/agent saves the download where they want it.

## Re-ingestion contract and determinism

The exports are designed for diff-based comparison across runs (e.g. a future `/haiku:burn-compare a.json b.json` skill). For diffing to work, the byte-identity guarantee must be precisely scoped — broad determinism claims that the schema cannot uphold are spec gaps.

**Byte-identity guarantee — what is and isn't covered:**

- **Covered (deterministic on the same input):** every field whose value is read directly from a stored jsonl record — all `SpendBucket` fields (the four token counters + `total_tokens` + `message_count`), all `by_origin[]` aggregates, the `coverage` diagnostics, all `by_tick[].started_at` and `ended_at` values (read from `haiku.jsonl` event timestamps which are stored at write time, not recomputed at analysis time).
- **Covered (deterministic via pinned ordering):** `by_tick[]` ordered by `tick_number` ascending; `by_stage[]` and `by_hat[]` ordered by first-observation order from the action-log; `by_subagent[]` ordered by `dispatch_id` lexicographic; `by_model[]` ordered by `total_tokens` descending. Any change to these orderings is a breaking change to the export-byte-identity guarantee. JSON object key ordering follows `JSON.stringify(value, null, 2)` insertion order (V8-stable in the supported Node 20+ runtime).
- **Not covered (export-only metadata):** the file-name's ISO 8601 timestamp suffix is wall-clock at export time (it's the only place wall-clock leaks in). The body never contains a wall-clock generation timestamp — diffing JSON exports compares bodies, not file names.

**Quality-gate enforcement:** a unit test in `packages/haiku/test/token-spend-determinism.test.mjs` calls `analyzeTokenSpend()` twice on a fixture-set of jsonl files and asserts byte-equality of `JSON.stringify(a, null, 2) === JSON.stringify(b, null, 2)`. The execute phase MUST author this test before completing the unit; without it, the byte-identity claim is documentation-only.

## Stability tier

- File-name template `haiku-burn-{slug}-{ISO8601}.{ext}`: **Stable**. Renaming the prefix (e.g. to `haiku-spend-…`) is breaking because shell scripts that glob over the directory rely on the prefix.
- JSON export body schema: **Stable** — defined to be the verbatim `outputSchema`, so it inherits api-surface's stability tier.
- Markdown export section ordering and table column ordering: **Stable**. Adding new sections at the end is non-breaking; reordering existing ones is breaking (visual diffs and screen-reader navigation expectations).
- Array-item ordering rules listed under §"Re-ingestion contract and determinism": **Stable**. Any change is breaking.
- The route paths `/intents/{slug}/burn.json` and `/intents/{slug}/burn.md`: **Stable** (also reflected in api-surface §Stability Tiers).
- The download button labels in the SPA header: **not** Stable (UI copy is iterable).

## Open questions

- Should there be a third format — CSV — for the `by_*` tables specifically (one CSV per breakdown)? **Proposed default:** no in v1; one of the explicit non-goals in the discovery artifact is "not a spreadsheet exporter". A consumer who needs CSV can derive it from the JSON in three lines. Veto-able.
- Should the Markdown export be uploaded automatically to a shareable URL (gist, S3, etc.) when the user requests it? **Proposed default:** no — uploads are out-of-band, surface-specific, and would introduce auth surface area this tool explicitly avoids (api-surface §Auth / privacy). Veto-able.
- Should re-ingestion of the JSON export trigger a special agent behavior (e.g. "compare to current intent's spend and highlight regressions")? **Proposed default:** no in v1 — that's a separate skill (`/haiku:burn-compare`); shipping it now muddies this intent's scope. Veto-able.

## Completion criteria

- §"Two export formats" specifies the file name template, body content, and encoding rule for each format.
- §"Where exports live" names the SPA buttons, the two server routes (`GET /intents/{slug}/burn.json` and `.md`), and the no-persistence rule.
- §"Re-ingestion contract and determinism" precisely scopes the byte-identity guarantee — what is covered, what is covered via pinned ordering, what is NOT covered (file-name wall-clock). Names the array-ordering rules per breakdown. Names the test file path that enforces the guarantee.
- §"Stability tier" classifies the file-name template, body schemas, route paths, section ordering, and array-item ordering with one-line rationale per call.
- §"Open questions" lists every deferred decision with proposed default or `(needs human escalation)`.
