---
title: Bundled pricing table contract
model: sonnet
inputs:
  - intent.md
  - knowledge/API-SURFACE.md
  - knowledge/DISCOVERY.md
status: active
bolt: 1
hat: verifier
started_at: '2026-05-05T13:49:48Z'
hat_started_at: '2026-05-05T13:55:01Z'
iterations:
  - hat: researcher
    started_at: '2026-05-05T13:49:48Z'
    completed_at: '2026-05-05T13:52:08Z'
    result: advance
  - hat: api-architect
    started_at: '2026-05-05T13:52:08Z'
    completed_at: '2026-05-05T13:53:41Z'
    result: advance
  - hat: distiller
    started_at: '2026-05-05T13:53:41Z'
    completed_at: '2026-05-05T13:55:01Z'
    result: advance
  - hat: verifier
    started_at: '2026-05-05T13:55:01Z'
    completed_at: null
    result: null
---
# Bundled pricing table contract

The discovery artifact pins two requirements about pricing: the table ships as data (a JSON file checked into the repo), structured like LiteLLM's `model_prices_and_context_window.json` so we can resync from upstream cleanly; and there are no runtime network calls — the tool must be answerable with files on disk only. This unit pins the on-disk shape, load semantics, and fallback behavior so dollar-equivalent fields can be computed when the api-surface schema later grows them.

## On-disk location and bundling

- **Path:** `packages/haiku/src/pricing/model_prices.json`. New directory; no existing file at that path.
- **Source:** a curated subset of LiteLLM's [`model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) — only Anthropic models (Opus, Sonnet, Haiku, named generation aliases). Curation is manual at refresh time; we do not redistribute the entire upstream table.
- **Bundling:** ESM static import at the top of `packages/haiku/src/token-spend.ts` (`import PRICES from "./pricing/model_prices.json" with { type: "json" }`). The file is inlined into `plugin/bin/haiku.mjs` by esbuild during the existing `bun run build` (`packages/haiku/scripts/build-mcp.mjs`). No separate bundle step.
- **Refresh cadence:** manual. A maintainer pulls upstream, diffs Anthropic entries, updates the curated file, runs the schema-validity gate, ships it in the next plugin release. There is no automated refresh job in v1.

## Per-entry schema

Every entry in `model_prices.json` has at minimum these fields (additional LiteLLM fields are allowed but ignored by this tool):

```json
{
  "<model_id_raw>": {
    "input_cost_per_token": <number, USD>,
    "output_cost_per_token": <number, USD>,
    "cache_creation_input_token_cost": <number, USD>,
    "cache_read_input_token_cost": <number, USD>,
    "litellm_provider": "anthropic"
  }
}
```

`model_id_raw` is the exact string Claude Code writes into the jsonl `model` field (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). The four cost fields use the LiteLLM names verbatim — keeping these names makes upstream syncs purely additive/curative, no rename mapping in our code.

The model-family normalization rule from api-surface (`opus | sonnet | haiku | <raw>`) is INDEPENDENT of pricing — pricing is per-`model_id_raw` because Anthropic publishes per-snapshot pricing.

## Load semantics

- **Lookup:** at the per-event accounting step, the analyzer looks up `PRICES[event.model_id_raw]`. A miss is non-fatal (see Fallback below).
- **Per-event dollar derivation:** for each event with usage `{ input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }`, the dollar contribution is `input * input_cost_per_token + output * output_cost_per_token + cache_creation * cache_creation_input_token_cost + cache_read * cache_read_input_token_cost`. Anthropic's published pricing splits cache writes (typically 1.25× input) and cache reads (typically 0.1× input); reporting "input tokens" without splitting cache buckets misstates spend by 5–10× in cache-heavy workflows, per the discovery artifact.
- **Aggregation:** dollar contributions are summed into the same buckets as token counts (totals, by_stage, by_hat, by_subagent, by_model, by_tick, by_origin) and surfaced as a future optional field on `SpendBucket` — `dollars_usd?: number`. This unit does NOT add the field to the api-surface schema (deferred to a future intent that pins how dollars surface in the SPA); it pins ONLY the pricing-table contract so the analyzer can compute them when the schema grows.

## Fallback behavior

When `model_id_raw` is not present in the table:
- The token counts are reported normally (every other field is unaffected).
- The would-be `dollars_usd` field, when implemented, is `null` (NOT zero — null distinguishes "we couldn't price this" from "this cost zero").
- A diagnostic counter `coverage.events_skipped_pricing: integer` (additive, not in api-surface yet — will land with the dollars-surface intent) records how many events couldn't be priced. The user can then decide whether to update the table.
- The tool NEVER throws or returns `isError: true` due to missing pricing. Pricing is best-effort; token attribution is the contract.

## No-network-at-runtime invariant

The `analyzeTokenSpend()` function MUST NOT make HTTP calls. The pricing table is the only pricing source at runtime. A future enhancement (network-fetched pricing override, user-supplied pricing path) is explicitly out of scope for this unit.

## Quality gates

```yaml
quality_gates:
  - name: pricing-table-schema-valid
    command: bun test packages/haiku/test/pricing-table-schema.test.mjs
  - name: pricing-table-bundled
    command: node -e "const m = require('./plugin/bin/haiku.mjs'); /* indirect proof bundle includes pricing data via a known model lookup */"
  - name: pricing-no-network-at-runtime
    command: bun test packages/haiku/test/pricing-no-network.test.mjs
```

The test file `packages/haiku/test/pricing-table-schema.test.mjs` (authored in development stage) covers: (a) every entry has the four required cost fields with numeric values, (b) `litellm_provider` is `"anthropic"` for every entry (catches accidental copy-paste of non-Anthropic entries), (c) at least the three current model families have entries (`claude-opus-*`, `claude-sonnet-*`, `claude-haiku-*` prefix presence). The `pricing-no-network.test.mjs` test runs `analyzeTokenSpend()` against a fixture with the network deny-listed at the test runner level.

## Stability tier

- The on-disk path `packages/haiku/src/pricing/model_prices.json`: **Internal** — moving the file is fine as long as the analyzer is updated. Not consumer-facing.
- The per-entry schema (the four cost-field names): **Stable for the table format** because the names are LiteLLM-compatible and renaming them breaks resync workflows.
- The fallback rule (`null` for missing models, never throw): **Stable** — consumers eventually depending on `dollars_usd` need this rule to remain consistent.
- The no-network-at-runtime invariant: **Stable** — load-bearing for the discovery non-goal "no runtime network calls".

## Open questions

- Should the pricing table support a per-environment override (e.g. `HAIKU_PRICING_PATH=...`)? **Proposed default:** no in v1 — adds a config surface and a permission concern for code reading arbitrary JSON. Veto-able.
- Should we extend the table with non-Anthropic entries to support hypothetical future cross-provider analysis? **Proposed default:** no — discovery non-goal "not multi-project / not cross-provider"; the table is Anthropic-only by design. Veto-able.

## Completion criteria

- §"On-disk location and bundling" names the file path, the upstream source, the bundling mechanism, and the refresh-cadence policy.
- §"Per-entry schema" specifies the four required cost fields plus `litellm_provider` and pins the `model_id_raw`-as-key convention.
- §"Load semantics" describes the lookup, the per-event dollar derivation, and the aggregation surface (deferred from this unit's scope but consistent with the future schema growth).
- §"Fallback behavior" pins the null-vs-zero distinction and the never-throw invariant.
- §"No-network-at-runtime invariant" is explicit.
- §"Quality gates" lists three executable gate commands targeting named test files.
- §"Stability tier" classifies path, schema, fallback, no-network with rationale.
- §"Open questions" lists deferred decisions with proposed defaults.
