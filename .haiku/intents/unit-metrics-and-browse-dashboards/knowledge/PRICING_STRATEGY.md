# Pricing Strategy — Source of Truth for Per-Model USD Rates

## Purpose

Every bolt records token counts into its unit file. USD cost is a derived metric computed as `tokens x rate` at write time and persisted alongside the tokens. For that number to be trustworthy, reproducible, and still interpretable a year from now, the rate source needs to be: committed to the repo, versioned, offline-readable, and unambiguous about which snapshot was used. This document answers where that data lives, how it is shaped, how it is versioned, and how the system behaves when a model ID is unknown.

## Recommendation

**Store pricing as a checked-in JSON file at `plugin/pricing.json`, committed to the repo and shipped with the plugin.** This is the single source of truth. Metrics capture reads it synchronously at bolt-advance time, resolves the caller's `model_id` to the matching entry, stamps the entry's `effective_date` onto the bolt's metrics block as `pricing_version`, and computes cost. No network, no operator config, no ambient state.

### Alternatives considered and discarded

**Runtime fetch from the Anthropic pricing API / pricing page.** Rejected. Bolts must run offline and deterministically — a flaky network request, a rate limit, or a page-scrape regression silently corrupts every downstream cost estimate. Reproducibility dies the moment the upstream page changes wording. And a cost recorded today must still match the cost that the bolt *actually* cost back when it ran; pulling "current" prices later would rewrite history. Git is already the versioning mechanism we need — no reason to add a second one over HTTP.

**Operator-provided config (e.g., `~/.haiku/pricing.json` or an env var).** Rejected. This moves the answer off the repo and into each operator's machine, which defeats the entire premise of the metrics dashboards: cross-operator comparability. Two engineers looking at the same intent's cost would see different numbers depending on whose pricing file they happened to have. Operator UX also suffers — every new contributor would have to hand-seed a file before metrics start working. Pricing is not an operator preference; it's a fact about the world that belongs in the same commit as the code that consumes it.

**Hardcoded constants in TypeScript (e.g., `const PRICING = {...}` in `state-tools.ts`).** Rejected. It works, but it fuses a slowly-changing data table into compiled code, forcing a full plugin version bump for every rate update. JSON in the same directory gives us the same reproducibility (git-tracked, shipped with the plugin) with none of the coupling, and it keeps the update path cleanly editable by non-TypeScript contributors.

The checked-in JSON wins on every axis that matters: reproducibility (the commit hash pins the rates), offline use (no network), versioning (git history + `effective_date` per row), and operator UX (zero setup, one file to edit for updates).

## Schema

`plugin/pricing.json` is a JSON object with a top-level `models` array. Each entry describes one Claude model ID and its rates.

```json
{
  "$schema": "./schemas/pricing.schema.json",
  "currency": "USD",
  "updated_at": "2026-04-14",
  "models": [
    {
      "model_id": "claude-opus-4",
      "input_per_mtok_usd": 15.00,
      "output_per_mtok_usd": 75.00,
      "cache_read_per_mtok_usd": 1.50,
      "cache_creation_per_mtok_usd": 18.75,
      "currency": "USD",
      "effective_date": "2026-04-14",
      "source_url": "https://www.anthropic.com/pricing"
    }
  ]
}
```

### Field definitions

| Field | Type | Required | Meaning |
|---|---|---|---|
| `model_id` | string | yes | The exact model identifier that appears in the Claude Code transcript (e.g., `claude-opus-4`, `claude-sonnet-4-5`). This is the lookup key. |
| `input_per_mtok_usd` | number | yes | USD price per 1,000,000 input tokens (uncached). |
| `output_per_mtok_usd` | number | yes | USD price per 1,000,000 output tokens. |
| `cache_read_per_mtok_usd` | number | yes | USD price per 1,000,000 tokens read from prompt cache. |
| `cache_creation_per_mtok_usd` | number | yes | USD price per 1,000,000 tokens written to prompt cache (5-minute TTL entry). |
| `currency` | string | yes | ISO 4217 currency code. Always `USD` today; carried per-entry to keep the schema honest if that ever changes. |
| `effective_date` | string (`YYYY-MM-DD`) | yes | The date this rate row became accurate. Doubles as the `pricing_version` stamp on bolts. |
| `source_url` | string (URL) | yes | Public URL the rate was sourced from. Must be citeable by a human reviewer. |

All rates are denominated in USD per 1 million tokens (MTok), matching Anthropic's public pricing-page convention. This avoids floating-point noise on per-token math — a bolt that burned 12,345 input tokens on Opus 4 computes as `(12345 / 1_000_000) * 15.00 = 0.1852 USD`.

## Seed pricing table

Ten model IDs are covered below. Rates are pulled from Anthropic's public pricing page. Any rate I was not 100% sure of at the time of writing is marked `TBD — verify at source_url` and must be filled in by the operator updating `plugin/pricing.json` before the dashboards go live. Do not guess.

```json
{
  "currency": "USD",
  "updated_at": "2026-04-14",
  "models": [
    {
      "model_id": "claude-opus-4",
      "input_per_mtok_usd": 15.00,
      "output_per_mtok_usd": 75.00,
      "cache_read_per_mtok_usd": 1.50,
      "cache_creation_per_mtok_usd": 18.75,
      "currency": "USD",
      "effective_date": "2025-05-22",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-opus-4-1",
      "input_per_mtok_usd": 15.00,
      "output_per_mtok_usd": 75.00,
      "cache_read_per_mtok_usd": 1.50,
      "cache_creation_per_mtok_usd": 18.75,
      "currency": "USD",
      "effective_date": "2025-08-05",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-sonnet-4",
      "input_per_mtok_usd": 3.00,
      "output_per_mtok_usd": 15.00,
      "cache_read_per_mtok_usd": 0.30,
      "cache_creation_per_mtok_usd": 3.75,
      "currency": "USD",
      "effective_date": "2025-05-22",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-sonnet-4-5",
      "input_per_mtok_usd": 3.00,
      "output_per_mtok_usd": 15.00,
      "cache_read_per_mtok_usd": 0.30,
      "cache_creation_per_mtok_usd": 3.75,
      "currency": "USD",
      "effective_date": "2025-09-29",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-haiku-4",
      "input_per_mtok_usd": "TBD — verify at source_url",
      "output_per_mtok_usd": "TBD — verify at source_url",
      "cache_read_per_mtok_usd": "TBD — verify at source_url",
      "cache_creation_per_mtok_usd": "TBD — verify at source_url",
      "currency": "USD",
      "effective_date": "TBD",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-haiku-4-5",
      "input_per_mtok_usd": 1.00,
      "output_per_mtok_usd": 5.00,
      "cache_read_per_mtok_usd": 0.10,
      "cache_creation_per_mtok_usd": 1.25,
      "currency": "USD",
      "effective_date": "2025-10-15",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-3-5-sonnet-20241022",
      "input_per_mtok_usd": 3.00,
      "output_per_mtok_usd": 15.00,
      "cache_read_per_mtok_usd": 0.30,
      "cache_creation_per_mtok_usd": 3.75,
      "currency": "USD",
      "effective_date": "2024-10-22",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-3-5-haiku-20241022",
      "input_per_mtok_usd": 0.80,
      "output_per_mtok_usd": 4.00,
      "cache_read_per_mtok_usd": 0.08,
      "cache_creation_per_mtok_usd": 1.00,
      "currency": "USD",
      "effective_date": "2024-10-22",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-3-opus-20240229",
      "input_per_mtok_usd": 15.00,
      "output_per_mtok_usd": 75.00,
      "cache_read_per_mtok_usd": 1.50,
      "cache_creation_per_mtok_usd": 18.75,
      "currency": "USD",
      "effective_date": "2024-02-29",
      "source_url": "https://www.anthropic.com/pricing"
    },
    {
      "model_id": "claude-3-haiku-20240307",
      "input_per_mtok_usd": 0.25,
      "output_per_mtok_usd": 1.25,
      "cache_read_per_mtok_usd": 0.03,
      "cache_creation_per_mtok_usd": 0.30,
      "currency": "USD",
      "effective_date": "2024-03-07",
      "source_url": "https://www.anthropic.com/pricing"
    }
  ]
}
```

**Source:** All rates cite `https://www.anthropic.com/pricing` — the canonical public pricing page. When updating `plugin/pricing.json`, the person doing the update is on the hook to verify each row against that page on the commit date and to fill in any `TBD` cells. The git commit is the audit trail.

**On `TBD` entries:** `claude-haiku-4` is listed because the task spec asks for it, but I will not fabricate a rate I'm not confident in. The row stays in the file as a placeholder so the unknown-model fallback does not fire spuriously, and the operator applying this strategy fills the numbers before shipping.

## Versioning — how `pricing_version` flows to a bolt

The `effective_date` field on each row is the version identifier. It travels with the cost estimate so a number recorded today is still interpretable after the pricing table changes.

The flow:

1. A bolt finishes. The metrics-capture path (scope of a downstream unit) resolves the Claude Code model ID from the transcript — e.g., `claude-sonnet-4-5`.
2. It looks that `model_id` up in `plugin/pricing.json`.
3. It multiplies each token bucket (input / output / cache-read / cache-creation) by the matching `*_per_mtok_usd` rate and sums to a USD total.
4. It writes the result into the bolt's metrics block along with two version stamps:
   - `pricing_version`: the `effective_date` of the row that was used (e.g., `"2025-09-29"`).
   - `pricing_source`: the filename + git commit of `plugin/pricing.json` at the time of the capture, so a reviewer can `git show <sha>:plugin/pricing.json` and reproduce the exact math. (Commit SHA resolution is a downstream concern — this doc only specifies the field.)

Illustrative bolt metrics frontmatter fragment:

```yaml
metrics:
  bolts:
    - bolt: 3
      model_id: claude-sonnet-4-5
      tokens:
        input: 12450
        output: 3210
        cache_read: 48000
        cache_creation: 2100
      cost_usd: 0.0971
      pricing_version: "2025-09-29"
      pricing_source: "plugin/pricing.json@<commit-sha>"
```

When Anthropic changes a rate later, the operator edits `plugin/pricing.json`, bumps the row's `effective_date`, and commits. Old bolts still carry the old `pricing_version` and their USD numbers stay correct for what they were when recorded. New bolts pick up the new row. The dashboards can surface the `pricing_version` as a small caption — `"cost reflects rates from 2025-09-29"` — so an operator reading a year-old intent knows whether to re-price or trust the stamp.

## Unknown-model fallback

**Decision: record tokens only, skip USD cost, and emit a warning.** The bolt succeeds, the metrics block is written, the `tokens` subobject is populated, but `cost_usd` is absent and a `cost_warning` field explains why.

```yaml
metrics:
  bolts:
    - bolt: 7
      model_id: claude-experimental-preview
      tokens:
        input: 1200
        output: 400
      cost_warning: "model_id not found in plugin/pricing.json; tokens recorded, cost omitted"
```

### Why this choice over the alternatives

**Failing the bolt** is too aggressive. A new Claude model ships; suddenly every H·AI·K·U operator using it sees their development phase hard-stop on a metrics-capture error. Metrics are a secondary concern — they must never block the primary work of the bolt. Fail-soft, not fail-loud.

**Recording zero cost** is worse than recording nothing. Zero is a real number; it rolls up into stage totals and into dashboards as if it were accurate. An operator skimming a dashboard would see "this intent cost $0.00" and conclude it was free, when in fact it ran on an unpriced model. Absent data is honest about being absent. Zero data is a quiet lie.

**Tokens-only with a warning** keeps the primary signal (how many tokens did this burn?) intact, keeps the bolt running, and makes the fix obvious: the warning surfaces in the browse dashboard next to the unit, the operator opens `plugin/pricing.json`, adds the row, and future bolts on that model are priced correctly going forward. Old bolts retain their warning field as a historical marker.

## Summary

- Source of truth: `plugin/pricing.json`, checked into the repo.
- Schema: eight fields per model row (`model_id`, four `*_per_mtok_usd` rates, `currency`, `effective_date`, `source_url`).
- Seed: 10 rows covering Opus 4 / 4.1, Sonnet 4 / 4.5, Haiku 4 / 4.5, 3.5 Sonnet, 3.5 Haiku, 3 Opus, 3 Haiku. `claude-haiku-4` rates marked `TBD`.
- Version stamp: each bolt records `pricing_version` = the row's `effective_date`, plus `pricing_source` pointing at the commit.
- Unknown model: record tokens, skip cost, emit `cost_warning`. Never fail the bolt, never fake a zero.
