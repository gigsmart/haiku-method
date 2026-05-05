---
artifact: pricing-table
stage: inception
intent: intent-token-spend-analysis
scope: intent
unit: unit-06-pricing-table
---

# Pricing Table — Research & Contract

## Why this artifact exists

The discovery artifact established two non-negotiable constraints: the pricing table ships as data (checked-in JSON), and there are no runtime network calls. This artifact distills the researcher's findings on those constraints into a pinned contract that the development stage can implement without re-deriving decisions.

## Upstream source: LiteLLM

The canonical upstream is [`model_prices_and_context_window.json`](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) in the BerriAI/litellm repository. LiteLLM is the industry reference for per-model token pricing across providers — ccusage and virtually every Claude token-spend tool in the ecosystem that derives dollar costs either fetches this file on demand or vendors a snapshot of it.

We do not redistribute the full table. We vendor a curated subset: only Anthropic models (Claude Opus, Sonnet, Haiku families, plus their named generation aliases). This keeps the file small, the resync diff readable, and scope clear.

## On-disk contract

**Path:** `packages/haiku/src/pricing/model_prices.json`

New directory. No existing file. The path is **Internal** (not consumer-facing) — the development stage may relocate it as long as the analyzer import is updated.

**Bundling:** ESM static import in `packages/haiku/src/token-spend.ts`:
```ts
import PRICES from "./pricing/model_prices.json" with { type: "json" }
```

esbuild inlines this at build time into `plugin/bin/haiku.mjs` via `packages/haiku/scripts/build-mcp.mjs`. No separate bundle step needed — esbuild handles JSON imports natively.

**Refresh cadence:** manual. A maintainer diffs Anthropic entries from upstream, updates the curated file, runs the schema-validity gate, ships it in the next plugin release. No automated refresh job in v1.

## Per-entry schema

Keys are `model_id_raw` — the exact string Claude Code writes into the jsonl `model` field. Required fields:

```json
{
  "<model_id_raw>": {
    "input_cost_per_token": <number, USD per token>,
    "output_cost_per_token": <number, USD per token>,
    "cache_creation_input_token_cost": <number, USD per token>,
    "cache_read_input_token_cost": <number, USD per token>,
    "litellm_provider": "anthropic"
  }
}
```

The four cost-field names are **LiteLLM-verbatim**. Using upstream names makes resync purely additive — no rename mapping in our code. Additional LiteLLM fields (e.g. `max_tokens`, `max_input_tokens`) are allowed in the file and ignored by the analyzer.

### Anthropic cache pricing ratios (as of 2026-05)

Per [Anthropic's pricing page](https://www.anthropic.com/pricing):
- Cache writes: ~1.25× the base input rate
- Cache reads: ~0.1× the base input rate

The discovery artifact flags this explicitly: reporting "input tokens" without splitting cache buckets misstates spend by **5–10× in cache-heavy workflows**. The four-bucket split is non-negotiable.

### Model IDs to include at minimum

At minimum, the curated table must include entries for the three current model families. Representative raw IDs as Claude Code writes them (verify against LiteLLM upstream at refresh time):

- `claude-opus-4-7` (and any named generation aliases in active use)
- `claude-sonnet-4-6` (and any named generation aliases in active use)
- `claude-haiku-4-5-20251001` (and any named generation aliases in active use)

The schema-validity gate enforces prefix presence for all three families at test time (see Quality Gates below).

## Load semantics

At each per-event accounting step inside `analyzeTokenSpend()`:

```
entry = PRICES[event.model_id_raw]
if entry:
  dollars = event.input_tokens        * entry.input_cost_per_token
          + event.output_tokens       * entry.output_cost_per_token
          + event.cache_creation_...  * entry.cache_creation_input_token_cost
          + event.cache_read_...      * entry.cache_read_input_token_cost
else:
  dollars = null  (miss — see Fallback)
```

Dollar contributions are summed into the same buckets as token counts (totals, by_stage, by_hat, by_subagent, by_model, by_tick, by_origin) as a future optional field `dollars_usd?: number` on `SpendBucket`. **This unit does NOT add `dollars_usd` to the api-surface schema** — that lands in a future intent that pins SPA rendering of dollar figures. This artifact only pins the pricing-table contract so the analyzer can compute them without schema changes downstream.

The model-family normalization rule (`opus | sonnet | haiku | <raw>`) used by `by_model[]` is **independent** of pricing. Pricing is keyed on `model_id_raw`; family normalization is a display concern. Do not conflate them.

## Fallback behavior (Stable)

When `model_id_raw` is not in the table:
- Token counts are reported normally — every other field is unaffected.
- `dollars_usd` (when implemented) is `null`, not `0`. The distinction matters: `null` = "we couldn't price this"; `0` = "this cost nothing". Conflating them masks coverage gaps.
- A diagnostic counter `coverage.events_skipped_pricing: integer` (additive, not in api-surface yet) records unpriceable events so the user can decide whether to refresh the table.
- The tool **NEVER** throws or returns `isError: true` due to a missing pricing entry. Pricing is best-effort. Token attribution is the contract.

## No-network-at-runtime invariant (Stable)

`analyzeTokenSpend()` MUST NOT make HTTP calls. The bundled JSON is the only pricing source at runtime. Future enhancements (network-fetched override, user-supplied `HAIKU_PRICING_PATH`) are explicitly out of scope for v1 and must not be implemented speculatively.

## Ecosystem validation

Every credible tool in the Claude token-spend space (ccusage, claude-code-usage, Claude Code Costs, claude-code-tokenizer) reads the same `~/.claude/projects/*.jsonl` corpus. ccusage fetches LiteLLM's pricing table on demand; we differ only in that we vendor a curated snapshot rather than fetching at runtime — consistent with the no-network-at-runtime non-goal. The field names we use (`input_cost_per_token`, `output_cost_per_token`, `cache_creation_input_token_cost`, `cache_read_input_token_cost`) are LiteLLM's own names, validated against the upstream file.

## Quality gates (for development stage)

Three gates target named test files. The development stage authors these tests:

| Gate name | Command | What it covers |
|---|---|---|
| `pricing-table-schema-valid` | `bun test packages/haiku/test/pricing-table-schema.test.mjs` | (a) every entry has the four required cost fields with numeric values; (b) `litellm_provider === "anthropic"` for every entry; (c) at least one entry per family prefix (`claude-opus-*`, `claude-sonnet-*`, `claude-haiku-*`) |
| `pricing-table-bundled` | `node -e "const m = require('./plugin/bin/haiku.mjs'); ..."` | Indirect proof that esbuild inlined the JSON — a known model lookup succeeds without a file-system read at runtime |
| `pricing-no-network-at-runtime` | `bun test packages/haiku/test/pricing-no-network.test.mjs` | Runs `analyzeTokenSpend()` with the network deny-listed at the test runner level; must complete without any HTTP calls |

## Stability classification

| Surface | Tier | Rationale |
|---|---|---|
| `packages/haiku/src/pricing/model_prices.json` path | Internal | Relocatable; not consumer-facing |
| Four cost-field names in per-entry schema | Stable (table format) | LiteLLM-verbatim; renaming breaks upstream resync |
| `litellm_provider: "anthropic"` constraint | Stable (table format) | Scope enforcement; removing it opens non-Anthropic entries accidentally |
| `model_id_raw` as key convention | Stable (table format) | Must match Claude Code jsonl `model` field exactly |
| Fallback: `null` vs `0`, never throw | Stable | Consumers depending on `dollars_usd` require consistent null semantics |
| No-network-at-runtime | Stable | Load-bearing for discovery non-goal |

## Open questions (with proposed defaults)

1. **Per-environment override (`HAIKU_PRICING_PATH=...`)?** — No in v1. Adds a config surface and a permission concern for reading arbitrary JSON. Veto-able.
2. **Non-Anthropic entries?** — No. Discovery non-goal: "not multi-project / not cross-provider." The table is Anthropic-only by design. Veto-able.
